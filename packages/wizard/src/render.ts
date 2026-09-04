import type { IntegrationPlan } from "./plan";

const FRAMEWORK_LABELS = {
  nextjs: "Next.js",
  other: "Other",
  react: "React",
  vanilla: "Vanilla JavaScript",
} as const satisfies Record<IntegrationPlan["framework"], string>;

const LABEL_WIDTH = 12;
const SUMMARY_INDENT = 10;
// Wide enough to read, narrow enough that an 80-column terminal renders the
// note without rewrapping and losing the indent under each label.
const BODY_WIDTH = 64;
const WHITESPACE = /\s+/;

function wrap(value: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(WHITESPACE).filter(Boolean)) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  return lines;
}

function indented(first: string, value: string, indent: number): string[] {
  const padding = " ".repeat(indent);
  return wrap(value, BODY_WIDTH - indent).map((line, index) =>
    index === 0 ? `${first.padEnd(indent)}${line}` : `${padding}${line}`
  );
}

function row(label: string, value: string): string[] {
  return indented(label, value, LABEL_WIDTH);
}

function describeConsent(plan: IntegrationPlan): string {
  const { decisionSite, platform, present } = plan.consent;
  if (!present) {
    return "None found, so consent is never set";
  }
  const site = decisionSite ? `, decided in ${decisionSite}` : "";
  return `${platform ?? "A consent platform"}${site}`;
}

function describeWallets(plan: IntegrationPlan): string {
  const { connected, connectionSite, library } = plan.wallets;
  if (!connected) {
    return "None found";
  }
  const site = connectionSite ? `, connected in ${connectionSite}` : "";
  return `${library ?? "A wallet connection"}${site}`;
}

function placementLines(plan: IntegrationPlan): string[] {
  if (plan.placements.length === 0) {
    return ["  None proposed"];
  }
  return plan.placements.map(
    ({ adUnitId, file, imageFormat }) =>
      `  ${file}, ${imageFormat}, ${adUnitId}`
  );
}

function changeLines(plan: IntegrationPlan): string[] {
  return plan.changes.flatMap(({ action, path, summary }) => [
    `  ${action}  ${path}`,
    ...indented("", summary, SUMMARY_INDENT),
  ]);
}

/**
 * The plan as the developer reads it before approving anything.
 *
 * @param plan The plan the agent reported.
 * @returns The body for a `note()`, one screen of plain text.
 */
export function renderPlan(plan: IntegrationPlan): string {
  const language = plan.typescript ? "TypeScript" : "JavaScript";
  return [
    ...row(
      "Framework",
      `${FRAMEWORK_LABELS[plan.framework]}, ${language}, ${plan.packageManager}`
    ),
    ...(plan.frameworkNotes ? row("Notes", plan.frameworkNotes) : []),
    ...row("Client", plan.clientModule.path),
    ...row("Env", `${plan.envFile.path}, ${plan.envFile.variable}`),
    ...row("Consent", describeConsent(plan)),
    ...row("Wallets", describeWallets(plan)),
    "",
    "Placements",
    ...placementLines(plan),
    "",
    "Files to change",
    ...changeLines(plan),
    "",
    "Nothing has been changed yet.",
  ].join("\n");
}
