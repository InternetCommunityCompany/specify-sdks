import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Host, install } from "../src/command-queue";
import { visit } from "./page";

const KEY = "sak_0123456789abcdef0123456789abcd";
const OTHER_KEY = "sak_fedcba9876543210fedcba98765432";
const IDENTIFY = "https://spfsrv.com/v1/identify";
const EVENTS = "https://spfsrv.com/v1/events";

type EntryPoint = ((...command: unknown[]) => void) & { q?: unknown[] };

function mockService() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));
}

function requests(fetchSpy: ReturnType<typeof mockService>) {
  return fetchSpy.mock.calls.map(([url, init]) => ({
    body: JSON.parse(String(init?.body)),
    credentials: init?.credentials,
    key: (init?.headers as Record<string, string> | undefined)?.["x-api-key"],
    url: String(url),
  }));
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// The same stub as the README snippet, which looks the queue up on every call.
function withSnippet() {
  const entry: EntryPoint = (...command) => {
    entry.q = entry.q ?? [];
    entry.q.push(command);
  };
  return { specifyAdvertiser: entry };
}

// Google Tag Manager queues argument objects rather than arrays.
function argumentsOf(...command: unknown[]) {
  return { ...command, length: command.length };
}

beforeEach(() => {
  visit("/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("advertiser script tag", () => {
  it("runs the commands queued before it loaded, then the ones sent after", async () => {
    visit("/landing?spclk=click-token");
    const fetchSpy = mockService();
    const host = withSnippet();
    host.specifyAdvertiser("init", { advertiserKey: KEY });
    host.specifyAdvertiser("identify", "customer");
    install(host);
    host.specifyAdvertiser("setCookieConsent", true);
    host.specifyAdvertiser("capture", "signup");

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(requests(fetchSpy)).toMatchObject([
      {
        body: { spclk: "click-token", userId: "customer" },
        credentials: "omit",
        key: KEY,
        url: IDENTIFY,
      },
      { credentials: "include", url: IDENTIFY },
      {
        body: { events: [{ name: "signup" }], userId: "customer" },
        credentials: "include",
        url: EVENTS,
      },
    ]);
  });

  it("runs argument objects pushed straight onto the queue, the way Google Tag Manager sends them", async () => {
    const fetchSpy = mockService();
    const queue: unknown[] = [argumentsOf("init", { advertiserKey: KEY })];
    const stub = (...command: unknown[]) => {
      queue.push(argumentsOf(...command));
    };
    const host = { specifyAdvertiser: Object.assign(stub, { q: queue }) };
    install(host);
    host.specifyAdvertiser("identify", "customer");
    queue.push(argumentsOf("capture", "signup"));

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(requests(fetchSpy)).toMatchObject([
      { body: { userId: "customer" }, url: IDENTIFY },
      { body: { events: [{ name: "signup" }] }, url: EVENTS },
    ]);
  });

  it("creates the entry point when the page has none", async () => {
    const fetchSpy = mockService();
    const host: Host = {};
    install(host);
    const specifyAdvertiser = host.specifyAdvertiser as EntryPoint;
    specifyAdvertiser("init", { advertiserKey: KEY });
    specifyAdvertiser("identify", "customer");

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(requests(fetchSpy)[0]).toMatchObject({
      body: { userId: "customer" },
      url: IDENTIFY,
    });
  });

  it("holds commands sent before init and runs them once it arrives", async () => {
    const fetchSpy = mockService();
    const host = withSnippet();
    install(host);
    host.specifyAdvertiser("identify", "customer");
    host.specifyAdvertiser("capture", "signup");
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();

    host.specifyAdvertiser("init", { advertiserKey: KEY });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(requests(fetchSpy)).toMatchObject([
      { body: { userId: "customer" }, url: IDENTIFY },
      {
        body: { events: [{ name: "signup" }], userId: "customer" },
        url: EVENTS,
      },
    ]);
  });

  it("keeps the first client when init runs again or the script loads twice", async () => {
    const fetchSpy = mockService();
    const host = withSnippet();
    host.specifyAdvertiser("init", { advertiserKey: KEY });
    install(host);
    install(host);
    host.specifyAdvertiser("init", { advertiserKey: OTHER_KEY });
    host.specifyAdvertiser("identify", "customer");

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    await settle();
    expect(requests(fetchSpy)).toMatchObject([{ key: KEY }]);
  });

  it("forgets the visitor on reset", async () => {
    const fetchSpy = mockService();
    const host = withSnippet();
    install(host);
    host.specifyAdvertiser("init", { advertiserKey: KEY });
    host.specifyAdvertiser("identify", "customer");
    host.specifyAdvertiser("reset");
    host.specifyAdvertiser("capture", "signup");
    host.specifyAdvertiser("setCookieConsent", true);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const [, events] = requests(fetchSpy);
    expect(events).toMatchObject({ credentials: "include", url: EVENTS });
    expect(events?.body).not.toHaveProperty("userId");
  });

  it("skips unknown commands and malformed entries without throwing", async () => {
    const fetchSpy = mockService();
    const host = withSnippet();
    install(host);
    host.specifyAdvertiser("init", { advertiserKey: KEY });
    const queue = host.specifyAdvertiser.q as unknown[];
    expect(() => {
      queue.push(null, undefined, 42, "capture", {});
      host.specifyAdvertiser();
      host.specifyAdvertiser("track", "signup");
      host.specifyAdvertiser("identify");
      host.specifyAdvertiser("capture");
    }).not.toThrow();
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing, without throwing, where it can't set the entry point", () => {
    const host: Host = Object.freeze({});
    expect(() => install(host)).not.toThrow();
    expect(host.specifyAdvertiser).toBeUndefined();
  });
});
