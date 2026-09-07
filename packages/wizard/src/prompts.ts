import type { ChosenPlacements } from "./placements";

export const PLACEHOLDER_PUBLISHER_KEY = "spk_your_key_here";
export const PUBLISHER_KEYS_URL =
  "https://app.specify.sh/publish/publisher-keys";

const RECOMMENDED_PLAN = `## What I found
## What I will change
## Placements
- \`path/to/File.tsx\` - short reason
## Notes`;

function reference(index: string): string {
  return `<specify-docs-index>
${index}
</specify-docs-index>

That index lists every page of the Specify documentation, published at https://docs.specify.sh. Fetch the pages you judge relevant, and follow the import paths, names and options exactly as they appear there in preference to anything you remember about this SDK.`;
}

/**
 * The turn that reads the project and reports a plan.
 *
 * @param index The documentation index, fetched as the run started.
 * @returns The prompt for the recon turn.
 */
export function reconPrompt(index: string): string {
  return `You are helping a developer add the Specify publisher SDK to the project in this directory. Specify serves ads to onchain audiences, and the SDK asks Specify for an ad and hands back what to render.

${reference(index)}

This turn reports, it does not change the project. Read the project and the documentation, then reply with a plan for adding the SDK here: what this project is, what you would change, and where an ad could go. Propose placements rather than settling them, because the developer chooses which ones to keep.

Reply with markdown and nothing else. This shape is a suggestion, not a requirement, so keep the Placements list if you propose any and structure the rest however this project needs:

${RECOMMENDED_PLAN}`;
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

Reply with a complete updated plan in markdown, not only the parts you changed. This turn still reports, it does not change the project.`;
}

function keyInstruction(publisherKey: string): string {
  if (publisherKey === PLACEHOLDER_PUBLISHER_KEY) {
    return `The developer does not have a publisher key yet. Write ${PLACEHOLDER_PUBLISHER_KEY} into the env file the plan names, with a comment above it saying to replace it with a key from ${PUBLISHER_KEYS_URL}.`;
  }
  return `Write the publisher key ${publisherKey} into the env file the plan names.`;
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
 * dropped, the key that was pasted or the placeholder, and the documentation
 * index.
 * @returns The prompt for the implement turn.
 */
export function implementPrompt(options: {
  index: string;
  placements: ChosenPlacements;
  plan: string;
  publisherKey: string;
}): string {
  return `${reference(options.index)}

Implement the plan below in this project. The developer has read it and approved it.

<approved-plan>
${options.plan}
</approved-plan>

${placementInstruction(options.placements)}${keyInstruction(options.publisherKey)}

Do not commit. No git commit, no git push, no pull request. Leave every change in the working tree, because the developer reviews the diff once you are done.`;
}
