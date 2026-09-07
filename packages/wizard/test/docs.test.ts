import { describe, expect, it, vi } from "vitest";
import { fetchDocsIndex } from "../src/docs";

describe("fetchDocsIndex", () => {
  it("fetches the index and nothing else", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("# Specify"));

    await expect(fetchDocsIndex(fetchMock)).resolves.toBe("# Specify");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://docs.specify.sh/llms.txt",
    ]);
  });

  it("names the failed URL without exposing the upstream response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private details", { status: 503 }));

    await expect(fetchDocsIndex(fetchMock)).rejects.toThrow(
      "Could not fetch https://docs.specify.sh/llms.txt. Check your connection and retry."
    );
  });

  it("preserves a network failure as the public error cause", async () => {
    const cause = new Error("socket failed");
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(cause);

    await expect(fetchDocsIndex(fetchMock)).rejects.toMatchObject({ cause });
  });
});
