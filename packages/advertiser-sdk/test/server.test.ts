import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Specify, { type CaptureOptions, type SpecifyInitConfig } from "../src";

beforeEach(() => {
  vi.stubGlobal("window", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("advertiser server requests in Node and DOM", () => {
  it("exports only the shared client at runtime", async () => {
    expect(Object.keys(await import("../src"))).toEqual(["default"]);
  });

  it("requires identity on every capture even after identification", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new Specify({ advertiserKey: "key" });
    client.setCookieConsent(true);

    await expect(client.capture("before_identification")).resolves.toBeNull();
    await expect(client.identify("customer")).resolves.toBe(200);
    await expect(client.capture("after_identification")).resolves.toBeNull();
    await expect(client.identify()).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("selects the environment at each call and never uses server identity as browser state", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new Specify({ advertiserKey: "key" });
    const page = { location: { href: "https://shop.example/?spclk=landing" } };

    vi.stubGlobal("window", page);
    await client.identify("browser_customer");
    client.setCookieConsent(true);
    await client.capture("browser_event");

    vi.stubGlobal("window", undefined);
    await expect(client.capture("missing_identity")).resolves.toBeNull();
    await client.identify("server_customer");
    await client.capture("server_event", "explicit_customer");
    client.setCookieConsent(false);

    vi.stubGlobal("window", page);
    await client.capture("browser_again");

    const requests = fetchSpy.mock.calls.map(([, request]) => ({
      body: JSON.parse(String(request?.body)),
      credentials: request?.credentials,
    }));
    expect(requests).toHaveLength(5);
    expect(requests[2]).toEqual({
      body: { identity: "server_customer", source: "server" },
      credentials: "omit",
    });
    expect(requests[3]).toEqual({
      body: {
        event: { name: "server_event" },
        identity: "explicit_customer",
        source: "server",
      },
      credentials: "omit",
    });
    expect(requests[4]).toEqual({
      body: {
        cookieConsent: true,
        event: { name: "browser_again", url: page.location.href },
        source: "browser",
        spclk: "landing",
        userId: "browser_customer",
        walletAddresses: [],
      },
      credentials: "include",
    });
  });

  it("identifies per call without carrying identity into concurrent captures", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new Specify({ advertiserKey: "key" });
    const wallet = "0x1111111111111111111111111111111111111111";

    await expect(
      Promise.all([
        client.identify(" Customer_A "),
        client.capture("purchase", "Customer_B"),
        client.identify(wallet),
      ])
    ).resolves.toEqual([200, 200, 200]);

    expect(
      fetchSpy.mock.calls.map(([url, request]) => ({
        body: JSON.parse(String(request?.body)),
        credentials: request?.credentials,
        headers: request?.headers,
        method: request?.method,
        url,
      }))
    ).toEqual([
      {
        body: { identity: " Customer_A ", source: "server" },
        credentials: "omit",
        headers: { "Content-Type": "application/json", "x-api-key": "key" },
        method: "POST",
        url: "http://localhost:3000/v1/identify",
      },
      {
        body: {
          event: { name: "purchase" },
          identity: "Customer_B",
          source: "server",
        },
        credentials: "omit",
        headers: { "Content-Type": "application/json", "x-api-key": "key" },
        method: "POST",
        url: "http://localhost:3000/v1/events",
      },
      {
        body: { identity: wallet, source: "server" },
        credentials: "omit",
        headers: { "Content-Type": "application/json", "x-api-key": "key" },
        method: "POST",
        url: "http://localhost:3000/v1/identify",
      },
    ]);
  });

  it("rejects invalid identification and configuration before transport", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = new Specify({ advertiserKey: "key" });

    const invalidIdentities = ["", "0xbroken", ["customer"], null, undefined];
    await Promise.all(
      invalidIdentities.map((identity) =>
        expect(client.identify(identity as string)).resolves.toBeNull()
      )
    );

    await Promise.all(
      [undefined, null, {}, { advertiserKey: " " }].map((config) =>
        expect(
          new Specify(config as SpecifyInitConfig).identify("customer")
        ).resolves.toBeNull()
      )
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["identify", "capture"] as const)(
    "passes nonempty user IDs unchanged for service validation during %s",
    async (operation) => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 400 }));
      const client = new Specify({ advertiserKey: "key" });
      const userIds = [" ", "x@y", "é".repeat(129)];

      await expect(
        Promise.all(
          userIds.map((userId) =>
            operation === "identify"
              ? client.identify(userId)
              : client.capture("purchase", userId)
          )
        )
      ).resolves.toEqual([400, 400, 400]);
      expect(
        fetchSpy.mock.calls.map(
          ([, request]) => JSON.parse(String(request?.body)).identity
        )
      ).toEqual(userIds);
    }
  );

  it.each([200, 400, 401, 429, 503])(
    "returns identify status %s without reading a response body",
    async (status) => {
      const response = new Response(null, { status });
      const readBody = vi.spyOn(response, "json");
      vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

      await expect(
        new Specify({ advertiserKey: "key" }).identify("customer")
      ).resolves.toBe(status);
      expect(readBody).not.toHaveBeenCalled();
    }
  );

  it("preserves exact user IDs and contains identify network failures without retries", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new Specify({ advertiserKey: "key" });

    await expect(client.identify("😀".repeat(64))).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
    await expect(client.identify("é".repeat(128))).resolves.toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({
      identity: "é".repeat(128),
      source: "server",
    });
  });

  it("uses independent exact identities per concurrent call and omits an absent URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new Specify({ advertiserKey: "key" });
    const responses = await Promise.all([
      client.capture("purchase", " Customer_A "),
      client.capture("signup", "Customer_B", {
        url: "https://shop.example/signup?spclk=secret&keep=1&spclk=two",
      }),
      client.capture("purchase", "0x1111111111111111111111111111111111111111"),
    ]);
    expect(responses).toEqual([200, 200, 200]);
    expect(
      fetchSpy.mock.calls.map(([, request]) =>
        JSON.parse(String(request?.body))
      )
    ).toEqual([
      {
        event: { name: "purchase" },
        identity: " Customer_A ",
        source: "server",
      },
      {
        event: {
          name: "signup",
          url: "https://shop.example/signup?spclk=secret&keep=1&spclk=two",
        },
        identity: "Customer_B",
        source: "server",
      },
      {
        event: { name: "purchase" },
        identity: "0x1111111111111111111111111111111111111111",
        source: "server",
      },
    ]);
    for (const [url, request] of fetchSpy.mock.calls) {
      expect(url).toBe("http://localhost:3000/v1/events");
      expect(request?.credentials).toBe("omit");
      expect(request?.headers).toEqual({
        "Content-Type": "application/json",
        "x-api-key": "key",
      });
    }
  });

  it.each([200, 204, 400, 401, 429, 503])(
    "returns empty %s responses without body parsing",
    async (status) => {
      const response = new Response(null, { status });
      const readBody = vi.spyOn(response, "json");
      vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
      await expect(
        new Specify({ advertiserKey: "key" }).capture("purchase", "customer")
      ).resolves.toBe(status);
      expect(readBody).not.toHaveBeenCalled();
    }
  );

  it("contains invalid configuration and rejects invalid calls before transport", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const invalidConfigs = [
      undefined,
      null,
      {},
      { advertiserKey: " " },
      { advertiserKey: 123 },
      {
        get advertiserKey() {
          throw new Error("Key unavailable");
        },
      },
    ];
    await Promise.all(
      invalidConfigs.map((config) =>
        expect(
          new Specify(config as SpecifyInitConfig).capture(
            "purchase",
            "customer"
          )
        ).resolves.toBeNull()
      )
    );
    const client = new Specify({ advertiserKey: "key" });
    const invalidIdentities = ["", "0xbroken", ["customer"], undefined];
    await Promise.all(
      invalidIdentities.map((identity) =>
        expect(
          client.capture("purchase", identity as string)
        ).resolves.toBeNull()
      )
    );
    await expect(client.capture("", "customer")).resolves.toBeNull();
    await expect(
      client.capture("purchase", "customer", { url: "invalid" })
    ).resolves.toBeNull();
    await expect(
      client.capture("purchase", "customer", {
        url: null,
      } as unknown as CaptureOptions)
    ).resolves.toBeNull();
    await expect(
      client.capture("purchase", "customer", {
        get url(): string {
          throw new Error("Host accessor unavailable");
        },
      })
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves exact user IDs and contains capture network failures without retries", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = new Specify({ advertiserKey: "key" });
    await expect(
      client.capture("purchase", "😀".repeat(64))
    ).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
    await expect(client.capture("purchase", "é".repeat(128))).resolves.toBe(
      200
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each(["capture", "identify"] as const)(
    "aborts a pending server %s request and releases its timer",
    async (operation) => {
      vi.useFakeTimers();
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url, request) =>
          new Promise((_resolve, reject) => {
            request?.signal?.addEventListener(
              "abort",
              () => reject(request.signal?.reason),
              { once: true }
            );
          })
      );
      const client = new Specify({ advertiserKey: "key" });
      const result =
        operation === "capture"
          ? client.capture("purchase", "customer")
          : client.identify("customer");
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(result).resolves.toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});
