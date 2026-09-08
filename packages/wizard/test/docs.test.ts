import { describe, expect, it, vi } from "vitest";
import { fetchDocs } from "../src/docs";

const INDEX_URL = "https://docs.specify.sh/llms.txt";
const BUNDLE_URL = "https://docs.specify.sh/publishing/llms-full.txt";

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

describe("fetchDocs", () => {
  it("fetches the index and the publishing bundle, and nothing else", async () => {
    const fetchImpl = docsFetch({
      [BUNDLE_URL]: new Response("# Next.js\n\nInstall the SDK."),
      [INDEX_URL]: new Response("# Specify"),
    });

    await expect(fetchDocs(fetchImpl)).resolves.toEqual({
      bundle: "# Next.js\n\nInstall the SDK.",
      index: "# Specify",
    });
  });

  it("carries on without a bundle when the site does not serve one", async () => {
    const fetchImpl = docsFetch({
      [BUNDLE_URL]: new Response("not here", { status: 404 }),
      [INDEX_URL]: new Response("# Specify"),
    });

    await expect(fetchDocs(fetchImpl)).resolves.toEqual({ index: "# Specify" });
  });

  it("carries on without a bundle when fetching it fails", async () => {
    const fetchImpl = docsFetch({
      [BUNDLE_URL]: new Error("socket failed"),
      [INDEX_URL]: new Response("# Specify"),
    });

    await expect(fetchDocs(fetchImpl)).resolves.toEqual({ index: "# Specify" });
  });

  it("treats an empty or oversized bundle as absent", async () => {
    const empty = docsFetch({
      [BUNDLE_URL]: new Response("   \n"),
      [INDEX_URL]: new Response("# Specify"),
    });
    await expect(fetchDocs(empty)).resolves.toEqual({ index: "# Specify" });

    const oversized = docsFetch({
      [BUNDLE_URL]: new Response("x".repeat(512_001)),
      [INDEX_URL]: new Response("# Specify"),
    });
    await expect(fetchDocs(oversized)).resolves.toEqual({ index: "# Specify" });
  });

  it("still fails the run when the index cannot be fetched", async () => {
    const fetchImpl = docsFetch({
      [BUNDLE_URL]: new Response("# Docs"),
      [INDEX_URL]: new Response("private details", { status: 503 }),
    });

    await expect(fetchDocs(fetchImpl)).rejects.toThrow(
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

    await expect(fetchDocs(fetchMock)).rejects.toMatchObject({ cause });
  });
});
