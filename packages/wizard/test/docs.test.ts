import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDocs } from "../src/docs";
import type { SdkMode } from "../src/sdk";

const INDEX_URL = "https://docs.specify.sh/llms.txt";
const INDEX_ERROR =
  "Could not fetch https://docs.specify.sh/llms.txt. Check your connection and retry.";

afterEach(() => {
  vi.restoreAllMocks();
});

function docsFetch(replies: Record<string, Response | Error>): typeof fetch {
  return ((url: string) => {
    const reply = replies[String(url)];
    if (reply === undefined) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return reply instanceof Error
      ? Promise.reject(reply)
      : Promise.resolve(reply);
  }) as unknown as typeof fetch;
}

function stalledFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
      }
      signal?.addEventListener("abort", () => reject(signal.reason));
    })) as unknown as typeof fetch;
}

describe("fetchDocs on a stalled connection", () => {
  it("gives up as soon as the run is stopped", async () => {
    const stopping = new AbortController();
    const docs = fetchDocs("publisher", stalledFetch(), stopping.signal);

    stopping.abort();

    await expect(docs).rejects.toThrow(INDEX_ERROR);
  });

  it("gives up at the deadline even while the run carries on", async () => {
    const deadline = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(deadline.signal);
    const docs = fetchDocs(
      "publisher",
      stalledFetch(),
      new AbortController().signal
    );

    deadline.abort();

    await expect(docs).rejects.toThrow(INDEX_ERROR);
    expect(timeout).toHaveBeenCalledOnce();
  });
});

describe.each<{ mode: SdkMode; section: string }>([
  { mode: "publisher", section: "publishing" },
  { mode: "advertiser", section: "advertising" },
])("fetchDocs ($mode)", ({ mode, section }) => {
  const bundleUrl = `https://docs.specify.sh/${section}/llms-full.txt`;
  it("fetches the index and the selected bundle, and nothing else", async () => {
    const fetchImpl = docsFetch({
      [bundleUrl]: new Response("# Next.js\n\nInstall the SDK."),
      [INDEX_URL]: new Response("# Specify"),
    });

    await expect(fetchDocs(mode, fetchImpl)).resolves.toEqual({
      bundle: "# Next.js\n\nInstall the SDK.",
      index: "# Specify",
    });
  });

  it("carries on without a bundle when the site does not serve one", async () => {
    const fetchImpl = docsFetch({
      [bundleUrl]: new Response("not here", { status: 404 }),
      [INDEX_URL]: new Response("# Specify"),
    });

    await expect(fetchDocs(mode, fetchImpl)).resolves.toEqual({
      index: "# Specify",
    });
  });

  it("carries on without a bundle when fetching it fails", async () => {
    const fetchImpl = docsFetch({
      [bundleUrl]: new Error("socket failed"),
      [INDEX_URL]: new Response("# Specify"),
    });

    await expect(fetchDocs(mode, fetchImpl)).resolves.toEqual({
      index: "# Specify",
    });
  });

  it("treats an empty or oversized bundle as absent", async () => {
    const empty = docsFetch({
      [bundleUrl]: new Response("   \n"),
      [INDEX_URL]: new Response("# Specify"),
    });
    await expect(fetchDocs(mode, empty)).resolves.toEqual({
      index: "# Specify",
    });

    const oversized = docsFetch({
      [bundleUrl]: new Response("x".repeat(512_001)),
      [INDEX_URL]: new Response("# Specify"),
    });
    await expect(fetchDocs(mode, oversized)).resolves.toEqual({
      index: "# Specify",
    });
  });

  it("still fails the run when the index cannot be fetched", async () => {
    const fetchImpl = docsFetch({
      [bundleUrl]: new Response("# Docs"),
      [INDEX_URL]: new Response("private details", { status: 503 }),
    });

    await expect(fetchDocs(mode, fetchImpl)).rejects.toThrow(
      "Could not fetch https://docs.specify.sh/llms.txt. Check your connection and retry."
    );
  });

  it("preserves a network failure on the index as the public error cause", async () => {
    const cause = new Error("socket failed");
    const fetchMock = vi.fn<typeof fetch>((url) =>
      String(url) === INDEX_URL
        ? Promise.reject(cause)
        : Promise.resolve(new Response("# Docs"))
    );

    await expect(fetchDocs(mode, fetchMock)).rejects.toMatchObject({ cause });
  });
});
