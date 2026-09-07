import type { Readable, Writable } from "node:stream";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import type {
  AgentActivity,
  AgentConversation,
  AgentSeam,
  DetectedAgent,
} from "./agent";
import { fetchDocsIndex } from "./docs";
import { type ChosenPlacements, parsePlacements } from "./placements";
import {
  inspectWorkingTree,
  summarizeChanges,
  type TreeState,
} from "./preflight";
import {
  feedbackPrompt,
  implementPrompt,
  PLACEHOLDER_PUBLISHER_KEY,
  PUBLISHER_KEYS_URL,
  reconPrompt,
} from "./prompts";
import { renderPlan } from "./render";

const PUBLISHER_GUIDE = "https://docs.specify.sh/publishing/get-started";
const FILE_VERBS = {
  create: "Creating",
  delete: "Deleting",
  modify: "Editing",
} as const;

export interface WizardOptions {
  cwd: string;
  fetchImpl?: typeof fetch;
  input: Readable;
  output: Writable;
  seam: AgentSeam;
  signal?: AbortSignal;
}

interface WizardIo {
  input: Readable;
  output: Writable;
}

interface TurnLabels {
  done: string;
  failed: string;
  start: string;
}

/** Everything a turn needs: who is running it, where, and how to show it. */
interface TurnContext {
  agent: DetectedAgent;
  conversation: AgentConversation;
  io: WizardIo;
  signal: AbortSignal | undefined;
}

/** A plan the developer approved, with the placements they kept. */
interface ApprovedPlan {
  placements: ChosenPlacements;
  plan: string;
}

/** A stop the developer asked for. It ends the run at exit code 0. */
class WizardStop extends Error {}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function answered<Value>(value: Value | symbol): Value {
  if (isCancel(value)) {
    throw new WizardStop("Cancelled. Nothing was changed.");
  }
  return value as Value;
}

function describeAgent(agent: DetectedAgent): string {
  return agent.version ? `${agent.name} ${agent.version}` : agent.name;
}

function describeActivity(activity: AgentActivity): string {
  return activity.kind === "tool"
    ? `Running ${activity.name}`
    : `${FILE_VERBS[activity.change]} ${activity.path}`;
}

async function chooseAgent(
  agents: DetectedAgent[],
  io: WizardIo
): Promise<DetectedAgent> {
  const [only] = agents;
  if (agents.length === 1 && only) {
    log.info(`Using ${describeAgent(only)}.`, io);
    return only;
  }
  return answered(
    await select<DetectedAgent>({
      message: "Which coding agent should add the SDK?",
      options: agents.map((agent) => ({
        label: describeAgent(agent),
        value: agent,
      })),
      ...io,
    })
  );
}

function treeWarning(tree: TreeState): string | null {
  if (tree.kind === "dirty") {
    const files =
      tree.changedFiles === 1
        ? "1 changed file"
        : `${tree.changedFiles} changed files`;
    return `This working tree has ${files}. The agent is about to edit files, and its changes will mix with yours.`;
  }
  if (tree.kind === "not-a-repo") {
    return "This directory is not a Git repository. The agent is about to edit files, and there will be no diff to review afterwards and no way to undo them.";
  }
  return null;
}

async function confirmTree(tree: TreeState, io: WizardIo): Promise<void> {
  const warning = treeWarning(tree);
  if (!warning) {
    return;
  }
  log.warn(warning, io);
  const proceed = answered(
    await confirm({ message: "Continue anyway?", ...io })
  );
  if (!proceed) {
    throw new WizardStop("Stopped. Nothing was changed.");
  }
}

async function askPublisherKey(io: WizardIo): Promise<string> {
  note(`Copy a publisher key from ${PUBLISHER_KEYS_URL}`, "Publisher key", io);
  const answer = answered(
    await text({
      defaultValue: "",
      message: "Paste your publisher key, or press Enter to skip",
      placeholder: PLACEHOLDER_PUBLISHER_KEY,
      ...io,
    })
  ).trim();
  if (answer) {
    return answer;
  }
  log.info(
    `Skipped. ${PLACEHOLDER_PUBLISHER_KEY} goes in the env file for you to replace.`,
    io
  );
  return PLACEHOLDER_PUBLISHER_KEY;
}

async function runTurn<Result>(
  context: TurnContext,
  labels: TurnLabels,
  turn: (onActivity: (activity: AgentActivity) => void) => Promise<Result>
): Promise<Result> {
  const { io, signal } = context;
  const progress = spinner({ output: io.output, signal });
  progress.start(labels.start);
  try {
    const result = await turn((activity) =>
      progress.message(describeActivity(activity))
    );
    progress.stop(labels.done);
    return result;
  } catch (error) {
    if (signal?.aborted) {
      progress.cancel("Stopped");
      throw new WizardStop(
        "Stopped. The agent may already have changed files, so check git status.",
        { cause: error }
      );
    }
    progress.error(labels.failed);
    throw error;
  }
}

async function askForPlan(
  context: TurnContext,
  prompt: string
): Promise<string> {
  const reply = await runTurn(
    context,
    {
      done: "Read the project",
      failed: "Could not read the project",
      start: "Reading the project",
    },
    (onActivity) =>
      context.conversation.ask(prompt, {
        onActivity,
        signal: context.signal,
      })
  );
  return reply.trim();
}

