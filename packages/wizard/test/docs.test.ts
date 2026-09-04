import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchReference, selectPages } from "../src/docs";

const SDK_SERVER_INDEX_LINE = /^.*\(\/publishing\/sdk-server\).*$/m;

async function fixtures() {
  const [index, full] = await Promise.all([
    readFile(resolve("packages/wizard/test/fixtures/llms.txt"), "utf8"),
    readFile(resolve("packages/wizard/test/fixtures/llms-full.txt"), "utf8"),
  ]);
  return { full, index };
}

describe("fetchReference", () => {
  it("fetches both documentation files once", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("index"))
      .mockResolvedValueOnce(new Response("full"));

    await expect(fetchReference(fetchMock)).resolves.toEqual({
      full: "full",
      index: "index",
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://docs.specify.sh/llms.txt",
      "https://docs.specify.sh/llms-full.txt",
    ]);
  });

  it("names the failed URL without exposing the upstream response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("private details", { status: 503 }))
      .mockResolvedValueOnce(new Response("full"));

    await expect(fetchReference(fetchMock)).rejects.toThrow(
      "Could not fetch https://docs.specify.sh/llms.txt. Check your connection and retry."
    );
  });
});

describe("selectPages", () => {
  it.each([
    ["nextjs", ["/publishing/nextjs", "/publishing/sdk-server"]],
    ["react", ["/publishing/react"]],
    ["vanilla", ["/publishing/javascript"]],
    ["other", ["/publishing/javascript"]],
  ] as const)("selects the %s reference", async (framework, additions) => {
    const reference = selectPages(await fixtures(), framework, false);
    const urls = reference.pages.map(({ url }) => url);

    expect(urls).toEqual([
      "/publishing/publisher-keys",
      "/publishing/sdk-browser",
      "/publishing/ad-unit-ids",
      "/publishing/returning-visitors",
      ...additions,
    ]);
    expect(reference.missing).toEqual([]);
    expect(reference.text.length).toBeLessThan(40_000);
    expect(reference.text).not.toContain("<include>");
  });

  it("adds the multiple-wallets page when wallets are connected", async () => {
    const reference = selectPages(await fixtures(), "react", true);

    expect(reference.pages.at(-1)?.url).toBe("/publishing/multiple-wallets");
  });

  it("reports and drops a page missing from the captured docs", async () => {
    const raw = await fixtures();
    const index = raw.index.replace(SDK_SERVER_INDEX_LINE, "");
    const full = raw.full
      .split("\n\n---\n\n")
      .filter((section) => !section.includes("URL: /publishing/sdk-server"))
      .join("\n\n---\n\n");

    const reference = selectPages({ full, index }, "nextjs", false);

    expect(reference.missing).toEqual(["/publishing/sdk-server"]);
    expect(reference.pages.map(({ url }) => url)).not.toContain(
      "/publishing/sdk-server"
    );
  });
});
