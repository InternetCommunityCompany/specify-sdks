const INDEX_URL = "https://docs.specify.sh/llms.txt";

function docsError(url: string, cause?: unknown): Error {
  return new Error(`Could not fetch ${url}. Check your connection and retry.`, {
    cause,
  });
}

/**
 * The published documentation index, which names every page and where to read
 * it. The agent fetches the pages it decides it needs from there, so nothing
 * else about the documentation is carried into a prompt.
 *
 * @param fetchImpl The fetch to use, injected so tests never reach the network.
 * @returns The index as published right now.
 */
export async function fetchDocsIndex(
  fetchImpl: typeof fetch = fetch
): Promise<string> {
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