/** An empty reply is worth one more ask before the run is a write-off. */
async function planTurn(context: TurnContext, prompt: string): Promise<string> {
  const plan = await askForPlan(context, prompt);
  if (plan) {
    return plan;
  }
  const retried = await askForPlan(context, prompt);
  if (retried) {
    return retried;
  }
  throw new Error(
    `${describeAgent(context.agent)} replied with nothing, twice. Run the wizard again, or set the SDK up by hand: ${PUBLISHER_GUIDE}`
  );
}

async function choosePlacements(
  plan: string,
  io: WizardIo
): Promise<ChosenPlacements> {
  const suggested = parsePlacements(plan);
  if (suggested.length === 0) {
    return { dropped: [], kept: [] };
  }
  const kept = answered(
    await multiselect<string>({
      initialValues: suggested,
      message: "Which of these placements should the agent build?",
      options: suggested.map((label) => ({ label, value: label })),
      required: false,
      ...io,
    })
  );
  return { dropped: suggested.filter((label) => !kept.includes(label)), kept };
}

async function approvePlan(
  context: TurnContext,
  plan: string
): Promise<ApprovedPlan> {
  note(
    `${renderPlan(plan)}\n\nNothing has been changed yet.`,
    "Integration plan",
    context.io
  );
  const placements = await choosePlacements(plan, context.io);
  const decision = answered(
    await select({
      message: "Go ahead with this plan?",
      options: [
        { label: "Approve, make these changes", value: "approve" },
        { label: "Change something first", value: "feedback" },
        { label: "Abort, change nothing", value: "abort" },
      ],
      ...context.io,
    })
  );
  if (decision === "approve") {
    return { placements, plan };
  }
  if (decision === "abort") {
    throw new WizardStop("Aborted. Nothing was changed.");
  }
  const feedback = answered(
    await text({
      defaultValue: "",
      message: "What should the agent do differently?",
      ...context.io,
    })
  ).trim();
  const revised = feedback
    ? await planTurn(context, feedbackPrompt(feedback))
    : plan;
  return await approvePlan(context, revised);
}

async function implement(
  context: TurnContext,
  approved: ApprovedPlan,
  publisherKey: string,
  index: string
): Promise<void> {
  await runTurn(
    context,
    {
      done: "Changes written",
      failed: "Could not finish the changes",
      start: "Adding the SDK",
    },
    (onActivity) =>
      context.conversation.work(
        implementPrompt({
          index,
          placements: approved.placements,
          plan: approved.plan,
          publisherKey,
        }),
        { onActivity, signal: context.signal }
      )
  );
}

async function closeQuietly(
  conversation: AgentConversation,
  io: WizardIo
): Promise<void> {
  try {
    await conversation.close();
  } catch (error) {
    log.warn(
      messageOf(
        error,
        "The coding agent session did not close cleanly. Check that it is not still running."
      ),
      io
    );
  }
}

async function reportChanges(
  cwd: string,
  tree: TreeState,
  io: WizardIo
): Promise<void> {
  if (tree.kind === "not-a-repo") {
    note(
      "This directory is not a Git repository, so there is no diff to show. Read the files the agent touched before you run anything.",
      "Changes",
      io
    );
    return;
  }
  note(await summarizeChanges(cwd), "Changes", io);
}

async function wizard(options: WizardOptions, io: WizardIo): Promise<number> {
  const { cwd, fetchImpl, seam, signal } = options;
  const agents = await seam.detect();
  if (agents.length === 0) {
    log.error(
      `No supported coding agent was found. Install one, or add the SDK by hand with the manual guide: ${PUBLISHER_GUIDE}`,
      io
    );
    return 1;
  }

  const agent = await chooseAgent(agents, io);
  const tree = await inspectWorkingTree(cwd);
  await confirmTree(tree, io);
  const publisherKey = await askPublisherKey(io);
  // Before the first turn, so a network failure costs nothing. A turn that
  // runs without the current API costs minutes and integrates the wrong thing.
  const index = await fetchDocsIndex(fetchImpl);

  const conversation = seam.open(agent, cwd);
  const context: TurnContext = { agent, conversation, io, signal };
  try {
    const approved = await approvePlan(
      context,
      await planTurn(context, reconPrompt(index))
    );
    await implement(context, approved, publisherKey, index);
  } finally {
    await closeQuietly(conversation, io);
  }

  await reportChanges(cwd, tree, io);
  outro("Done. Read the changes, then run your app.", io);
  return 0;
}

/**
 * Runs the whole wizard: detect an agent, plan the integration, and let it
 * make the changes once the developer approves the plan.
 *
 * @param options The agent seam, the project directory, and the streams every
 * prompt reads and writes.
 * @returns The exit code for the caller to use. This never exits the process.
 */
export async function runWizard(options: WizardOptions): Promise<number> {
  const io = { input: options.input, output: options.output };
  intro("Specify publisher SDK wizard", io);
  try {
    return await wizard(options, io);
  } catch (error) {
    if (error instanceof WizardStop) {
      cancel(error.message, io);
      return 0;
    }
    log.error(
      messageOf(
        error,
        "The wizard could not finish. Check your setup and try again."
      ),
      io
    );
    return 1;
  }
}
