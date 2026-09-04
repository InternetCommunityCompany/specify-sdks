import type { IntegrationPlan } from "./plan";

const DOCS_ORIGIN = "https://docs.specify.sh";
const INDEX_URL = `${DOCS_ORIGIN}/llms.txt`;
const FULL_URL = `${DOCS_ORIGIN}/llms-full.txt`;
const BASELINE_PAGES = [
  "/publishing/publisher-keys",
  "/publishing/sdk-browser",
  "/publishing/ad-unit-ids",
  "/publishing/returning-visitors",
] as const;
const FRAMEWORK_PAGES = {
  nextjs: ["/publishing/nextjs", "/publishing/sdk-server"],
  other: ["/publishing/javascript"],
  react: ["/publishing/react"],
  vanilla: ["/publishing/javascript"],
} as const satisfies Record<IntegrationPlan["framework"], readonly string[]>;
const WALLETS_PAGE = "/publishing/multiple-wallets";
const SECTION_URL = /^# .+\nURL: (\/[^\s]+)$/m;

export interface RawDocs {
  full: string;
  index: string;
}

export interface Reference {
  missing: string[];
  pages: { url: string; content: string }[];
  text: string;
}

async function fetchText(fetchImpl: typeof fetch, url: string) {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw docsError(url, error);
  }
  if (!response.ok) {
    throw docsError(url);
  }
  try {
    return await response.text();
  } catch (error) {
    throw docsError(url, error);
  }
}

function docsError(url: string, cause?: unknown): Error {
  return new Error(`Could not fetch ${url}. Check your connection and retry.`, {
    cause,
  });
}

export async function fetchReference(
  fetchImpl: typeof fetch = fetch
): Promise<RawDocs> {
  const [index, full] = await Promise.all([
    fetchText(fetchImpl, INDEX_URL),
    fetchText(fetchImpl, FULL_URL),
  ]);
  return { full, index };
}

function stripIncludes(content: string): string {
  return content
    .replace(/^\s*<include>.*<\/include>\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function selectPages(
  raw: RawDocs,
  framework: IntegrationPlan["framework"],
  walletsConnected: boolean
): Reference {
  const sections = new Map<string, string>();
  for (const section of raw.full.split("\n\n---\n\n")) {
    const url = section.match(SECTION_URL)?.[1];
    if (url) {
      sections.set(url, stripIncludes(section));
    }
  }

  const selected = [
    ...BASELINE_PAGES,
    ...FRAMEWORK_PAGES[framework],
    ...(walletsConnected ? [WALLETS_PAGE] : []),
  ];
  const pages: Reference["pages"] = [];
  const missing: string[] = [];
  for (const url of selected) {
    const content = sections.get(url);
    if (!content) {
      missing.push(url);
      continue;
    }
    pages.push({ content, url });
  }

  return {
    missing,
    pages,
    text: pages.map(({ content }) => content).join("\n\n---\n\n"),
  };
}
