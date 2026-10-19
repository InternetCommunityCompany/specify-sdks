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
  vi.unstubAllGlobals();
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

  it("sends to the API URL it was given", async () => {
    const fetchSpy = mockService();
    await capture({ ...OPTIONS, apiUrl: "https://edge.test/" });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://edge.test/v1/events");
  });

  it("sends to a local API URL", async () => {
    const fetchSpy = mockService();
    await capture({ ...OPTIONS, apiUrl: "http://127.0.0.1:3000" });
    await capture({ ...OPTIONS, apiUrl: "http://[::1]:3000" });

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:3000/v1/events",
      "http://[::1]:3000/v1/events",
    ]);
  });

  it("trims whitespace around the advertiser key", async () => {
    const fetchSpy = mockService();
    await capture({ ...OPTIONS, advertiserKey: ` ${KEY}\n` });

    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-api-key": KEY,
    });
  });

  it("accepts a 256-byte user ID and an event just under 16 KiB", async () => {
    const fetchSpy = mockService();
    const url = `https://shop.example/${"x".repeat(15_900)}`;
    await capture({ ...OPTIONS, identity: "é".repeat(128), url });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.identity).toBe("é".repeat(128));
    expect(body.events[0].url).toBe(url);
  });

  it("sends a mixed-case wallet as given", async () => {
    const fetchSpy = mockService();
    const mixedCase = "0xAbCdEf0000000000000000000000000000000000";
    await capture({ ...OPTIONS, identity: mixedCase });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.identity).toBe(mixedCase);
  });

  it("validates URLs where URL.canParse doesn't exist", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, { canParse: undefined })
    );
    const fetchSpy = mockService();
    await capture({ ...OPTIONS, url: "https://shop.example/checkout" });
    expect(fetchSpy).toHaveBeenCalledOnce();

    await expect(
      capture({ ...OPTIONS, url: "/checkout" })
    ).rejects.toBeInstanceOf(ValidationError);
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
    ["an http API URL", { ...OPTIONS, apiUrl: "http://edge.test" }],
    [
      "an http API URL on a lookalike of localhost",
      { ...OPTIONS, apiUrl: "http://localhost.evil.test" },
    ],
    [
      "an API URL with a username",
      { ...OPTIONS, apiUrl: "https://user@edge.test" },
    ],
    [
      "an API URL with a query string",
      { ...OPTIONS, apiUrl: "https://edge.test/?bypass=1" },
    ],
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

  it.each([
    [
      { ...OPTIONS, advertiserKey: "key" },
      "Invalid advertiser key. Copy it from your Specify dashboard; it starts with sak_.",
    ],
    [
      { ...OPTIONS, event: "" },
      'capture() needs an event name, such as "purchase".',
    ],
    [
      { ...OPTIONS, identity: "0xbroken" },
      "identity starts with 0x, so it must be a wallet address: 0x followed by 40 hex characters.",
    ],
    [
      { ...OPTIONS, identity: "someone@example.com" },
      "identity must be your user ID or a wallet address. A user ID can't be blank, contain @, or be longer than 256 bytes.",
    ],
    [
      { ...OPTIONS, dedupeKey: "" },
      "dedupeKey must be a non-empty string of at most 256 characters, such as your order ID.",
    ],
    [
      { ...OPTIONS, url: "/checkout" },
      "url must be an absolute URL, such as https://shop.example/checkout.",
    ],
    [
      { ...OPTIONS, apiUrl: "http://edge.test" },
      "apiUrl must be an https URL without a query string. Leave it unset unless Specify gave you one.",
    ],
    [
      { ...OPTIONS, url: `https://shop.example/${"x".repeat(17_000)}` },
      "This event is larger than 16 KiB. Shorten its name or url.",
    ],
  ])("tells the integrator what to fix: %#", async (options, message) => {
    await expect(capture(options)).rejects.toThrow(
      new ValidationError(message)
    );
  });
});

describe("advertiser delivery retries", () => {
  it.each<[string, () => Promise<Response>]>([
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
    ...[429, 500, 502, 503, 504, 599].map(
      (status): [string, () => Promise<Response>] => [
        `a ${status}`,
        () => Promise.resolve(new Response(null, { status })),
      ]
    ),
  ])(
    "tries three times after %s, 1 and then 2 seconds apart",
    async (_, respond) => {
      vi.useFakeTimers();
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(respond);
      const result = capture(OPTIONS);

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      const sentBodies = fetchSpy.mock.calls.map(([, init]) => init?.body);
      expect(new Set(sentBodies).size).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

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

  it.each([200, 204, 400, 401, 403, 404, 499])(
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
    expect(fetchSpy.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000 + 2000 + 5000);
    await expect(result).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
