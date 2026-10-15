import type { Docs } from "./docs";
import type { ChosenSuggestions } from "./plan";
import { SDK_CONFIG, type SdkMode } from "./sdk";

function indexReference(index: string, mode: SdkMode): string {
  return `<specify-docs-index>
${index}
</specify-docs-index>

That index lists every page of the Specify documentation. Fetch the ones you judge relevant from https://docs.specify.sh, adding .md to the path for the markdown of a page, as in ${SDK_CONFIG[mode].example}, and follow the import paths, names and options exactly as they appear there in preference to anything you remember about this SDK.`;
}

function reference(docs: Docs, mode: SdkMode): string {
  if (docs.bundle === undefined) {
    return indexReference(docs.index, mode);
  }
  const { section } = SDK_CONFIG[mode];
  return `<specify-${section}-docs>
${docs.bundle}
</specify-${section}-docs>

That is the full ${section} documentation, included so you do not need to fetch it. Follow the import paths, names and options exactly as they appear there in preference to anything you remember about this SDK.

<specify-docs-index>
${docs.index}
</specify-docs-index>

The index lists every page, including ones outside the ${section} documentation. Fetch a page from https://docs.specify.sh, adding .md to its path, only when what you need is not included above.`;
}

/**
 * The turn that reads the project and reports a plan.
 *
 * @param docs The documentation, fetched as the run started.
 * @param mode The SDK to set up.
 * @returns The prompt for the recon turn.
 */
export function reconPrompt(docs: Docs, mode: SdkMode): string {
  const purpose =
    mode === "advertiser"
      ? "The SDK captures product events from a browser or server so advertisers can measure what users do."
      : "Specify serves ads to onchain audiences, and the SDK asks Specify for an ad and hands back what to render.";
  const proposal =
    mode === "advertiser"
      ? "which events would be useful to capture. Propose events rather than settling them, because the developer chooses which ones to keep. Account for the project's existing consent, user identity and wallet handling, and whether each event belongs in browser or server code."
      : "where an ad could go. Propose placements rather than settling them, because the developer chooses which ones to keep.";
  return `You are helping a developer add the Specify ${mode} SDK to the project in this directory. ${purpose}

${reference(docs, mode)}

This turn reports, it does not change the project: read whatever you need, but create, change, delete and install nothing until the developer has approved a plan. Read the project and the documentation, then report a plan for adding the SDK here: what this project is, what you would change, and ${proposal}

Write the plan for the developer who will read it, not as a report of what you just did: no progress commentary, no "I'll start by", no narration of the files you opened.`;
}

/**
 * The turn that revises a plan the developer sent back.
 *
 * @param feedback What the developer asked to change, in their own words.
 * @returns The prompt for another recon turn on the same session.
 */
export function feedbackPrompt(feedback: string): string {
  return `The developer read your plan and asked for changes:

<feedback>
${feedback}
</feedback>

Report a complete updated plan, not only the parts you changed. This turn still reports, it does not change the project: create, change, delete and install nothing yet.`;
}

function list(labels: string[]): string {
  return labels.map((label) => `- ${label}`).join("\n");
}

function suggestionInstruction(
  suggestions: ChosenSuggestions,
  mode: SdkMode
): string {
  const { dropped, kept } = suggestions;
  if (kept.length === 0 && dropped.length === 0) {
    return "";
  }
  const kind = mode === "advertiser" ? "events" : "placements";
  const excluded = mode === "advertiser" ? "event captures" : "ad slots";
  const wanted =
    kept.length > 0
      ? `The developer chose these ${kind}. Build these and no others:\n${list(kept)}`
      : `The developer wants none of the ${kind} you proposed. Wire up the client and the configuration, and add no ${excluded} at all.`;
  const unwanted =
    dropped.length > 0
      ? `\n\nThe developer read these and does not want them. Do not add them:\n${list(dropped)}`
      : "";
  return `${wanted}${unwanted}\n\n`;
}

/**
 * The turn that writes the integration.
 *
 * The documentation index goes ahead of the instructions in a delimited block,
 * so the agent treats it as reference rather than as commands, and can still
 * pull a page it needs while it works.
 *
 * @param options The SDK, approved plan, suggestions the developer kept and
 * dropped, and documentation index.
 * @returns The prompt for the implement turn.
 */
export function implementPrompt(options: {
  docs: Docs;
  mode: SdkMode;
  plan: string;
  suggestions: ChosenSuggestions;
}): string {
  const { mode } = options;
  const { keysUrl, placeholderKey } = SDK_CONFIG[mode];
  return `${indexReference(options.docs.index, mode)}

Implement the plan below in this project. The developer has read it and approved it.

<approved-plan>
${options.plan}
</approved-plan>

${suggestionInstruction(options.suggestions, mode)}The developer has not given you ${mode === "advertiser" ? "an" : "a"} ${mode} key, and you must not ask for one. Write ${placeholderKey} into the env file the plan names, with a comment above it saying to replace it with a key from ${keysUrl}. Tell them in your final message which file that is.

Do not commit. No git commit, no git push, no pull request. Leave every change in the working tree, because the developer reviews the diff once you are done.`;
}
