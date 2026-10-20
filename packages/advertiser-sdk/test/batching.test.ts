import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Specify from "../src";
import { visit } from "./page";

const KEY = "sak_0123456789abcdef0123456789abcd";
const MAX_BODY_BYTES = 16 * 1024;

function mockService() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));
}

function bodies(fetchSpy: ReturnType<typeof mockService>) {
  return fetchSpy.mock.calls
    .filter(([url]) => String(url).endsWith("/events"))
    .map(([, init]) => JSON.parse(String(init?.body)));
}

function names(fetchSpy: ReturnType<typeof mockService>) {
  return bodies(fetchSpy).map((body) =>
    body.events.map((event: { name: string }) => event.name)
  );
}

beforeEach(() => {
  visit("/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("advertiser event batching", () => {
  it("sends held events together, 50 per request", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    for (let index = 0; index < 120; index += 1) {
      client.capture(`event_${index}`);
    }
    client.setCookieConsent(true);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    const sent = names(fetchSpy);
    expect(sent.map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(sent.flat()).toEqual(
      Array.from({ length: 120 }, (_, index) => `event_${index}`)
    );
    const ids = bodies(fetchSpy).flatMap((body) =>
      body.events.map((event: { id: string }) => event.id)
    );
    expect(new Set(ids).size).toBe(120);
  });

  it("keeps each request within 16 KiB", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    for (let index = 0; index < 10; index += 1) {
      client.capture(`${index}`.padEnd(4000, "x"));
    }
    client.setCookieConsent(true);

    await vi.waitFor(() => expect(names(fetchSpy).flat()).toHaveLength(10));
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    for (const [, init] of fetchSpy.mock.calls) {
      expect(
        new TextEncoder().encode(String(init?.body)).byteLength
      ).toBeLessThanOrEqual(MAX_BODY_BYTES);
    }
  });

  it("sends held batches one at a time while new events go straight out", async () => {
    let release: (() => void) | undefined;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(new Response(null, { status: 200 }));
          })
      )
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new Specify({ advertiserKey: KEY });
    for (let index = 0; index < 51; index += 1) {
      client.capture(`held_${index}`);
    }
    client.setCookieConsent(true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    client.capture("live");
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    release?.();

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    const [first, live, last] = names(fetchSpy);
    expect(first).toHaveLength(50);
    expect(live).toEqual(["live"]);
    expect(last).toEqual(["held_50"]);
  });

  it("drops a held event too large to send and still sends the ones after it", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.capture("x".repeat(MAX_BODY_BYTES));
    client.capture("after");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchSpy).not.toHaveBeenCalled();
    client.setCookieConsent(true);

    await vi.waitFor(() => expect(names(fetchSpy).flat()).toEqual(["after"]));
  });

  it("packs held events up to 16 KiB per request", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    for (let index = 0; index < 10; index += 1) {
      client.capture(`${index}`.padEnd(5000, "x"));
    }
    client.setCookieConsent(true);

    await vi.waitFor(() => expect(names(fetchSpy).flat()).toHaveLength(10));
    expect(names(fetchSpy).map((batch) => batch.length)).toEqual([3, 3, 3, 1]);
  });
});
