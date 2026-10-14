import { afterEach, describe, expect, it, vi } from "vitest";
import Specify, { type Address, type SpecifyInitConfig } from "../src";

const WALLET_A = "0x1111111111111111111111111111111111111111";
const WALLET_B = "0x2222222222222222222222222222222222222222";

function mockService(status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status }));
}

function bodies(fetchSpy: ReturnType<typeof mockService>) {
  return fetchSpy.mock.calls.map(([, request]) =>
    JSON.parse(String(request?.body))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("advertiser browser API", () => {
  it("exports only the client at runtime", async () => {
    expect(Object.keys(await import("../src"))).toEqual(["default"]);
  });

  it("contains malformed configuration", () => {
    for (const config of [
      undefined,
      null,
      {},
      { advertiserKey: 1 },
      {
        get advertiserKey() {
          throw new Error("Host unavailable");
        },
      },
    ]) {
      expect(
        () => new Specify(config as unknown as SpecifyInitConfig)
      ).not.toThrow();
    }
  });

  it("uses an explicit capture identity only for that event", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://shop.example/purchase" },
    });
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: "key" });
    await client.identify("remembered");
    await client.identify(WALLET_A);
    await client.capture("user_override", "other");
    await client.capture("wallet_override", WALLET_B);
    await expect(client.capture("invalid", "0xbroken")).resolves.toBeNull();
    client.setCookieConsent(true);
    await client.capture("remembered_identity");

    const [, userOverride, walletOverride, remembered] = bodies(fetchSpy);
    expect(userOverride).toMatchObject({
      userId: "other",
      walletAddresses: [],
    });
    expect(walletOverride).toMatchObject({ walletAddresses: [WALLET_B] });
    expect(walletOverride).not.toHaveProperty("userId");
    expect(remembered).toMatchObject({
      userId: "remembered",
      walletAddresses: [WALLET_A],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it.runIf(typeof window === "undefined")(
    "contains server calls without identity and ignores browser consent",
    async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      client.setCookieConsent(true);
      await expect(client.identify()).resolves.toBeNull();
      await expect(client.identify(null)).resolves.toBeNull();
      await expect(client.capture("purchase")).resolves.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});

describe.runIf(typeof window !== "undefined")(
  "browser identification and buffering",
  () => {
    it("waits for consent and identifies without recording an event", async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      await expect(client.identify(" Customer ")).resolves.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      client.setCookieConsent(true);
      await client.capture("purchase");
      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
        "http://localhost:3000/v1/identify",
        "http://localhost:3000/v1/events",
      ]);
      const [identity, event] = bodies(fetchSpy);
      expect(identity).toEqual({
        cookieConsent: true,
        source: "browser",
        userId: " Customer ",
        walletAddresses: [],
      });
      expect(event.userId).toBe(" Customer ");
      expect(
        fetchSpy.mock.calls.every(
          ([, request]) => request?.credentials === "include"
        )
      ).toBe(true);
    });

    it.each([200, 204, 400, 401, 403, 429, 503])(
      "returns raw %s for both network methods",
      async (status) => {
        const response = new Response(null, { status });
        const json = vi.spyOn(response, "json");
        vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
        const client = new Specify({ advertiserKey: "key" });
        client.setCookieConsent(true);
        await expect(client.identify("customer")).resolves.toBe(status);
        await expect(client.capture("purchase")).resolves.toBe(status);
        expect(json).not.toHaveBeenCalled();
      }
    );

    it("clears wallets and user ID without a network request", async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      await client.identify("A");
      await client.identify([WALLET_A, WALLET_B]);
      await client.identify(null);
      client.setCookieConsent(true);
      await client.capture("cookie_only");
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(bodies(fetchSpy)[0]).toMatchObject({ walletAddresses: [] });
      expect(bodies(fetchSpy)[0]).not.toHaveProperty("userId");
    });

    it("buffers capture snapshots and drains them once in order", async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      const originalUrl = window.location.href;
      try {
        window.history.replaceState(
          null,
          "",
          "/first?spclk=one&spclk=two#receipt"
        );
        const firstUrl = window.location.href;
        await client.identify("A");
        await client.identify(WALLET_A);
        await expect(client.capture("first")).resolves.toBeNull();
        await client.identify(null);
        await client.identify("B");
        await client.identify(WALLET_B);
        window.history.replaceState(null, "", "/second?keep=yes");
        const secondUrl = window.location.href;
        await expect(client.capture("second")).resolves.toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
        client.setCookieConsent(true);
        await client.capture("third");
        client.setCookieConsent(true);
        const [identity, first, second, third] = bodies(fetchSpy);
        expect(identity.userId).toBe("B");
        expect(first).toMatchObject({
          event: { name: "first", url: firstUrl },
          spclk: "one",
          userId: "A",
          walletAddresses: [WALLET_A],
        });
        expect(second).toMatchObject({
          event: { name: "second", url: secondUrl },
          userId: "B",
          walletAddresses: [WALLET_B],
        });
        expect(third.event.name).toBe("third");
        expect(fetchSpy).toHaveBeenCalledTimes(4);
      } finally {
        window.history.replaceState(null, "", originalUrl);
      }
    });

    it("flushes buffered captures when granted even without pending identification", async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      await client.capture("cookie_only");
      client.setCookieConsent(true);
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
      expect(bodies(fetchSpy)[0].event.name).toBe("cookie_only");
    });

    it("serializes identification before capture so cookies can reach later requests", async () => {
      const fetchSpy = mockService();
      let finish: ((value: Response) => void) | undefined;
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const client = new Specify({ advertiserKey: "key" });
      client.setCookieConsent(true);
      const identification = client.identify("A");
      const capture = client.capture("purchase");
      expect(fetchSpy).toHaveBeenCalledOnce();
      finish?.(new Response(null, { status: 200 }));
      await expect(identification).resolves.toBe(200);
      await expect(capture).resolves.toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("cancels unsent identification on reset while preserving captured snapshots", async () => {
      const fetchSpy = mockService();
      let finish: ((value: Response) => void) | undefined;
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const client = new Specify({ advertiserKey: "key" });
      client.setCookieConsent(true);
      const sentIdentification = client.identify("A");
      const pendingIdentification = client.identify("B");
      const pendingCapture = client.capture("before_reset");

      await expect(client.identify(null)).resolves.toBeNull();
      finish?.(new Response(null, { status: 200 }));

      await expect(sentIdentification).resolves.toBe(200);
      await expect(pendingIdentification).resolves.toBeNull();
      await expect(pendingCapture).resolves.toBe(200);
      await expect(client.capture("after_reset")).resolves.toBe(200);
      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
        "http://localhost:3000/v1/identify",
        "http://localhost:3000/v1/events",
        "http://localhost:3000/v1/events",
      ]);
      expect(bodies(fetchSpy)[1]).toMatchObject({
        event: { name: "before_reset" },
        userId: "B",
      });
      expect(bodies(fetchSpy)[2]).not.toHaveProperty("userId");
    });

    it("snapshots consented calls before earlier identification responses arrive", async () => {
      const fetchSpy = mockService();
      let finish: ((value: Response) => void) | undefined;
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const client = new Specify({ advertiserKey: "key" });
      const originalUrl = window.location.href;
      try {
        client.setCookieConsent(true);
        window.history.replaceState(null, "", "/first?spclk=one#first");
        const firstUrl = window.location.href;
        const firstIdentification = client.identify("A");
        const firstCapture = client.capture("first");

        window.history.replaceState(null, "", "/second?spclk=two#second");
        const secondUrl = window.location.href;
        const secondIdentification = client.identify("B");
        const secondCapture = client.capture("second");
        expect(fetchSpy).toHaveBeenCalledOnce();
        finish?.(new Response(null, { status: 200 }));
        await expect(
          Promise.all([
            firstIdentification,
            firstCapture,
            secondIdentification,
            secondCapture,
          ])
        ).resolves.toEqual([200, 200, 200, 200]);

        const [firstIdentity, firstEvent, secondIdentity, secondEvent] =
          bodies(fetchSpy);
        expect(firstIdentity).toMatchObject({ spclk: "one", userId: "A" });
        expect(firstEvent).toMatchObject({
          event: { name: "first", url: firstUrl },
          spclk: "one",
          userId: "A",
        });
        expect(secondIdentity).toMatchObject({ spclk: "two", userId: "B" });
        expect(secondEvent).toMatchObject({
          event: { name: "second", url: secondUrl },
          spclk: "two",
          userId: "B",
        });
      } finally {
        window.history.replaceState(null, "", originalUrl);
      }
    });

    it("pauses remaining requests on withdrawal and resumes without replaying sent requests", async () => {
      vi.useFakeTimers();
      const fetchSpy = mockService();
      let finish: ((value: Response) => void) | undefined;
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const client = new Specify({ advertiserKey: "key" });
      await client.capture("first");
      await client.capture("second");
      client.setCookieConsent(true);
      client.setCookieConsent(false);
      await client.capture("third");
      finish?.(new Response(null, { status: 200 }));
      await vi.waitFor(() => expect(vi.getTimerCount()).toBe(0));
      expect(fetchSpy).toHaveBeenCalledOnce();
      client.setCookieConsent(true);
      await client.capture("last");
      expect(bodies(fetchSpy).map((body) => body.event.name)).toEqual([
        "first",
        "second",
        "third",
        "last",
      ]);
    });

    it("contains failures, advances the queue, and never automatically retries", async () => {
      const fetchSpy = mockService();
      fetchSpy.mockRejectedValueOnce(new Error("Offline"));
      const client = new Specify({ advertiserKey: "key" });
      client.setCookieConsent(true);
      await expect(client.identify("A")).resolves.toBeNull();
      await expect(client.capture("purchase")).resolves.toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("contains failures while flushing captures deferred by consent", async () => {
      const fetchSpy = mockService();
      fetchSpy.mockRejectedValueOnce(new Error("Offline"));
      const client = new Specify({ advertiserKey: "key" });
      await client.capture("first");
      await client.capture("second");
      client.setCookieConsent(true);
      await client.capture("third");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("rejects invalid identification without changing the selected identity", async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      await client.identify("é".repeat(128));
      for (const invalid of [
        "",
        "0xbroken",
        [WALLET_A, "invalid"] as Address[],
      ]) {
        const result = client.identify(invalid);
        expect(result).toBeInstanceOf(Promise);
      }
      client.setCookieConsent(true);
      await client.capture("purchase");
      expect(
        bodies(fetchSpy).every((body) => body.userId === "é".repeat(128))
      ).toBe(true);
      expect(bodies(fetchSpy)[0].walletAddresses).toEqual([]);
    });

    it("passes nonempty user IDs unchanged to the service for validation", async () => {
      const fetchSpy = mockService(400);
      const client = new Specify({ advertiserKey: "key" });
      const userIds = [" ", "x@y", "é".repeat(129)];
      client.setCookieConsent(true);

      await expect(
        Promise.all(userIds.map((userId) => client.identify(userId)))
      ).resolves.toEqual([400, 400, 400]);
      expect(bodies(fetchSpy).map((body) => body.userId)).toEqual(userIds);
      await expect(client.capture("purchase")).resolves.toBe(400);
      expect(bodies(fetchSpy)[3].userId).toBe(userIds[2]);
    });

    it("keeps only the latest identification pending before consent", async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      await client.identify("A");
      await client.identify("B");
      client.setCookieConsent(true);
      await client.capture("purchase");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(bodies(fetchSpy).every((body) => body.userId === "B")).toBe(true);
    });

    it("keeps consent, identity and buffers separate between instances", async () => {
      const fetchSpy = mockService();
      const first = new Specify({ advertiserKey: "first" });
      const second = new Specify({ advertiserKey: "second" });
      await first.identify("A");
      await first.capture("first");
      await second.identify("B");
      await second.capture("second");
      first.setCookieConsent(true);
      await first.capture("last");
      expect(bodies(fetchSpy).every((body) => body.userId === "A")).toBe(true);
      expect(
        fetchSpy.mock.calls.every(
          ([, request]) =>
            new Headers(request?.headers).get("x-api-key") === "first"
        )
      ).toBe(true);
    });

    it("bounds remembered wallets at 50 and refreshes repeated registrations", async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      const wallets = Array.from(
        { length: 51 },
        (_, i) => `0x${i.toString(16).padStart(40, "0")}` as Address
      );
      for (const wallet of wallets) {
        client.identify(wallet);
      }
      client.identify(wallets[0]);
      client.setCookieConsent(true);
      await client.capture("purchase");
      expect(bodies(fetchSpy)[0].walletAddresses).toEqual([
        ...wallets.slice(2),
        wallets[0],
      ]);
    });

    it("ignores empty input and invalid events without buffering", async () => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      await client.identify(undefined);
      await client.identify([]);
      await client.capture("");
      await client.capture(1 as unknown as string);
      client.setCookieConsent(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      const invalid = new Specify({ advertiserKey: "" });
      invalid.setCookieConsent(true);
      await invalid.capture("purchase");
      await invalid.identify("A");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("aborts pending requests at 60 seconds and cleans up timers", async () => {
      vi.useFakeTimers();
      const fetchSpy = mockService();
      fetchSpy.mockImplementationOnce(
        (_url, request) =>
          new Promise((_resolve, reject) => {
            request?.signal?.addEventListener("abort", () =>
              reject(new Error("Timeout"))
            );
          })
      );
      const client = new Specify({ advertiserKey: "key" });
      client.setCookieConsent(true);
      const pending = client.identify("A");
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(pending).resolves.toBeNull();
      await expect(client.capture("purchase")).resolves.toBe(200);
      expect(vi.getTimerCount()).toBe(0);
    });
  }
);
