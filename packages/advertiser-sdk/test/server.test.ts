import { ValidationError as CoreValidationError } from "@specify-sh/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type CaptureOptions, capture, ValidationError } from "../src/server";

const KEY = "sak_0123456789abcdef0123456789abcd";
const WALLET = "0x1111111111111111111111111111111111111111";
const OPTIONS: CaptureOptions = {
  advertiserKey: KEY,
  event: "purchase",
  identity: "customer_123",
};

function mockService(status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("advertiser server capture", () => {
  it("sends one event with its identity and no cookie", async () => {
    const fetchSpy = mockService();
    await expect(
      capture({ ...OPTIONS, url: "https://shop.example/orders/1" })
    ).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://spfsrv.com/v1/events");
    expect(init).toMatchObject({
      headers: { "x-api-key": KEY },
      method: "POST",
    });
    expect(init).not.toHaveProperty("credentials");
    expect(init).not.toHaveProperty("keepalive");
    expect(JSON.parse(String(init?.body))).toEqual({
      events: [
        {
          id: expect.any(String),
          name: "purchase",
          url: "https://shop.example/orders/1",
        },
      ],
      identity: "customer_123",
      source: "server",
    });
  });

  it("leaves out an absent URL and accepts a wallet identity", async () => {
    const fetchSpy = mockService();
    await capture({ ...OPTIONS, identity: WALLET });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.identity).toBe(WALLET);
    expect(Object.keys(body.events[0]).sort()).toEqual(["id", "name"]);
  });

  it("sends a dedupe key in place of a generated event ID", async () => {
    const fetchSpy = mockService();
    await capture({ ...OPTIONS, dedupeKey: "order_1" });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.events).toEqual([{ dedupeKey: "order_1", name: "purchase" }]);
  });

  it.each([
    ["no options", undefined],
    ["an empty dedupe key", { ...OPTIONS, dedupeKey: "" }],
    [
      "a dedupe key over 256 characters",
      { ...OPTIONS, dedupeKey: "x".repeat(257) },
    ],
    ["a missing key", { ...OPTIONS, advertiserKey: undefined }],
    [
      "a publisher key",
      { ...OPTIONS, advertiserKey: "spk_0123456789abcdef0123456789abcd" },
    ],
    ["a short key", { ...OPTIONS, advertiserKey: "sak_123" }],
    ["an empty event name", { ...OPTIONS, event: "" }],
    ["a missing identity", { ...OPTIONS, identity: undefined }],
    ["a blank user ID", { ...OPTIONS, identity: "   " }],
    ["an email address", { ...OPTIONS, identity: "someone@example.com" }],
    ["a user ID over 256 bytes", { ...OPTIONS, identity: "é".repeat(129) }],
    ["a malformed wallet", { ...OPTIONS, identity: "0xbroken" }],
    ["a relative URL", { ...OPTIONS, url: "/checkout" }],
    [
      "an event over 16 KiB",
      { ...OPTIONS, url: `https://shop.example/${"x".repeat(17_000)}` },
    ],
  ])("rejects %s with a ValidationError before sending", async (_, options) => {
    const fetchSpy = mockService();
    const result = capture(options as CaptureOptions);

    await expect(result).rejects.toBeInstanceOf(ValidationError);
    await expect(result).rejects.toBeInstanceOf(CoreValidationError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("tells the integrator what to fix for a malformed wallet", async () => {
    await expect(capture({ ...OPTIONS, identity: "0xbroken" })).rejects.toThrow(
      "identity starts with 0x, so it must be a wallet address: 0x followed by 40 hex characters."
    );
  });

  it("tells the integrator what to fix for a malformed key", async () => {
    await expect(capture({ ...OPTIONS, advertiserKey: "key" })).rejects.toThrow(
      "Invalid advertiser key. Copy it from your Specify dashboard; it starts with sak_."
    );
  });
});

describe("advertiser delivery retries", () => {
  it.each([
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
    ["a 429", () => Promise.resolve(new Response(null, { status: 429 }))],
    ["a 503", () => Promise.resolve(new Response(null, { status: 503 }))],
  ])("tries three times after %s and resolves", async (_, respond) => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(respond);
    const result = capture(OPTIONS);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const sentBodies = fetchSpy.mock.calls.map(([, init]) => init?.body);
    expect(new Set(sentBodies).size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops once a response arrives", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 200 }));
    const result = capture(OPTIONS);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([200, 204, 400, 401, 403, 404])(
    "does not retry a %s",
    async (status) => {
      const fetchSpy = mockService(status);
      await capture(OPTIONS);
      expect(fetchSpy).toHaveBeenCalledOnce();
    }
  );

  it("abandons an attempt after 5 seconds and retries", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    const result = capture(OPTIONS);

    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchSpy).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1 + 1000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000 + 2000 + 5000);
    await expect(result).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
