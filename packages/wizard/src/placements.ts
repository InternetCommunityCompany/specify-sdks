const HEADING = /^#{1,6}\s+(.+)$/;
const LIST_ITEM = /^\s*[-*+]\s+(.+)$/;
const PLACEMENT_HEADING = /placement/i;

/** What the developer kept from the placements the agent suggested. */
export interface ChosenPlacements {
  dropped: string[];
  kept: string[];
}

/**
 * The placements a plan suggests, read from its markdown.
 *
 * The plan format is a recommendation rather than a contract, so this reads
 * list items under any heading that mentions placements and takes each line as
 * the agent wrote it. A plan that ignores the recommendation yields none, and
 * the wizard carries on without the picker.
 *
 * @param plan The plan markdown the agent replied with.
 * @returns One label per suggested placement, in the order the plan lists them.
 */
export function parsePlacements(plan: string): string[] {
  const labels = new Set<string>();
  let underPlacements = false;
  for (const line of plan.split("\n")) {
    const heading = line.match(HEADING)?.[1];
    if (heading) {
      underPlacements = PLACEMENT_HEADING.test(heading);
      continue;
    }
    const item = underPlacements ? line.match(LIST_ITEM)?.[1] : undefined;
    if (item) {
      labels.add(item.trim());
    }
  }
  return [...labels];
}
