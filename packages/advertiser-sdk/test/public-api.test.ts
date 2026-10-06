import { describe, expect, it, vi } from "vitest";
import Specify, { type SpecifyInitConfig } from "../src";

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

  it("does not read host configuration during server rendering", () => {
    const readKey = vi.fn(() => "advertiser-test-key");
    const client = new Specify({
      get advertiserKey() {
        return readKey();
      },
      getConsent: () => false,
    });
    expect(client).toBeInstanceOf(Specify);
    expect(readKey).toHaveBeenCalledTimes(
      typeof window === "undefined" ? 0 : 1
    );
  });
});
