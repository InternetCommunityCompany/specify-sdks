import { homedir } from "node:os";
import type {
  AgentActivity,
  AgentConversation,
  AgentSeam,
  DetectedAgent,
} from "./agent";
import { type Docs, fetchDocs } from "./docs";
import { createNarrator } from "./narration";
import {
  type ChosenPlacements,
  PLAN_SCHEMA,
  type Plan,
  placementLabel,
  readPlan,
} from "./plan";
import {
  envFilesWithPlaceholder,
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
import type { Ui } from "./ui/host";
import { WizardCancelled } from "./ui/store";

const PUBLISHER_GUIDE = "https://docs.specify.sh/publishing/get-started";
/** The whole run, laid out before it starts. */
const STEPS = [
  "Choose a coding agent",
  "Check the working tree",
  "Read the project",
  "Review the plan",
  "Write the changes",
] as const;
const AGENT_STEP = 0;
const TREE_STEP = 1;
const READ_STEP = 2;
const REVIEW_STEP = 3;
const WRITE_STEP = 4;
const STOPPED_MID_RUN =
  "Stopped. The agent may already have changed files, so check git status.";

export interface WizardOptions {
  cwd: string;
  fetchImpl?: typeof fetch;
  seam: AgentSeam;
  signal?: AbortSignal;
  ui: Ui;
  verbose?: boolean;
}

/** Everything a turn needs: who is running it, where, and how to show it. */
interface TurnContext {
  agent: DetectedAgent;
  conversation: AgentConversation;
  cwd: string;
  signal: AbortSignal | undefined;
  ui: Ui;
}

/** A plan the developer approved, with the placements they kept. */
interface ApprovedPlan {
  placements: ChosenPlacements;
  plan: Plan;
}

/** A stop the developer asked for. It ends the run at exit code 0. */
class WizardStop extends Error {}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** The chain a verbose run shows, so a wrapped failure names its real cause. */
function causes(error: unknown): string[] {
  const chain: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && current.cause !== undefined) {
    current = current.cause;
    chain.push(
      current instanceof Error
        ? `${current.name}: ${current.message}`
        : String(current)
    );
  }
  return chain;
}

function describeAgent(agent: DetectedAgent): string {
  return agent.version ? `${agent.name} ${agent.version}` : agent.name;
}

