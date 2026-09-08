const INDEX_URL = "https://docs.specify.sh/llms.txt";
const BUNDLE_URL = "https://docs.specify.sh/publishing/llms-full.txt";
// A bundle bigger than this stops helping and starts drowning the prompt, so
// an oversized one is treated as absent rather than inlined.
const BUNDLE_LIMIT_BYTES = 512_000;

/** What the wizard knows about the documentation as the run starts. */
export interface Docs {
  /**
   * The publishing documentation in full, when the site serves it as one
   * file. Inlined into the recon prompt so the agent reads instead of
   * fetching page by page — each fetch costs a whole model round trip.
   */
  bundle?: string;
  /** The index of every page, for whatever the bundle does not carry. */
  index: string;
}

function docsError(url: string, cause?: unknown): Error {
  return new Error(`Could not fetch ${url}. Check your connection and retry.`, {
    cause,
  });
}

async function fetchIndex(fetchImpl: typeof fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(INDEX_URL);
  } catch (error) {
    throw docsError(INDEX_URL, error);
  }
  if (!response.ok) {
    throw docsError(INDEX_URL);
  }
  try {
    return await response.text();
  } catch (error) {
    throw docsError(INDEX_URL, error);
  }
}

/** The bundle is an optimisation, so failing to get one fails nothing. */
async function fetchBundle(
  fetchImpl: typeof fetch
): Promise<string | undefined> {
  const response = await fetchImpl(BUNDLE_URL).catch(() => undefined);
  if (!response?.ok) {
    return undefined;
  }
  const bundle = await response.text().catch(() => undefined);
  const usable =
    bundle !== undefined &&
    bundle.trim() !== "" &&
    bundle.length <= BUNDLE_LIMIT_BYTES;
  return usable ? bundle : undefined;
}

/**
 * The published documentation, fetched as the run starts so the agent works
 * from what is live today.
 *
 * The index is required — without it the agent would integrate from memory.
 * The full publishing bundle is fetched alongside it and inlined when the
 * site serves one; when it does not, the agent falls back to fetching pages
 * from the index as it always has.
 *
 * @param fetchImpl The fetch to use, injected so tests never reach the network.
 * @returns The index, and the publishing bundle when one is published.
 */
export async function fetchDocs(
  fetchImpl: typeof fetch = fetch
): Promise<Docs> {
  const [index, bundle] = await Promise.all([
    fetchIndex(fetchImpl),
    fetchBundle(fetchImpl),
  ]);
  return bundle === undefined ? { index } : { bundle, index };
}
