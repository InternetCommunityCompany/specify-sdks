import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Specify, { type SpecifyInitConfig } from "../src";
import { visit } from "./page";

const KEY = "sak_0123456789abcdef0123456789abcd";
const WALLET_A = "0x1111111111111111111111111111111111111111";
const WALLET_B = "0x2222222222222222222222222222222222222222";
const MIXED_CASE = "0xAbCdEf0000000000000000000000000000000000";

function mockService() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));
}

function requests(fetchSpy: ReturnType<typeof mockService>) {
  return fetchSpy.mock.calls.map(([url, init]) => ({
    body: JSON.parse(String(init?.body)),
    credentials: init?.credentials,
    keepalive: init?.keepalive,
    url: String(url),
  }));
}

function eventNames(fetchSpy: ReturnType<typeof mockService>) {
  return requests(fetchSpy)
    .filter((request) => request.url.endsWith("/events"))
    .map((request) =>
      request.body.events.map((event: { name: string }) => event.name)
    );
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function wallet(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}` as const;
}

beforeEach(() => {
  visit("/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("advertiser browser client", () => {
  it("sends an identified visitor's calls without the cookie before consent, then identifies with it once granted", async () => {
    const landing = visit("/landing?spclk=click-token&spclk=second");
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.identify("customer_123");
    client.capture("signup");

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const [identify, events] = requests(fetchSpy);
    expect(identify).toEqual({
      body: {
        cookieConsent: false,
        source: "browser",
        spclk: "click-token",
        userId: "customer_123",
        walletAddresses: [],
      },
      credentials: "omit",
      keepalive: true,
      url: "https://spfsrv.com/v1/identify",
    });
    expect(events.url).toBe("https://spfsrv.com/v1/events");
    expect(events.credentials).toBe("omit");
    expect(events.body.events).toEqual([
      { id: expect.any(String), name: "signup", url: landing },
    ]);
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-api-key": KEY,
    });

    client.setCookieConsent(true);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(requests(fetchSpy)[2]).toMatchObject({
      body: {
        cookieConsent: true,
        spclk: "click-token",
        userId: "customer_123",
      },
      credentials: "include",
      url: "https://spfsrv.com/v1/identify",
    });
  });

  it("sends events from an ad click before consent, without the cookie", async () => {
    visit("/landing?spclk=click-token");
    const fetchSpy = mockService();
    new Specify({ advertiserKey: KEY }).capture("signup");

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(requests(fetchSpy)[0]).toMatchObject({
      body: { cookieConsent: false, spclk: "click-token" },
      credentials: "omit",
      url: "https://spfsrv.com/v1/events",
    });
  });

  it("holds an unidentified visitor's events until consent, then sends them with the cookie", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.capture("anonymous");
    client.identify("customer");
    client.capture("identified");
    client.reset();
    client.capture("signed_out");
    await settle();
    expect(eventNames(fetchSpy)).toEqual([["identified"]]);

    client.setCookieConsent(true);

    await vi.waitFor(() =>
      expect(eventNames(fetchSpy)).toEqual([
        ["identified"],
        ["anonymous", "signed_out"],
      ])
    );
    const held = requests(fetchSpy).at(-1);
    expect(held?.credentials).toBe("include");
    expect(held?.body).toMatchObject({
      cookieConsent: true,
      walletAddresses: [],
    });
    expect(held?.body).not.toHaveProperty("userId");
  });

  it("drops an unidentified visitor's events after a refusal and sends the rest without the cookie", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.capture("held");
    client.setCookieConsent(false);
    client.capture("anonymous");
    client.identify(WALLET_A);
    client.capture("live");

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(eventNames(fetchSpy)).toEqual([["live"]]);
    for (const request of requests(fetchSpy)) {
      expect(request.credentials).toBe("omit");
      expect(request.body.cookieConsent).toBe(false);
    }
  });

  it("identifies again with the cookie when consent follows a refusal, and not when it is withdrawn", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.setCookieConsent(false);
    client.identify("customer");
    client.setCookieConsent(true);
    client.setCookieConsent(true);
    client.setCookieConsent(false);
    await settle();

    expect(
      requests(fetchSpy).map((request) => [request.url, request.credentials])
    ).toEqual([
      ["https://spfsrv.com/v1/identify", "omit"],
      ["https://spfsrv.com/v1/identify", "include"],
    ]);
  });

  it("keeps the identity and page each event had when it was captured", async () => {
    const landing = visit("/landing?spclk=click-token");
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.identify("first");
    client.capture("landing");
    const checkout = visit("/checkout");
    client.identify("second");
    client.capture("checkout");

    await vi.waitFor(() => expect(eventNames(fetchSpy)).toHaveLength(2));
    const [first, second] = requests(fetchSpy).filter((request) =>
      request.url.endsWith("/events")
    );
    expect(first.body).toMatchObject({
      events: [{ name: "landing", url: landing }],
      userId: "first",
    });
    expect(second.body).toMatchObject({
      events: [{ name: "checkout", url: checkout }],
      userId: "second",
    });
  });

  it("remembers the ad click after the visitor navigates away from the landing page", async () => {
    visit("/landing?spclk=click-token");
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    visit("/account");
    client.identify("customer");
    client.capture("signup");
    client.setCookieConsent(true);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    for (const request of requests(fetchSpy)) {
      expect(request.body.spclk).toBe("click-token");
    }
  });

  it("identifies on an ad click alone once consent is granted, but not after a refusal", async () => {
    visit("/landing?spclk=click-token");
    const fetchSpy = mockService();
    new Specify({ advertiserKey: KEY }).setCookieConsent(false);
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();

    new Specify({ advertiserKey: KEY }).setCookieConsent(true);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(requests(fetchSpy)[0]?.body).toEqual({
      cookieConsent: true,
      source: "browser",
      spclk: "click-token",
      walletAddresses: [],
    });
  });

  it("ignores an ad click token longer than 1024 characters", async () => {
    visit(`/landing?spclk=${"x".repeat(1025)}`);
    const fetchSpy = mockService();
    new Specify({ advertiserKey: KEY }).identify("customer");

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(requests(fetchSpy)[0]?.body).not.toHaveProperty("spclk");
  });

  it("ignores invalid identities without replacing the current one", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.identify("customer");
    for (const invalid of [
      "",
      "   ",
      "someone@example.com",
      "x".repeat(257),
      "0xbroken",
      ["0xbroken", WALLET_A],
      [],
    ]) {
      client.identify(invalid as string);
    }
    await settle();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(requests(fetchSpy)[0]?.body).toMatchObject({
      userId: "customer",
      walletAddresses: [],
    });
  });

  it("replaces the user ID, adds lowercased wallets, and keeps the 50 most recent", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.identify("one");
    client.identify("two");
    client.identify(MIXED_CASE);
    client.identify([WALLET_B, MIXED_CASE.toLowerCase() as `0x${string}`]);
    const wallets = Array.from({ length: 50 }, (_, index) => wallet(index + 1));
    client.identify(wallets);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(5));
    const [first, second] = requests(fetchSpy).slice(3);
    expect(first?.body).toMatchObject({
      userId: "two",
      walletAddresses: [WALLET_B, MIXED_CASE.toLowerCase()],
    });
    expect(second?.body.walletAddresses).toEqual(wallets);
  });

  it("skips an identify that matches the last one sent", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.setCookieConsent(true);
    client.identify("customer");
    client.identify("customer");
    client.identify("customer");
    client.reset();
    client.identify("customer");
    await settle();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("forgets the identity and ad click on reset but keeps what earlier events captured", async () => {
    visit("/landing?spclk=click-token");
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.identify("customer");
    client.identify(WALLET_A);
    client.capture("before");
    visit("/account");
    client.reset();
    client.capture("after");
    client.setCookieConsent(true);

    await vi.waitFor(() => expect(eventNames(fetchSpy)).toHaveLength(2));
    const [before, after] = requests(fetchSpy).filter((request) =>
      request.url.endsWith("/events")
    );
    expect(before?.body).toMatchObject({
      spclk: "click-token",
      userId: "customer",
      walletAddresses: [WALLET_A],
    });
    expect(after?.body).not.toHaveProperty("userId");
    expect(after?.body).not.toHaveProperty("spclk");
    expect(after?.body.walletAddresses).toEqual([]);
  });

  it("sends events without an ID where randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.setCookieConsent(true);
    client.capture("purchase");

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(Object.keys(requests(fetchSpy)[0]?.body.events[0]).sort()).toEqual([
      "name",
      "url",
    ]);
  });

  it("retries in the browser and drops the cookie when consent is withdrawn between attempts", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = new Specify({ advertiserKey: KEY });
    client.setCookieConsent(true);
    client.capture("purchase");
    await vi.advanceTimersByTimeAsync(0);
    client.setCookieConsent(false);
    await vi.advanceTimersByTimeAsync(1000);

    const [first, second] = requests(fetchSpy);
    expect([first?.credentials, first?.body.cookieConsent]).toEqual([
      "include",
      true,
    ]);
    expect([second?.credentials, second?.body.cookieConsent]).toEqual([
      "omit",
      false,
    ]);
    expect(second?.body.events).toEqual(first?.body.events);
  });

  it("returns nothing from any method", () => {
    mockService();
    const client = new Specify({ advertiserKey: KEY });
    expect(client.setCookieConsent(true)).toBeUndefined();
    expect(client.identify("customer")).toBeUndefined();
    expect(client.capture("purchase")).toBeUndefined();
    expect(client.reset()).toBeUndefined();
  });

  it("does nothing without a well-formed advertiser key", async () => {
    const fetchSpy = mockService();
    for (const config of [
      undefined,
      null,
      {},
      { advertiserKey: 1 },
      { advertiserKey: "  " },
      { advertiserKey: "sak_123" },
      { advertiserKey: "spk_0123456789abcdef0123456789abcd" },
    ]) {
      const client = new Specify(config as unknown as SpecifyInitConfig);
      client.identify("customer");
      client.capture("purchase");
      client.setCookieConsent(true);
    }
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing on a page without a location", async () => {
    vi.stubGlobal("window", {});
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: KEY });
    client.identify("customer");
    client.capture("purchase");
    client.setCookieConsent(true);
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.runIf(typeof window === "undefined")(
    "does nothing outside a browser",
    async () => {
      vi.unstubAllGlobals();
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: KEY });
      client.setCookieConsent(true);
      client.identify("customer");
      client.capture("purchase");
      await settle();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});
