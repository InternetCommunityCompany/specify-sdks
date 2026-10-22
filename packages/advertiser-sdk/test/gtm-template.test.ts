import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { install } from "../src/command-queue";
import { visit } from "./page";

const template = readFileSync(
  resolve(import.meta.dirname, "../../../gtm/template.tpl"),
  "utf8"
);
const code = template
  .split("___SANDBOXED_JS_FOR_WEB_TEMPLATE___")[1]
  ?.split("___WEB_PERMISSIONS___")[0];
const KEY = "sak_0123456789abcdef0123456789abcd";
const API = "http://localhost:3001";
const WALLET = "0x1111111111111111111111111111111111111111";

function setup(loadScript = true) {
  const queue: unknown[] = [];
  const entry = vi.fn((...command: unknown[]) => queue.push(command));
  const host = { specifyAdvertiser: Object.assign(entry, { q: queue }) };
  const injectScript = vi.fn(
    (_url: string, success: () => void, failure: () => void) => {
      if (loadScript) {
        install(host);
        success();
      } else {
        failure();
      }
    }
  );
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));

  return {
    entry,
    fetchSpy,
    injectScript,
    run(fields: Record<string, unknown>) {
      const data = {
        gtmOnFailure: vi.fn(),
        gtmOnSuccess: vi.fn(),
        ...fields,
      };
      runInNewContext(`(function () { ${code} })()`, {
        data,
        require: (name: string) =>
          name === "createArgumentsQueue" ? () => entry : injectScript,
      });
      return data;
    },
  };
}

beforeEach(() => visit("/"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GTM template with the advertiser SDK", () => {
  it("delivers commands queued before initialization to the configured local API", async () => {
    const { run, fetchSpy, injectScript } = setup();
    run({ action: "identify", identity: "customer" });
    run({ action: "capture", eventName: "signup" });
    expect(fetchSpy).not.toHaveBeenCalled();

    const data = run({
      action: "init",
      advertiserKey: KEY,
      apiUrl: API,
      scriptUrl: "https://spfsrv.com/sdk/advertiser.js",
    });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(injectScript).toHaveBeenCalledWith(
      "https://spfsrv.com/sdk/advertiser.js",
      data.gtmOnSuccess,
      data.gtmOnFailure,
      "specify-advertiser"
    );
    expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
    const [url, request] = fetchSpy.mock.calls[1] ?? [];
    expect(url).toBe(`${API}/v1/events`);
    expect(request?.credentials).toBe("omit");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      events: [{ name: "signup" }],
      userId: "customer",
    });
  });

  it("holds an unidentified event until an explicit consent grant", async () => {
    const { run, fetchSpy } = setup();
    run({ action: "init", advertiserKey: KEY, apiUrl: API, scriptUrl: "sdk" });
    run({ action: "capture", eventName: "signup" });
    const unknown = run({ action: "setCookieConsent" });
    expect(unknown.gtmOnFailure).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    run({ action: "setCookieConsent", cookieConsent: "true" });

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  it.each([false, "false"])(
    "forwards consent denial %s without interpreting it as truthy",
    async (cookieConsent) => {
      const { run, fetchSpy } = setup();
      run({
        action: "init",
        advertiserKey: KEY,
        apiUrl: API,
        scriptUrl: "sdk",
      });
      run({ action: "setCookieConsent", cookieConsent: true });
      run({ action: "identify", identity: "customer" });
      run({ action: "setCookieConsent", cookieConsent });
      run({ action: "capture", eventName: "signup" });

      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
      const request = fetchSpy.mock.calls[1]?.[1];
      expect(request?.credentials).toBe("omit");
      expect(JSON.parse(String(request?.body))).toMatchObject({
        cookieConsent: false,
        userId: "customer",
      });
    }
  );

  it("passes wallet arrays through and clears both wallets and user ID on logout", async () => {
    const { run, fetchSpy } = setup();
    run({ action: "init", advertiserKey: KEY, apiUrl: API, scriptUrl: "sdk" });
    run({ action: "identify", identity: [WALLET] });
    run({ action: "identify", identity: "first-user" });
    run({ action: "capture", eventName: "before-logout" });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchSpy.mock.calls[2]?.[1]?.body))).toMatchObject(
      {
        userId: "first-user",
        walletAddresses: [WALLET],
      }
    );

    run({ action: "reset" });
    run({ action: "identify", identity: "second-user" });
    run({ action: "capture", eventName: "after-logout" });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(5));
    expect(JSON.parse(String(fetchSpy.mock.calls[4]?.[1]?.body))).toMatchObject(
      {
        events: [{ name: "after-logout" }],
        userId: "second-user",
        walletAddresses: [],
      }
    );
  });

  it("reports a failed SDK download without claiming success", () => {
    const { run, fetchSpy } = setup(false);
    const data = run({
      action: "init",
      advertiserKey: KEY,
      apiUrl: API,
      scriptUrl: "sdk",
    });
    expect(data.gtmOnFailure).toHaveBeenCalledOnce();
    expect(data.gtmOnSuccess).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("can use a separately loaded local script without downloading another", () => {
    const { run, injectScript, entry } = setup();
    const data = run({ action: "init", advertiserKey: KEY, apiUrl: API });
    expect(entry).toHaveBeenCalledWith("init", {
      advertiserKey: KEY,
      apiUrl: API,
    });
    expect(injectScript).not.toHaveBeenCalled();
    expect(data.gtmOnSuccess).toHaveBeenCalledOnce();
  });

  it.each(["unknown", 1, null, undefined])(
    "rejects ambiguous consent %s and unsupported actions without queueing them",
    (cookieConsent) => {
      const { run, entry } = setup();
      const consent = run({ action: "setCookieConsent", cookieConsent });
      const action = run({ action: "unsupported" });
      expect(consent.gtmOnFailure).toHaveBeenCalledOnce();
      expect(action.gtmOnFailure).toHaveBeenCalledOnce();
      expect(entry).not.toHaveBeenCalled();
    }
  );
});
