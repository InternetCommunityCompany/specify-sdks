import { afterEach, describe, expect, it, vi } from "vitest";
import Specify, { type Address, type SpecifyInitConfig } from "../src";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("advertiser SDK initialization", () => {
  it("exports only the client at runtime in the host environment", async () => {
    const sdk = await import("../src");

    expect(Object.keys(sdk)).toEqual(["default"]);
  });

  it("initializes and identifies without contacting the service", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const client = new Specify({
        advertiserKey: "advertiser-test-key",
        getConsent: () => false,
      });
      expect(client).toBeInstanceOf(Specify);
      client.identify("0x1111111111111111111111111111111111111111");
      client.identify("0x2222222222222222222222222222222222222222");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("contains malformed configuration and throwing host accessors", () => {
    const configurations = [
      undefined,
      null,
      {},
      { advertiserKey: 123 },
      { advertiserKey: "" },
      { advertiserKey: "   " },
      {
        get advertiserKey() {
          throw new Error("Host configuration unavailable");
        },
      },
    ];
    for (const config of configurations) {
      expect(() => new Specify(config as SpecifyInitConfig)).not.toThrow();
    }
  });

  it.runIf(typeof window === "undefined")(
    "keeps server calls inactive without reading host configuration",
    async () => {
      const readKey = vi.fn(() => {
        throw new Error("Host key unavailable");
      });
      const readConsent = vi.fn(() => {
        throw new Error("Host consent unavailable");
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const client = new Specify({
        get advertiserKey() {
          return readKey();
        },
        get getConsent() {
          return readConsent();
        },
      });

      client.identify("0x1111111111111111111111111111111111111111");
      await expect(client.capture("purchase")).resolves.toEqual({
        error: "Event capture is only available in a browser.",
        success: false,
      });
      expect(readKey).not.toHaveBeenCalled();
      expect(readConsent).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});

describe.runIf(typeof window !== "undefined")(
  "advertiser browser capture",
  () => {
    it.each([204, 400, 401, 403, 503])(
      "handles an empty %s response without reading JSON",
      async (status) => {
        const response = new Response(null, { status });
        const json = vi.spyOn(response, "json");
        vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
        const client = new Specify({
          advertiserKey: "advertiser-test-key",
          getConsent: () => true,
        });

        await expect(client.capture("purchase")).resolves.toEqual(
          status === 204
            ? { error: null, success: true }
            : {
                error: `Capture could not be confirmed (HTTP ${status}).`,
                success: false,
              }
        );
        expect(json).not.toHaveBeenCalled();
      }
    );

    it("reads consent changes and recovers from a throwing getter", async () => {
      const getConsent = vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockImplementationOnce(() => {
          throw new Error("Consent unavailable");
        })
        .mockReturnValueOnce(true);
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }));
      const client = new Specify({
        advertiserKey: "advertiser-test-key",
        getConsent,
      });

      expect((await client.capture("purchase")).success).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect((await client.capture("purchase")).success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect((await client.capture("purchase")).success).toBe(false);
      expect((await client.capture("purchase")).success).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect((await client.capture("purchase")).success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(getConsent).toHaveBeenCalledTimes(5);
    });

    it("sends the request contract with the current URL and client wallets", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }));
      const config = {
        advertiserKey: "advertiser-test-key",
        getConsent: () => true,
      };
      const client = new Specify(config);
      const wallet = "0x1111111111111111111111111111111111111111";
      const originalUrl = window.location.href;
      client.identify(wallet);
      try {
        window.history.replaceState(null, "", "/signup");
        const signupUrl = window.location.href;
        await client.capture("purchase");
        window.history.replaceState(null, "", "/checkout");
        const checkoutUrl = window.location.href;
        await client.capture("purchase");
        for (const [index, url] of [signupUrl, checkoutUrl].entries()) {
          expect(fetchSpy).toHaveBeenNthCalledWith(
            index + 1,
            "https://spfsrv.com/v1/events",
            {
              body: JSON.stringify({
                cookieConsent: true,
                event: { name: "purchase", url },
                walletAddresses: [wallet],
              }),
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": config.advertiserKey,
              },
              keepalive: true,
              method: "POST",
              signal: expect.any(AbortSignal),
            }
          );
        }
        await new Specify(config).capture("purchase");
        const [, request] = fetchSpy.mock.calls[2];
        expect(JSON.parse(String(request?.body)).walletAddresses).toEqual([]);
        expect(request?.credentials).toBe("include");
        expect(fetchSpy).toHaveBeenCalledTimes(3);
      } finally {
        window.history.replaceState(null, "", originalUrl);
      }
    });

    it("retains recent wallets, rejects invalid batches, and isolates clients", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }));
      const config = {
        advertiserKey: "advertiser-test-key",
        getConsent: () => true,
      };
      const client = new Specify(config);
      const wallets = Array.from(
        { length: 51 },
        (_, index) => `0x${index.toString(16).padStart(40, "0")}` as Address
      );
      client.identify(wallets[0]);
      client.identify(wallets.slice(1, 50));
      client.identify(wallets[0]);
      client.identify(wallets[50]);
      client.identify([wallets[1], "invalid" as Address]);
      client.identify(null);
      client.identify(undefined);

      await client.capture("purchase");
      expect(
        JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).walletAddresses
      ).toEqual([...wallets.slice(2, 50), wallets[0], wallets[50]]);
      await new Specify(config).capture("purchase");
      expect(
        JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).walletAddresses
      ).toEqual([]);
    });

    it.each([
      {
        advertiserKey: "   ",
        error: "Advertiser key is required.",
        name: "purchase",
      },
      {
        advertiserKey: "advertiser-test-key",
        error: "Request validation failed.",
        name: "",
      },
    ])(
      "blocks local input errors: $error",
      async ({ advertiserKey, name, error }) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const client = new Specify({ advertiserKey, getConsent: () => true });
        await expect(client.capture(name)).resolves.toEqual({
          error,
          success: false,
        });
        expect(fetchSpy).not.toHaveBeenCalled();
      }
    );

    it("contains transport failure without retrying and recovers on the next capture", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("Connection lost"))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      const client = new Specify({
        advertiserKey: "advertiser-test-key",
        getConsent: () => true,
      });

      await expect(client.capture("purchase")).resolves.toEqual({
        error: "Capture could not be confirmed.",
        success: false,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      await expect(client.capture("purchase")).resolves.toEqual({
        error: null,
        success: true,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("aborts at 60 seconds and clears timers after every outcome", async () => {
      vi.useFakeTimers();
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementationOnce(
          (_url, request) =>
            new Promise((_resolve, reject) => {
              const signal = request?.signal;
              if (!signal) {
                throw new Error("Missing capture abort signal");
              }
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              });
            })
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockRejectedValueOnce(new Error("Connection lost"));
      const client = new Specify({
        advertiserKey: "advertiser-test-key",
        getConsent: () => true,
      });
      const capture = client.capture("purchase");
      const signal = fetchSpy.mock.calls[0][1]?.signal;

      await vi.advanceTimersByTimeAsync(59_999);
      expect(signal?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(true);
      await expect(capture).resolves.toEqual({
        error: "Capture could not be confirmed.",
        success: false,
      });
      expect(vi.getTimerCount()).toBe(0);
      await expect(client.capture("purchase")).resolves.toEqual({
        error: null,
        success: true,
      });
      expect(vi.getTimerCount()).toBe(0);
      await expect(client.capture("purchase")).resolves.toEqual({
        error: "Capture could not be confirmed.",
        success: false,
      });
      expect(vi.getTimerCount()).toBe(0);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  }
);