/** A path the developer recognises, rather than one that eats the line. */
function shorten(cwd: string): string {
  const home = homedir();
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function contract(ui: Ui, agent: DetectedAgent): void {
  // The name alone: the checklist row above already carries the version.
  ui.note("How this works", [
    `${agent.name} reads this project and the Specify docs, then proposes a plan.`,
    "Nothing is written until you approve that plan.",
    "Approved changes stay uncommitted in your working tree for you to review.",
    `Your code goes to ${agent.name}'s model provider, never to Specify.`,
  ]);
}

async function chooseAgent(
  agents: DetectedAgent[],
  ui: Ui
): Promise<DetectedAgent> {
  const [only] = agents;
  if (agents.length === 1 && only) {
    return only;
  }
  const id = await ui.select(
    "Which coding agent should add the SDK?",
    agents.map((agent) => ({ label: describeAgent(agent), value: agent.id }))
  );
  const chosen = agents.find((agent) => agent.id === id);
  if (!chosen) {
    throw new Error(
      "That coding agent is no longer available. Run the wizard again."
    );
  }
  return chosen;
}

function treeWarning(tree: TreeState): string | undefined {
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
}

async function confirmTree(tree: TreeState, ui: Ui): Promise<string> {
  const warning = treeWarning(tree);
  if (!warning) {
    return "clean";
  }
  ui.warn([warning]);
  if (!(await ui.confirm("Continue anyway?"))) {
    throw new WizardStop("Stopped. Nothing was changed.");
  }
  return tree.kind === "dirty" ? `${tree.changedFiles} changed` : "not a repo";
}

async function runTurn<Result>(
  context: TurnContext,
  step: number,
  title: string,
  turn: (onActivity: (activity: AgentActivity) => void) => Promise<Result>
): Promise<Result> {
  const narrator = createNarrator(context.cwd);
  context.ui.startTask(title);
  try {
    const result = await turn((activity) =>
      context.ui.activity(narrator.take(activity))
    );
    // An agent that ignores the signal still finishes its turn, and going on
    // to the next prompt would ignore a developer who asked to stop.
    if (context.signal?.aborted) {
      context.ui.fail(step, "stopped");
      throw new WizardStop(STOPPED_MID_RUN);
    }
    context.ui.stopTask();
    return result;
  } catch (error) {
    if (error instanceof WizardStop) {
      throw error;
    }
    if (context.signal?.aborted) {
      context.ui.fail(step, "stopped");
      throw new WizardStop(STOPPED_MID_RUN, { cause: error });
    }
    context.ui.fail(step, `stopped after ${narrator.summary()}`);
    throw error;
  }
}

async function askForPlan(
  context: TurnContext,
  step: number,
  prompt: string,
  title: string
): Promise<Plan | undefined> {
  const reply = await runTurn(context, step, title, (onActivity) =>
    context.conversation.ask(prompt, {
      onActivity,
      schema: PLAN_SCHEMA,
      signal: context.signal,
    })
  );
  return readPlan(reply.json);
}

/** A reply that is not a plan is worth one more ask before the run is lost. */
async function planTurn(
  context: TurnContext,
  step: number,
  prompt: string,
  title: string
): Promise<Plan> {
  const plan = await askForPlan(context, step, prompt, title);
  if (plan) {
    return plan;
  }
  const retried = await askForPlan(
    context,
    step,
    prompt,
    `${title} (second attempt)`
  );
  if (retried) {
    return retried;
  }
  context.ui.fail(step, "no plan");
  throw new Error(
    `${describeAgent(context.agent)} did not report a plan, twice. Run the wizard again, or set the SDK up by hand: ${PUBLISHER_GUIDE}`
  );
}

async function choosePlacements(plan: Plan, ui: Ui): Promise<ChosenPlacements> {
  const suggested = plan.placements.map(placementLabel);
  if (suggested.length === 0) {
    return { dropped: [], kept: [] };
  }
  const kept = await ui.multiselect(
    "Which of these placements should the agent build?",
    suggested.map((label) => ({ label, value: label })),
    suggested
  );
  return { dropped: suggested.filter((label) => !kept.includes(label)), kept };
}

async function approvePlan(
  context: TurnContext,
  plan: Plan
): Promise<ApprovedPlan> {
  const decision = await context.ui.review(plan, "Go ahead with this plan?", [
    { label: "Approve, make these changes", value: "approve" },
    { label: "Change something first", value: "feedback" },
    { label: "Abort, change nothing", value: "abort" },
  ]);
  if (decision === "abort") {
    throw new WizardStop("Aborted. Nothing was changed.");
  }
  if (decision === "approve") {
    return { placements: await choosePlacements(plan, context.ui), plan };
  }
  const feedback = (
    await context.ui.text("What should the agent do differently?")
  ).trim();
  const revised = feedback
    ? await planTurn(
        context,
        REVIEW_STEP,
        feedbackPrompt(feedback),
        "Revising the plan"
      )
    : plan;
  return await approvePlan(context, revised);
}

async function implement(
  context: TurnContext,
  approved: ApprovedPlan,
  docs: Docs
): Promise<void> {
  await runTurn(context, WRITE_STEP, "Writing the changes", (onActivity) =>
    context.conversation.work(
      implementPrompt({
        docs,
        placements: approved.placements,
        plan: approved.plan.details,
      }),
      { onActivity, signal: context.signal }
    )
  );
}

async function closeQuietly(
  conversation: AgentConversation,
  ui: Ui
): Promise<void> {
  try {
    await conversation.close();
  } catch (error) {
    ui.warn([
      messageOf(
        error,
        "The coding agent session did not close cleanly. Check that it is not still running."
      ),
    ]);
  }
}

async function reportChanges(
  cwd: string,
  tree: TreeState,
  ui: Ui
): Promise<void> {
  if (tree.kind === "not-a-repo") {
    ui.keep(
      "Changes\nThis directory is not a Git repository, so there is no diff to show. Read the files the agent touched before you run anything."
    );
    return;
  }
  ui.keep(`Changes\n${await summarizeChanges(cwd)}`);
}

async function reportKey(cwd: string, ui: Ui): Promise<void> {
  const files = await envFilesWithPlaceholder(cwd);
  const where =
    files.length > 0
      ? `Replace ${PLACEHOLDER_PUBLISHER_KEY} in ${files.join(" and ")}`
      : `Replace ${PLACEHOLDER_PUBLISHER_KEY} in the env file the agent wrote`;
  ui.keep(
    `\nAdd your publisher key\n${where} with a key from ${PUBLISHER_KEYS_URL}`
  );
}

async function wizard(options: WizardOptions): Promise<number> {
  const { cwd, fetchImpl, seam, signal, ui } = options;
  ui.plan([...STEPS], shorten(cwd));
  const agents = await seam.detect();
  if (agents.length === 0) {
    const missing = `No supported coding agent was found. Install one, or add the SDK by hand with the manual guide: ${PUBLISHER_GUIDE}`;
    ui.fail(AGENT_STEP, "none installed");
    ui.error([missing]);
    ui.keep(missing);
    return 1;
  }

  ui.begin(AGENT_STEP);
  const agent = await chooseAgent(agents, ui);
  ui.finish(AGENT_STEP, describeAgent(agent));
  contract(ui, agent);

  ui.begin(TREE_STEP);
  const tree = await inspectWorkingTree(cwd);
  ui.finish(TREE_STEP, await confirmTree(tree, ui));

  ui.begin(READ_STEP);
  // Before the first turn, so a network failure costs nothing. A turn that
  // runs without the current API costs minutes and integrates the wrong thing.
  const docs = await fetchDocs(fetchImpl);

  const conversation = seam.open(agent, cwd);
  const context: TurnContext = { agent, conversation, cwd, signal, ui };
  try {
    const plan = await planTurn(
      context,
      READ_STEP,
      reconPrompt(docs),
      "Reading the project"
    );
    ui.finish(READ_STEP, plan.summary || undefined);

    ui.begin(REVIEW_STEP);
    const approved = await approvePlan(context, plan);
    const kept = approved.placements.kept.length;
    ui.finish(REVIEW_STEP, kept === 1 ? "1 placement" : `${kept} placements`);

    // The opening contract has been read and acted on by now.
    ui.clear();
    ui.begin(WRITE_STEP);
    await implement(context, approved, docs);
    ui.finish(WRITE_STEP);
  } finally {
    await closeQuietly(conversation, ui);
  }

  await reportChanges(cwd, tree, ui);
  await reportKey(cwd, ui);
  ui.keep("\nRead the changes, then run your app.");
  return 0;
}

/**
 * Runs the whole wizard: detect an agent, plan the integration, and let it
 * make the changes once the developer approves the plan.
 *
 * @param options The agent seam, the project directory, and the screen to
 * drive. The caller owns the screen and closes it.
 * @returns The exit code for the caller to use. This never exits the process.
 */
export async function runWizard(options: WizardOptions): Promise<number> {
  const { ui, verbose } = options;
  try {
    return await wizard(options);
  } catch (error) {
    if (error instanceof WizardCancelled || error instanceof WizardStop) {
      const stopped = error.message;
      ui.warn([stopped]);
      ui.keep(stopped);
      return 0;
    }
    const message = messageOf(
      error,
      "The wizard could not finish. Check your setup and try again."
    );
    ui.error([message]);
    ui.keep(message);
    if (verbose) {
      for (const cause of causes(error)) {
        ui.keep(`  caused by: ${cause}`);
      }
    }
    return 1;
  }
}
