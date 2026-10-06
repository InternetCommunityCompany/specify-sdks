import { mkdirSync } from "node:fs";
import Specify from "@specify-sh/advertiser-sdk";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { createIdentityFixture } from "@/lib/identity/fixtures";
import { startEdge } from "./server";
import { storage } from "./storage";

const ORIGIN = "https://spfsrv.com";
const CAPTURE_URL = `${ORIGIN}/v1/events`;
const WALLET_A = "0x1111111111111111111111111111111111111111" as const;
const WALLET_B = "0x2222222222222222222222222222222222222222" as const;
const SUCCESS = { error: null, success: true };

let browser: Browser;
let context: BrowserContext;
let page: Page;
let edge: Awaited<ReturnType<typeof startEdge>>;
let pageErrors: Error[];
let unexpectedRequests: string[];

beforeAll(async () => {
  edge = await startEdge();
  browser = await chromium.launch();
  mkdirSync("test-results", { recursive: true });
});

beforeEach(async () => {
  storage.identity = createIdentityFixture();
  storage.events.length = 0;
  storage.writes.length = 0;
  storage.failingTable = "";
  storage.redisUnavailable = false;
  edge.requests.length = 0;
  edge.errors.length = 0;
  pageErrors = [];
  unexpectedRequests = [];

  // Any accidentally unmocked service must fail locally, even when the host is online.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected server fetch")
  );
  context = await browser.newContext({ serviceWorkers: "block" });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      unexpectedRequests.push(url.href);
      await route.abort();
      return;
    }
    // Preserve browser cookies while sending every request to loopback, never production.
    const response = await route.fetch({
      headers: await route.request().allHeaders(),
      maxRedirects: 0,
      url: `${edge.url}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(`${ORIGIN}/test/visit`);
  await page.waitForFunction(() => Boolean(window.specify));
});

afterEach(async ({ task }) => {
  try {
    expect(edge.errors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally {
    const path =
      task.result?.state === "fail" ? `test-results/${task.id}.zip` : undefined;
    await context?.tracing.stop({ path });
    await context?.close();
    vi.restoreAllMocks();
  }
});

afterAll(async () => {
  await browser?.close();
  await edge?.close();
});

it("keeps initialization and identification local until the visitor grants consent", async () => {
  const result = await page.evaluate(async (wallet) => {
    window.specify.identify(wallet);
    return {
      capture: await window.specify.capture("signup"),
      cookies: document.cookie,
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    };
  }, WALLET_A);
  expect(result).toEqual({
    capture: { error: "Tracking consent is required.", success: false },
    cookies: "",
    localStorage: 0,
    sessionStorage: 0,
  });
  expect(edge.requests).toEqual([]);
  expect(storage.writes).toEqual([]);
  expect(storage.identity.hashes.size).toBe(0);
  expect(await context.cookies()).toEqual([]);

  expect(
    await page.evaluate(() => {
      window.consent = true;
      return window.specify.capture("signup");
    })
  ).toEqual(SUCCESS);
  expect(edge.requests).toHaveLength(1);
  expect(edge.requests[0].body).toEqual({
    cookieConsent: true,
    event: { name: "signup", url: page.url() },
    walletAddresses: [WALLET_A],
  });
  expect(storage.writes).toEqual(["spids", "default.advertiser_events"]);
  expect(storage.events).toEqual([
    {
      advertiser_organization_id: "test-advertiser",
      event_name: "signup",
      spid: storage.identity.spids[0].spid,
      url: page.url(),
    },
  ]);
  expect(storage.identity.spids[0].wallet).toBe(WALLET_A);
});

it("reads consent again after withdrawal and regrant on the same client", async () => {
  expect(
    await page.evaluate(async (wallet) => {
      window.specify.identify(wallet);
      window.consent = true;
      const first = await window.specify.capture("first");
      window.consent = false;
      const withdrawn = await window.specify.capture("withdrawn");
      const stillWithdrawn = await window.specify.capture("still-withdrawn");
      window.consent = true;
      const resumed = await window.specify.capture("resumed");
      return { first, resumed, stillWithdrawn, withdrawn };
    }, WALLET_A)
  ).toEqual({
    first: SUCCESS,
    resumed: SUCCESS,
    stillWithdrawn: { error: "Tracking consent is required.", success: false },
    withdrawn: { error: "Tracking consent is required.", success: false },
  });
  expect(edge.requests).toHaveLength(2);
  expect(storage.events.map((event) => event.event_name)).toEqual([
    "first",
    "resumed",
  ]);
});

it("recovers when the host consent getter stops throwing", async () => {
  const results = await page.evaluate(async (wallet) => {
    const client = new window.Specify({
      advertiserKey: "test-production-key",
      getConsent: () => {
        if (!window.consent) {
          throw new Error("Consent manager not ready");
        }
        return true;
      },
    });
    client.identify(wallet);
    const unavailable = await client.capture("not-ready");
    window.consent = true;
    return { recovered: await client.capture("ready"), unavailable };
  }, WALLET_A);
  expect(results.unavailable.success).toBe(false);
  expect(results.recovered).toEqual(SUCCESS);
  expect(edge.requests).toHaveLength(1);
  expect(storage.events.map((event) => event.event_name)).toEqual(["ready"]);
});

it("refuses anonymous and tampered-cookie captures without creating an identity", async () => {
  const anonymous = await page.evaluate(() => {
    window.consent = true;
    return window.specify.capture("anonymous");
  });
  expect(anonymous).toEqual({
    error:
      "No user identity is available. Provide at least one wallet address or a valid identity cookie.",
    success: false,
  });
  await context.addCookies([
    {
      httpOnly: true,
      name: "spid",
      secure: true,
      url: ORIGIN,
      value: "tampered",
    },
  ]);
  expect(await page.evaluate(() => window.specify.capture("tampered"))).toEqual(
    anonymous
  );
  expect(edge.requests).toHaveLength(2);
  expect(edge.requests[1].cookie).toBe("spid=tampered");
  expect(storage.writes).toEqual([]);
  expect(storage.identity.hashes.size).toBe(0);

  expect(
    await page.evaluate((wallet) => {
      window.specify.identify(wallet);
      return window.specify.capture("wallet-recovery");
    }, WALLET_A)
  ).toEqual(SUCCESS);
  expect(storage.events).toHaveLength(1);
});

it("identifies a returning visitor through the real sealed HttpOnly cookie", async () => {
  expect(
    await page.evaluate((wallet) => {
      window.consent = true;
      window.specify.identify(wallet);
      return window.specify.capture("first-visit");
    }, WALLET_A)
  ).toEqual(SUCCESS);
  const cookies = await context.cookies(ORIGIN);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    httpOnly: true,
    name: "spid",
    sameSite: "None",
    secure: true,
  });
  expect(await page.evaluate(() => document.cookie)).toBe("");

  await page.reload();
  await page.waitForFunction(() => Boolean(window.specify));
  expect(
    await page.evaluate(() => {
      window.consent = true;
      return window.specify.capture("return-visit");
    })
  ).toEqual(SUCCESS);
  expect(edge.requests[1].body.walletAddresses).toEqual([]);
  expect(edge.requests[1].cookie).toBe(`spid=${cookies[0].value}`);
  expect(storage.events).toHaveLength(2);
  expect(storage.events[1].spid).toBe(storage.events[0].spid);
  expect(storage.identity.spids).toHaveLength(1);
});

it("retains changed and disconnected wallets while rejecting an invalid identify batch", async () => {
  expect(
    await page.evaluate(
      async ({ first, second }) => {
        window.consent = true;
        window.specify.identify(first);
        await window.specify.capture("wallet-a");
        window.specify.identify(second);
        window.specify.identify([
          "0x3333333333333333333333333333333333333333",
          "0xinvalid",
        ]);
        window.specify.identify(null);
        return window.specify.capture("disconnected");
      },
      { first: WALLET_A, second: WALLET_B }
    )
  ).toEqual(SUCCESS);
  expect(edge.requests[1].body.walletAddresses).toEqual([WALLET_A, WALLET_B]);
  expect(storage.identity.spids.map((row) => row.wallet)).toEqual([
    WALLET_A,
    WALLET_B,
  ]);
  expect(new Set(storage.events.map((event) => event.spid)).size).toBe(1);
});

it("writes repeated captures separately and reads the current SPA URL", async () => {
  const originalUrl = page.url();
  const results = await page.evaluate(async (wallet) => {
    window.consent = true;
    window.specify.identify(wallet);
    const first = await window.specify.capture("purchase");
    const second = await window.specify.capture("purchase");
    history.pushState({}, "", "/test/checkout?step=complete");
    return [first, second, await window.specify.capture("purchase")];
  }, WALLET_A);
  expect(results).toEqual([SUCCESS, SUCCESS, SUCCESS]);
  expect(edge.requests).toHaveLength(3);
  expect(storage.events.map((event) => event.url)).toEqual([
    originalUrl,
    originalUrl,
    page.url(),
  ]);
  expect(storage.events[1]).toEqual(storage.events[0]);
  expect(new Set(storage.events.map((event) => event.spid)).size).toBe(1);
});

it("validates development captures without writing identities, events, or cookies", async () => {
  expect(
    await page.evaluate((wallet) => {
      const client = new window.Specify({
        advertiserKey: "test-development-key",
        getConsent: () => true,
      });
      client.identify(wallet);
      return client.capture("development");
    }, WALLET_A)
  ).toEqual(SUCCESS);
  expect(edge.requests).toHaveLength(1);
  expect(storage.writes).toEqual([]);
  expect(storage.identity.hashes.size).toBe(0);
  expect(await context.cookies()).toEqual([]);
});

it("passes through invalid-key and unavailable-key-service failures", async () => {
  const invalid = await page.evaluate((wallet) => {
    const client = new window.Specify({
      advertiserKey: "unknown",
      getConsent: () => true,
    });
    client.identify(wallet);
    return client.capture("invalid-key");
  }, WALLET_A);
  expect(invalid).toEqual({ error: "Invalid advertiser key.", success: false });
  storage.redisUnavailable = true;
  expect(
    await page.evaluate((wallet) => {
      window.consent = true;
      window.specify.identify(wallet);
      return window.specify.capture("redis-unavailable");
    }, WALLET_A)
  ).toEqual({
    error: "Advertiser key verification is unavailable.",
    success: false,
  });
  expect(storage.writes).toEqual([]);
  storage.redisUnavailable = false;
  expect(
    await page.evaluate(() => window.specify.capture("recovered"))
  ).toEqual(SUCCESS);
  expect(storage.events).toHaveLength(1);
});

it.each(["spids", "default.advertiser_events"])(
  "reports a %s write failure without confirming capture or setting a cookie",
  async (table) => {
    storage.failingTable = table;
    expect(
      await page.evaluate((wallet) => {
        window.consent = true;
        window.specify.identify(wallet);
        return window.specify.capture("storage-unavailable");
      }, WALLET_A)
    ).toEqual({ error: "Service unavailable.", success: false });
    expect(storage.events).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    if (table === "spids") {
      expect(storage.writes).toEqual(["spids"]);
    }
  }
);

it("recovers after event storage becomes available", async () => {
  storage.failingTable = "default.advertiser_events";
  expect(
    await page.evaluate((wallet) => {
      window.consent = true;
      window.specify.identify(wallet);
      return window.specify.capture("unavailable");
    }, WALLET_A)
  ).toEqual({ error: "Service unavailable.", success: false });
  storage.failingTable = "";
  expect(
    await page.evaluate(() => window.specify.capture("recovered"))
  ).toEqual(SUCCESS);
  expect(storage.events.map((event) => event.event_name)).toEqual([
    "recovered",
  ]);
  expect(storage.identity.spids).toHaveLength(1);
});

it("persists the wallet on retry after an initial identity write failure", async () => {
  storage.failingTable = "spids";
  expect(
    await page.evaluate((wallet) => {
      window.consent = true;
      window.specify.identify(wallet);
      return window.specify.capture("unavailable");
    }, WALLET_A)
  ).toEqual({ error: "Service unavailable.", success: false });
  storage.failingTable = "";
  expect(
    await page.evaluate(() => window.specify.capture("recovered"))
  ).toEqual(SUCCESS);
  expect(storage.events).toHaveLength(1);
  expect(storage.identity.spids).toHaveLength(1);
});

it("contains a dropped connection and unreadable response, then recovers without retries", async () => {
  await page.route(CAPTURE_URL, (route) => route.abort("failed"), { times: 1 });
  const dropped = await page.evaluate((wallet) => {
    window.consent = true;
    window.specify.identify(wallet);
    return window.specify.capture("dropped");
  }, WALLET_A);
  expect(dropped).toEqual({
    error: "Capture could not be confirmed.",
    success: false,
  });
  await page.route(
    CAPTURE_URL,
    (route) => route.fulfill({ body: "not JSON", status: 502 }),
    { times: 1 }
  );
  expect(
    await page.evaluate(() => window.specify.capture("unreadable"))
  ).toEqual(dropped);
  await page.getByRole("button", { name: "Host action" }).click();
  expect(await page.locator("output").textContent()).toBe("Host still works");
  expect(edge.requests).toEqual([]);
  expect(storage.writes).toEqual([]);
  expect(
    await page.evaluate(() => window.specify.capture("recovered"))
  ).toEqual(SUCCESS);
  expect(edge.requests).toHaveLength(1);
  expect(storage.events.map((event) => event.event_name)).toEqual([
    "recovered",
  ]);
});

it("reports a lost response as unconfirmed even when the event was written", async () => {
  await page.route(
    CAPTURE_URL,
    async (route) => {
      await route.fetch({
        headers: await route.request().allHeaders(),
        url: `${edge.url}/v1/events`,
      });
      await route.abort("failed");
    },
    { times: 1 }
  );
  expect(
    await page.evaluate((wallet) => {
      window.consent = true;
      window.specify.identify(wallet);
      return window.specify.capture("lost-response");
    }, WALLET_A)
  ).toEqual({ error: "Capture could not be confirmed.", success: false });
  expect(edge.requests).toHaveLength(1);
  expect(storage.events.map((event) => event.event_name)).toEqual([
    "lost-response",
  ]);
});

it("times out after 60 seconds while leaving the host usable, then recovers", async () => {
  await page.route(
    CAPTURE_URL,
    () => {
      // Deliberately leave the network request pending until the SDK aborts it.
    },
    { times: 1 }
  );
  const started = Date.now();
  const pending = page.evaluate((wallet) => {
    window.consent = true;
    window.specify.identify(wallet);
    return window.specify.capture("timeout");
  }, WALLET_A);
  await page.getByRole("button", { name: "Host action" }).click();
  expect(await page.locator("output").textContent()).toBe("Host still works");
  expect(await pending).toEqual({
    error: "Capture could not be confirmed.",
    success: false,
  });
  expect(Date.now() - started).toBeGreaterThanOrEqual(59_000);
  expect(edge.requests).toEqual([]);
  expect(
    await page.evaluate(() => window.specify.capture("after-timeout"))
  ).toEqual(SUCCESS);
  expect(storage.events.map((event) => event.event_name)).toEqual([
    "after-timeout",
  ]);
}, 75_000);

it("keeps the built advertiser package inactive in Node without reading host configuration", async () => {
  const readConfig = vi.fn(() => {
    throw new Error("Browser-only host configuration");
  });
  const client = new Specify({
    get advertiserKey() {
      return readConfig();
    },
    getConsent: readConfig,
  });
  client.identify(WALLET_A);
  expect(await client.capture("server-render")).toEqual({
    error: "Event capture is only available in a browser.",
    success: false,
  });
  expect(readConfig).not.toHaveBeenCalled();
  expect(edge.requests).toEqual([]);
  expect(storage.writes).toEqual([]);
});
