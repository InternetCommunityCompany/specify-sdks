import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Specify from "../src";

function mockService() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));
}

function bodies(fetchSpy: ReturnType<typeof mockService>) {
  return fetchSpy.mock.calls.map(([, request]) =>
    JSON.parse(String(request?.body))
  );
}

beforeEach(() => {
  vi.stubGlobal("window", {
    location: { href: "https://shop.example/" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("advertiser batching in Node and DOM", () => {
  it("releases 20 buffered events without waiting for pending identification", async () => {
    const fetchSpy = mockService();
    let finish: ((response: Response) => void) | undefined;
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const client = new Specify({ advertiserKey: "key" });
    await client.identify("customer");
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        window.location.href = `https://shop.example/${i}`;
        return expect(client.capture(`event_${i}`)).resolves.toBeNull();
      })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    client.setCookieConsent(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    finish?.(new Response(null, { status: 200 }));
    const [identity, batch] = bodies(fetchSpy);
    expect(identity).not.toHaveProperty("events");
    expect(batch).toMatchObject({
      cookieConsent: true,
      source: "browser",
      userId: "customer",
      walletAddresses: [],
    });
    expect(batch.events).toEqual(
      Array.from({ length: 20 }, (_, i) => ({
        name: `event_${i}`,
        url: `https://shop.example/${i}`,
      }))
    );
  });

  it("splits at 50 events without reordering or losing occurrences", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: "key" });
    const names = Array.from({ length: 101 }, (_, i) => `event_${i}`);
    await Promise.all(names.map((name) => client.capture(name, "customer")));
    client.setCookieConsent(true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    const batches = bodies(fetchSpy);
    expect(batches.map((body) => body.events.length)).toEqual([50, 50, 1]);
    expect(
      batches.flatMap((body) =>
        body.events.map((event: { name: string }) => event.name)
      )
    ).toEqual(names);
  });

  it("splits by UTF-8 body bytes including the identity and JSON envelope", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: "key" });
    const names = ["é".repeat(4500), "😀".repeat(2250), "last"];
    await Promise.all(names.map((name) => client.capture(name, "customer")));
    client.setCookieConsent(true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(bodies(fetchSpy).map((body) => body.events.length)).toEqual([1, 2]);
    for (const [, request] of fetchSpy.mock.calls) {
      expect(
        new TextEncoder().encode(String(request?.body)).byteLength
      ).toBeLessThanOrEqual(16 * 1024);
    }
    expect(
      bodies(fetchSpy).flatMap((body) =>
        body.events.map((event: { name: string }) => event.name)
      )
    ).toEqual(names);
  });

  it.each([false, true])(
    "rejects an individually oversized event and continues with the next one (consent: %s)",
    async (consent) => {
      const fetchSpy = mockService();
      const client = new Specify({ advertiserKey: "key" });
      client.setCookieConsent(consent);
      const oversized = client.capture("é".repeat(9000), "customer");
      const valid = client.capture("valid", "customer");
      await expect(oversized).resolves.toBeNull();
      await expect(valid).resolves.toBe(consent ? 200 : null);
      if (!consent) {
        client.setCookieConsent(true);
        await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
      }
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(bodies(fetchSpy)[0].events).toEqual([
        { name: "valid", url: window.location.href },
      ]);
    }
  );

  it("keeps separate identity and landing snapshots in their original order", async () => {
    const fetchSpy = mockService();
    const client = new Specify({ advertiserKey: "key" });
    const wallet = "0x1111111111111111111111111111111111111111";
    await client.capture("first", "A");
    await client.capture("second", "B");
    await client.capture("third", "A");
    await client.capture("wallet", wallet);
    window.location.href = "https://shop.example/?spclk=one";
    await client.capture("landing_one", wallet);
    window.location.href = "https://shop.example/?spclk=two";
    await client.capture("landing_two", wallet);
    client.setCookieConsent(true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(6));
    expect(
      bodies(fetchSpy).map((body) => [
        body.userId,
        body.spclk,
        body.walletAddresses,
        body.events[0].name,
      ])
    ).toEqual([
      ["A", undefined, [], "first"],
      ["B", undefined, [], "second"],
      ["A", undefined, [], "third"],
      [undefined, undefined, [wallet], "wallet"],
      [undefined, "one", [wallet], "landing_one"],
      [undefined, "two", [wallet], "landing_two"],
    ]);
  });

  it("sends live captures and identifications directly while another capture is in flight", async () => {
    const fetchSpy = mockService();
    let finish: ((response: Response) => void) | undefined;
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const client = new Specify({ advertiserKey: "key" });
    client.setCookieConsent(true);
    const first = client.capture("in_flight", "customer");
    const before = client.capture("before", "customer");
    const identification = client.identify("customer");
    const after = client.capture("after");
    const last = client.capture("last");
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    await expect(
      Promise.all([before, identification, after, last])
    ).resolves.toEqual([200, 200, 200, 200]);
    finish?.(new Response(null, { status: 200 }));
    await expect(
      Promise.all([first, before, identification, after, last])
    ).resolves.toEqual([200, 200, 200, 200, 200]);
    expect(
      bodies(fetchSpy).map(
        (body) =>
          body.events?.map((event: { name: string }) => event.name) ??
          "identify"
      )
    ).toEqual([["in_flight"], ["before"], "identify", ["after"], ["last"]]);
  });

  it.each([200, 400, 429, 503, null])(
    "continues flushing after batch result %s without retrying",
    async (status) => {
      const fetchSpy = mockService();
      if (status === null) {
        fetchSpy.mockRejectedValueOnce(new Error("Offline"));
      } else {
        fetchSpy.mockResolvedValueOnce(new Response(null, { status }));
      }
      const client = new Specify({ advertiserKey: "key" });
      const first = client.capture("first", "customer");
      const second = client.capture("second", "customer");
      const tail = client.capture("tail", "other");
      await expect(Promise.all([first, second, tail])).resolves.toEqual([
        null,
        null,
        null,
      ]);
      expect(fetchSpy).not.toHaveBeenCalled();
      client.setCookieConsent(true);
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
      expect(
        bodies(fetchSpy).map((body) =>
          body.events.map((event: { name: string }) => event.name)
        )
      ).toEqual([["first", "second"], ["tail"]]);
    }
  );

  it("sends consented captures during the backlog flush and returns their own results", async () => {
    const fetchSpy = mockService();
    let finish: ((response: Response) => void) | undefined;
    fetchSpy
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const client = new Specify({ advertiserKey: "key" });
    await client.capture("backlog", "customer");
    await client.capture("backlog_tail", "other");
    client.setCookieConsent(true);
    const first = client.capture("first", "customer");
    const identification = client.identify("customer");
    const second = client.capture("second");
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    await expect(Promise.all([first, identification, second])).resolves.toEqual(
      [202, 200, 429]
    );
    finish?.(new Response(null, { status: 200 }));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(5));
    expect(
      bodies(fetchSpy).map(
        (body) =>
          body.events?.map((event: { name: string }) => event.name) ??
          "identify"
      )
    ).toEqual([
      ["backlog"],
      ["first"],
      "identify",
      ["second"],
      ["backlog_tail"],
    ]);
  });

  it("pauses unsent batches on consent withdrawal and resumes without replay", async () => {
    const fetchSpy = mockService();
    let finish: ((response: Response) => void) | undefined;
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const client = new Specify({ advertiserKey: "key" });
    await Promise.all(
      Array.from({ length: 51 }, (_, i) =>
        client.capture(`event_${i}`, "customer")
      )
    );
    client.setCookieConsent(true);
    client.setCookieConsent(false);
    await expect(client.capture("withdrawn", "customer")).resolves.toBeNull();
    finish?.(new Response(null, { status: 200 }));
    await vi.waitFor(() =>
      expect(fetchSpy.mock.settledResults[0]?.type).toBe("fulfilled")
    );
    expect(fetchSpy).toHaveBeenCalledOnce();
    client.setCookieConsent(true);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(bodies(fetchSpy).map((body) => body.events.length)).toEqual([50, 2]);
    expect(
      bodies(fetchSpy)[1].events.map((event: { name: string }) => event.name)
    ).toEqual(["event_50", "withdrawn"]);
  });
});
