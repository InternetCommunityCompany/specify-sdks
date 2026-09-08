import type { Docs } from "./docs";
import type { ChosenPlacements } from "./plan";

export const PLACEHOLDER_PUBLISHER_KEY = "spk_your_key_here";
export const PUBLISHER_KEYS_URL =
  "https://app.specify.sh/publish/publisher-keys";

function indexReference(index: string): string {
  return `<specify-docs-index>
${index}
</specify-docs-index>

That index lists every page of the Specify documentation. Fetch the ones you judge relevant from https://docs.specify.sh, adding .md to the path for the markdown of a page, as in https://docs.specify.sh/publishing/nextjs.md, and follow the import paths, names and options exactly as they appear there in preference to anything you remember about this SDK.`;
}

function reference(docs: Docs): string {
  if (docs.bundle === undefined) {
    return indexReference(docs.index);
  }
  return `<specify-publishing-docs>
${docs.bundle}
</specify-publishing-docs>

That is the full publishing documentation, included so you do not need to fetch it. Follow the import paths, names and options exactly as they appear there in preference to anything you remember about this SDK.

<specify-docs-index>
${docs.index}
</specify-docs-index>

The index lists every page, including ones outside the publishing documentation. Fetch a page from https://docs.specify.sh, adding .md to its path, only when what you need is not included above.`;
}

/**
 * The turn that reads the project and reports a plan.
 *
 * @param docs The documentation, fetched as the run started.
 * @returns The prompt for the recon turn.
 */
export function reconPrompt(docs: Docs): string {
  return `You are helping a developer add the Specify publisher SDK to the project in this directory. Specify serves ads to onchain audiences, and the SDK asks Specify for an ad and hands back what to render.

${reference(docs)}

This turn reports, it does not change the project: read whatever you need, but create, change, delete and install nothing until the developer has approved a plan. Read the project and the documentation, then report a plan for adding the SDK here: what this project is, what you would change, and where an ad could go. Propose placements rather than settling them, because the developer chooses which ones to keep.

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

function placementInstruction(placements: ChosenPlacements): string {
  const { dropped, kept } = placements;
  if (kept.length === 0 && dropped.length === 0) {
    return "";
  }
  const wanted =
    kept.length > 0
      ? `The developer chose these placements. Build these and no others:\n${list(kept)}`
      : "The developer wants none of the placements you proposed. Wire up the client and the configuration, and add no ad slots at all.";
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
 * @param options The approved plan, the placements the developer kept and
 * dropped, and the documentation index.
 * @returns The prompt for the implement turn.
 */
export function implementPrompt(options: {
  docs: Docs;
  placements: ChosenPlacements;
  plan: string;
}): string {
  return `${indexReference(options.docs.index)}

Implement the plan below in this project. The developer has read it and approved it.

<approved-plan>
${options.plan}
</approved-plan>

${placementInstruction(options.placements)}The developer has not given you a publisher key, and you must not ask for one. Write ${PLACEHOLDER_PUBLISHER_KEY} into the env file the plan names, with a comment above it saying to replace it with a key from ${PUBLISHER_KEYS_URL}. Tell them in your final message which file that is.

Do not commit. No git commit, no git push, no pull request. Leave every change in the working tree, because the developer reviews the diff once you are done.`;
}
