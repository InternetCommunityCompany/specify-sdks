import { describe, expect, it, vi } from "vitest";
import Specify, {
  type Address,
  ImageFormat,
  type SpecifyAd,
  type SpecifyInitConfig,
  ValidationError,
} from "../src";
import {
  distinctWalletAddresses,
  INVALID_PUBLISHER_KEY_MESSAGE,
  LONG_WALLET_ADDRESS,
  LOWER_CASE_WALLET_ADDRESS,
  MIXED_CASE_WALLET_ADDRESS,
  SHORT_WALLET_ADDRESS,
  SOLANA_ADDRESS,
  UNPREFIXED_MOCK_PUBLISHER_KEY,
  VALID_MOCK_PUBLISHER_KEY,
  VALID_MOCK_WALLET_ADDRESS,
} from "./consts";
import { setupMockFetch } from "./helpers";

const mockAd = {
  adId: "A",
  campaignId: "abcd1234567",
  communityLogo: "https://example.com/community.jpg",
  communityName: "Outposts",
  content: "Join the club with the hottest NFTs in the metaverse.",
  ctaLabel: "Mint Now",
  ctaUrl: "https://example.com/click",
  headline: "Bored Ape Yacht Club Collection",
  imageFormat: ImageFormat.LANDSCAPE,
  imageUrl: "https://example.com/image.jpg",
} satisfies SpecifyAd;

function createSpecify(): Specify {
  return new Specify({ publisherKey: VALID_MOCK_PUBLISHER_KEY });
}

function requestBody(request: RequestInit): unknown {
  return JSON.parse(String(request.body));
}

// Listeners are promised a call shortly after a change, not within a set
// number of microtasks, so the wait has to outlast all of them.
function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("Specify", () => {
  describe("constructor", () => {
    it("initializes with a valid publisher key", () => {
      expect(createSpecify()).toBeInstanceOf(Specify);
    });

    it("ignores a removed cookieConsent option", () => {
      expect(
        new Specify({
          // @ts-expect-error cookieConsent is no longer a constructor option
          cookieConsent: true,
          publisherKey: VALID_MOCK_PUBLISHER_KEY,
        })
      ).toBeInstanceOf(Specify);
    });

    it.each([
      ["an unrelated string", "invalid_key"],
      ["a key that is too short", "spk_short"],
      ["a key that is too long", `spk_${"a".repeat(31)}`],
      [
        "a full-length key without the spk_ prefix",
        UNPREFIXED_MOCK_PUBLISHER_KEY,
      ],
    ])("throws ValidationError for %s", (_label, publisherKey) => {
      expect(() => new Specify({ publisherKey })).toThrow(
        new ValidationError(INVALID_PUBLISHER_KEY_MESSAGE)
      );
    });

    it.each([undefined, null, 1])(
      "throws ValidationError for a missing or non-string key (%s)",
      (publisherKey) => {
        expect(
          () => new Specify({ publisherKey } as unknown as SpecifyInitConfig)
        ).toThrow(new ValidationError(INVALID_PUBLISHER_KEY_MESSAGE));
      }
    );
  });

  describe("serve", () => {
    it("returns an ad for a valid wallet address", async () => {
      const specify = createSpecify();
      setupMockFetch(mockAd);

      await expect(
        specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).resolves.toEqual(mockAd);
    });

    it("returns an ad for an array of wallet addresses", async () => {
      const specify = createSpecify();
      setupMockFetch(mockAd);

      await expect(
        specify.serve([VALID_MOCK_WALLET_ADDRESS], {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).resolves.toEqual(mockAd);
    });

    it("sends the configured publisher key", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);

      await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });

      expect(new Headers(requests[0]?.headers).get("x-api-key")).toBe(
        VALID_MOCK_PUBLISHER_KEY
      );
    });

    it("sends the placement and addresses on the wire", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);

      await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        adUnitId: "header",
        imageFormat: ImageFormat.LONG_BANNER,
      });

      expect(requestBody(requests[0] ?? {})).toEqual({
        adUnitId: "header",
        cookieConsent: false,
        imageFormat: ImageFormat.LONG_BANNER,
        walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
      });
    });

    it("deduplicates addresses before sending them", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);

      await specify.serve(
        [VALID_MOCK_WALLET_ADDRESS, VALID_MOCK_WALLET_ADDRESS],
        { imageFormat: ImageFormat.LANDSCAPE }
      );

      expect(requestBody(requests[0] ?? {})).toMatchObject({
        walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
      });
    });

    it("sends case variants of an address once, lowercased", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);

      await specify.serve(
        [MIXED_CASE_WALLET_ADDRESS, LOWER_CASE_WALLET_ADDRESS],
        { imageFormat: ImageFormat.LANDSCAPE }
      );

      expect(requestBody(requests[0] ?? {})).toMatchObject({
        walletAddresses: [LOWER_CASE_WALLET_ADDRESS],
      });
    });

    it("counts case variants as one address toward the limit", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);
      const distinct = distinctWalletAddresses(49);

      await expect(
        specify.serve(
          [...distinct, MIXED_CASE_WALLET_ADDRESS, LOWER_CASE_WALLET_ADDRESS],
          { imageFormat: ImageFormat.LANDSCAPE }
        )
      ).resolves.toEqual(mockAd);
      expect(requestBody(requests[0] ?? {})).toMatchObject({
        walletAddresses: [...distinct, LOWER_CASE_WALLET_ADDRESS],
      });
    });

    it("applies the address limit after deduplication", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);

      await expect(
        specify.serve(
          Array.from({ length: 51 }, () => VALID_MOCK_WALLET_ADDRESS),
          {
            imageFormat: ImageFormat.LANDSCAPE,
          }
        )
      ).resolves.toEqual(mockAd);
      expect(requestBody(requests[0] ?? {})).toMatchObject({
        walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
      });
    });

    it.each([
      ["a Solana address", SOLANA_ADDRESS],
      ["an address without the 0x prefix", "invalid_address" as Address],
      ["an address with non-hex characters", "0xinvalid" as Address],
      ["an address with 39 hex digits", SHORT_WALLET_ADDRESS],
      ["an address with 41 hex digits", LONG_WALLET_ADDRESS],
      [
        "an address wrapped in an array",
        [LOWER_CASE_WALLET_ADDRESS] as unknown as Address,
      ],
    ])("skips %s and serves with the rest", async (_label, address) => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);

      await expect(
        specify.serve([address, VALID_MOCK_WALLET_ADDRESS], {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).resolves.toEqual(mockAd);
      expect(requestBody(requests[0] ?? {})).toMatchObject({
        walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
      });
    });

    it("returns null without a request when no address is an EVM wallet address and there is no consent", async () => {
      const specify = createSpecify();
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      await expect(
        specify.serve(SOLANA_ADDRESS, { imageFormat: ImageFormat.LANDSCAPE })
      ).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns null without a request for an empty address array without consent", async () => {
      const specify = createSpecify();
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      await expect(
        specify.serve([], { imageFormat: ImageFormat.LANDSCAPE })
      ).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts exactly 50 distinct addresses", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);
      const addresses = distinctWalletAddresses(50);

      await expect(
        specify.serve(addresses, { imageFormat: ImageFormat.LANDSCAPE })
      ).resolves.toEqual(mockAd);
      expect(requestBody(requests[0] ?? {})).toMatchObject({
        walletAddresses: addresses,
      });
    });

    it("sends the first 50 of more than 50 distinct addresses", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);
      const addresses = distinctWalletAddresses(51);

      await expect(
        specify.serve(addresses, { imageFormat: ImageFormat.LANDSCAPE })
      ).resolves.toEqual(mockAd);
      expect(requestBody(requests[0] ?? {})).toMatchObject({
        walletAddresses: addresses.slice(0, 50),
      });
    });

    it.each([400, 401, 404, 500, 502, 503])(
      "returns null for an HTTP %s response",
      async (status) => {
        const specify = createSpecify();
        setupMockFetch({ error: "Unable to serve ad" }, status);

        await expect(
          specify.serve(VALID_MOCK_WALLET_ADDRESS, {
            imageFormat: ImageFormat.LANDSCAPE,
          })
        ).resolves.toBeNull();
      }
    );

    it("returns null when the network request fails", async () => {
      const specify = createSpecify();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await expect(
        specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).resolves.toBeNull();
    });

    it("returns null for 204 without parsing the empty body", async () => {
      const specify = createSpecify();
      const { json } = setupMockFetch(undefined, 204);

      await expect(
        specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).resolves.toBeNull();
      expect(json).not.toHaveBeenCalled();
    });

    it("sends cookieConsent false by default", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);

      await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });

      expect(requestBody(requests[0] ?? {})).toMatchObject({
        cookieConsent: false,
      });
    });

    it("omits credentials without consent", async () => {
      const specify = createSpecify();
      const { fetch } = setupMockFetch(mockAd);

      await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://spfsrv.com/v1/ads",
        expect.objectContaining({ credentials: "omit" })
      );
    });

    describe.runIf(typeof window !== "undefined")("browser consent", () => {
      it("includes credentials with consent", async () => {
        const specify = createSpecify();
        specify.setCookieConsent(true);
        const { fetch } = setupMockFetch(mockAd);

        await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        });

        expect(fetch).toHaveBeenCalledWith(
          "https://spfsrv.com/v1/ads",
          expect.objectContaining({ credentials: "include" })
        );
      });

      it("omits credentials again once consent is withdrawn", async () => {
        const specify = createSpecify();
        specify.setCookieConsent(true);
        specify.setCookieConsent(false);
        const { fetch } = setupMockFetch(mockAd);

        await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        });

        expect(fetch).toHaveBeenCalledWith(
          "https://spfsrv.com/v1/ads",
          expect.objectContaining({ credentials: "omit" })
        );
      });
    });

    it("returns a 200 body exactly as received", async () => {
      const specify = createSpecify();
      const response = {
        ...mockAd,
        imageUrl: null,
        serviceMetadata: "unchanged",
      };
      globalThis.fetch = vi.fn().mockResolvedValue(Response.json(response));

      await expect(
        specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.NO_IMAGE,
        })
      ).resolves.toEqual(response);
    });

    it.each([
      ImageFormat.LANDSCAPE,
      ImageFormat.LONG_BANNER,
      ImageFormat.SHORT_BANNER,
      ImageFormat.NO_IMAGE,
    ])("supports image format %s", async (imageFormat) => {
      const specify = createSpecify();
      const response = { ...mockAd, imageFormat };
      setupMockFetch(response);

      await expect(
        specify.serve(VALID_MOCK_WALLET_ADDRESS, { imageFormat })
      ).resolves.toEqual(response);
    });
  });

  describe("serve options overload", () => {
    describe.runIf(typeof window !== "undefined")("browser", () => {
      it("sends an empty address list with the given imageFormat when consent is granted", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);

        specify.setCookieConsent(true);
        await specify.serve({ imageFormat: ImageFormat.LONG_BANNER });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          imageFormat: ImageFormat.LONG_BANNER,
          walletAddresses: [],
        });
      });

      it("puts adUnitId on the wire", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);

        specify.setCookieConsent(true);
        await specify.serve({
          adUnitId: "header",
          imageFormat: ImageFormat.LONG_BANNER,
        });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          adUnitId: "header",
        });
      });
    });

    it("returns null without a request without consent and identified addresses", async () => {
      const specify = createSpecify();
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      await expect(
        specify.serve({ imageFormat: ImageFormat.LONG_BANNER })
      ).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends the same body for a single address and an array with that address", async () => {
      const specify = createSpecify();
      const { requests } = setupMockFetch(mockAd);

      await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });
      await specify.serve([VALID_MOCK_WALLET_ADDRESS], {
        imageFormat: ImageFormat.LANDSCAPE,
      });

      expect(requestBody(requests[0] ?? {})).toEqual(
        requestBody(requests[1] ?? {})
      );
    });

    it.each([undefined, null])("treats %s as no addresses", async (empty) => {
      const specify = createSpecify();
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      await expect(
        specify.serve(empty, { imageFormat: ImageFormat.NO_IMAGE })
      ).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when called with no arguments at all", async () => {
      const specify = createSpecify();

      await expect(
        // @ts-expect-error JavaScript callers can omit every argument
        specify.serve()
      ).rejects.toThrow(
        new ValidationError(
          "serve() needs an options object with an imageFormat; pass serve({ imageFormat }) or serve(addresses, { imageFormat })"
        )
      );
    });
  });

  describe("identify", () => {
    describe.runIf(typeof window !== "undefined")("browser", () => {
      it("rides along on a later options-form serve()", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await specify.serve({ imageFormat: ImageFormat.LANDSCAPE });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
        });
      });

      it("sends the served address first and the identified one after", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);
        const other = `0x${"ab".repeat(20)}` as Address;

        specify.identify(other);
        await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          walletAddresses: [VALID_MOCK_WALLET_ADDRESS, other],
        });
      });

      it("merges across repeated calls and never removes", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);
        const other = `0x${"ab".repeat(20)}` as Address;

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        specify.identify(other);
        await specify.serve({ imageFormat: ImageFormat.LANDSCAPE });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          walletAddresses: [other, VALID_MOCK_WALLET_ADDRESS],
        });
      });

      it("sends a registered address and its case variant once", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);

        specify.identify(MIXED_CASE_WALLET_ADDRESS);
        await specify.serve(LOWER_CASE_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          walletAddresses: [LOWER_CASE_WALLET_ADDRESS],
        });
      });

      it("changes nothing when given an empty array", async () => {
        const specify = createSpecify();
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;

        specify.identify([]);
        await expect(
          specify.serve({ imageFormat: ImageFormat.LANDSCAPE })
        ).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("registers the EVM wallet addresses from a call that mixes in others", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);

        specify.identify([
          SOLANA_ADDRESS,
          VALID_MOCK_WALLET_ADDRESS,
          "0xinvalid" as Address,
        ]);
        await specify.serve({ imageFormat: ImageFormat.LANDSCAPE });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
        });
      });

      it("keeps the 50 most recent registrations", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);
        const addresses = Array.from(
          { length: 55 },
          (_, index) => `0x${index.toString(16).padStart(40, "0")}` as Address
        );

        specify.identify(addresses);
        await specify.serve({ imageFormat: ImageFormat.LANDSCAPE });

        const sent = requestBody(requests[0] ?? {}) as {
          walletAddresses: Address[];
        };
        expect(sent.walletAddresses).toHaveLength(50);
        expect(sent.walletAddresses).not.toContain(addresses[0]);
        expect(sent.walletAddresses).not.toContain(addresses[4]);
        expect(sent.walletAddresses).toContain(addresses[5]);
        expect(sent.walletAddresses).toContain(addresses[54]);
      });

      it("truncates the merge at 50 while keeping every provided address", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);
        const registered = Array.from(
          { length: 50 },
          (_, index) =>
            `0x${(index + 100).toString(16).padStart(40, "0")}` as Address
        );
        const provided = Array.from(
          { length: 3 },
          (_, index) =>
            `0x${(index + 200).toString(16).padStart(40, "0")}` as Address
        );

        specify.identify(registered);
        await specify.serve(provided, { imageFormat: ImageFormat.LANDSCAPE });

        const sent = requestBody(requests[0] ?? {}) as {
          walletAddresses: Address[];
        };
        expect(sent.walletAddresses).toHaveLength(50);
        for (const address of provided) {
          expect(sent.walletAddresses).toContain(address);
        }
      });
    });

    describe.runIf(typeof window === "undefined")("node", () => {
      it("does not throw for a valid address and registers nothing", async () => {
        const specify = createSpecify();
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await expect(
          specify.serve({ imageFormat: ImageFormat.LANDSCAPE })
        ).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("does not throw for a malformed address", () => {
        const specify = createSpecify();

        expect(() =>
          specify.identify("not-an-address" as Address)
        ).not.toThrow();
      });
    });
  });

  describe("onIdentityChange", () => {
    describe.runIf(typeof window !== "undefined")("browser", () => {
      it("calls the listener once for a fresh consent grant, not synchronously", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.onIdentityChange(listener);
        specify.setCookieConsent(true);
        expect(listener).not.toHaveBeenCalled();
        await nextMacrotask();

        expect(listener).toHaveBeenCalledExactlyOnceWith();
      });

      it("calls the listener once when consent is granted twice in a row", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.onIdentityChange(listener);
        specify.setCookieConsent(true);
        specify.setCookieConsent(true);
        await nextMacrotask();

        expect(listener).toHaveBeenCalledTimes(1);
      });

      it("does not call the listener when consent is withdrawn", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.setCookieConsent(true);
        specify.onIdentityChange(listener);
        specify.setCookieConsent(false);
        await nextMacrotask();

        expect(listener).not.toHaveBeenCalled();
      });

      it("calls the listener once for a new address", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.onIdentityChange(listener);
        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();

        expect(listener).toHaveBeenCalledTimes(1);
      });

      it("does not call the listener for an already-registered address, and a later serve() still carries it", async () => {
        const specify = createSpecify();
        const listener = vi.fn();
        const { requests } = setupMockFetch(mockAd);

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();
        specify.onIdentityChange(listener);
        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();
        await specify.serve({ imageFormat: ImageFormat.LANDSCAPE });

        expect(listener).not.toHaveBeenCalled();
        expect(requestBody(requests[0] ?? {})).toMatchObject({
          walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
        });
      });

      it("coalesces three identify() calls into one callback, and a fourth in a later tick into a second", async () => {
        const specify = createSpecify();
        const listener = vi.fn();
        const addresses = ["aa", "bb", "cc"].map(
          (hex) => `0x${hex.repeat(20)}` as Address
        );

        specify.onIdentityChange(listener);
        for (const address of addresses) {
          specify.identify(address);
        }
        await nextMacrotask();
        expect(listener).toHaveBeenCalledTimes(1);

        specify.identify(`0x${"dd".repeat(20)}` as Address);
        await nextMacrotask();
        expect(listener).toHaveBeenCalledTimes(2);
      });

      it("coalesces a new address and a consent grant in the same tick into one callback", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.onIdentityChange(listener);
        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        specify.setCookieConsent(true);
        await nextMacrotask();

        expect(listener).toHaveBeenCalledTimes(1);
      });

      it("produces no callback for a batch with no EVM wallet address", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.onIdentityChange(listener);
        specify.identify([SOLANA_ADDRESS, "0xinvalid" as Address]);
        await nextMacrotask();

        expect(listener).not.toHaveBeenCalled();
      });

      it("produces no callback for an empty batch", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.onIdentityChange(listener);
        specify.identify([]);
        await nextMacrotask();

        expect(listener).not.toHaveBeenCalled();
      });

      it("notifies two listeners, and unsubscribing one leaves the other firing", async () => {
        const specify = createSpecify();
        const first = vi.fn();
        const second = vi.fn();

        const unsubscribeFirst = specify.onIdentityChange(first);
        specify.onIdentityChange(second);

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);

        unsubscribeFirst();
        specify.identify(`0x${"ee".repeat(20)}` as Address);
        await nextMacrotask();
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(2);
      });

      it("treats the same function registered twice as two subscriptions", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        const firstUnsubscribe = specify.onIdentityChange(listener);
        specify.onIdentityChange(listener);

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();
        expect(listener).toHaveBeenCalledTimes(2);

        firstUnsubscribe();
        specify.identify(`0x${"ee".repeat(20)}` as Address);
        await nextMacrotask();
        expect(listener).toHaveBeenCalledTimes(3);
      });

      it("detaches on unsubscribe, and calling the unsubscribe twice does not throw", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        const unsubscribe = specify.onIdentityChange(listener);
        unsubscribe();
        unsubscribe();

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();

        expect(listener).not.toHaveBeenCalled();
      });

      it("does not call a listener unsubscribed during a flush by another listener", async () => {
        const specify = createSpecify();
        const late = vi.fn();
        let detachLate: (() => void) | undefined;

        specify.onIdentityChange(() => {
          detachLate?.();
        });
        detachLate = specify.onIdentityChange(late);

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();

        expect(late).not.toHaveBeenCalled();
      });

      it("swallows a throwing listener without stopping other or later notifications", async () => {
        const specify = createSpecify();
        const afterThrower = vi.fn();
        const otherAddress = `0x${"ee".repeat(20)}` as Address;

        specify.onIdentityChange(() => {
          throw new Error("listener error");
        });
        specify.onIdentityChange(afterThrower);

        expect(() => specify.identify(VALID_MOCK_WALLET_ADDRESS)).not.toThrow();
        await nextMacrotask();
        expect(afterThrower).toHaveBeenCalledTimes(1);

        specify.identify(otherAddress);
        await nextMacrotask();
        expect(afterThrower).toHaveBeenCalledTimes(2);
      });

      it("fires once for a 51st address evicting the oldest, and the next serve() carries 50 without it", async () => {
        const specify = createSpecify();
        const listener = vi.fn();
        const { requests } = setupMockFetch(mockAd);
        const addresses = Array.from(
          { length: 50 },
          (_, index) => `0x${index.toString(16).padStart(40, "0")}` as Address
        );

        specify.identify(addresses);
        await nextMacrotask();
        expect(listener).not.toHaveBeenCalled();

        specify.onIdentityChange(listener);
        const fiftyFirst = `0x${"ff".repeat(20)}` as Address;
        specify.identify(fiftyFirst);
        await nextMacrotask();
        expect(listener).toHaveBeenCalledTimes(1);

        await specify.serve({ imageFormat: ImageFormat.LANDSCAPE });
        const sent = requestBody(requests[0] ?? {}) as {
          walletAddresses: Address[];
        };
        expect(sent.walletAddresses).toHaveLength(50);
        expect(sent.walletAddresses).not.toContain(addresses[0]);
        expect(sent.walletAddresses).toContain(fiftyFirst);
      });

      it("does not fire for a re-identification at the 50-address cap", async () => {
        const specify = createSpecify();
        const listener = vi.fn();
        const addresses = Array.from(
          { length: 50 },
          (_, index) => `0x${index.toString(16).padStart(40, "0")}` as Address
        );

        specify.identify(addresses);
        await nextMacrotask();
        specify.onIdentityChange(listener);

        specify.identify(addresses[25] as Address);
        await nextMacrotask();

        expect(listener).not.toHaveBeenCalled();
      });

      it("does not replay a change to a subscriber added later in the same tick", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        specify.onIdentityChange(listener);
        await nextMacrotask();

        expect(listener).not.toHaveBeenCalled();
      });

      it("does not fire for a case variant of an already-registered address", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        specify.identify(LOWER_CASE_WALLET_ADDRESS);
        await nextMacrotask();
        specify.onIdentityChange(listener);
        specify.identify(MIXED_CASE_WALLET_ADDRESS);
        await nextMacrotask();

        expect(listener).not.toHaveBeenCalled();
      });

      it("notifies once more when a listener registers a new address during the flush", async () => {
        const specify = createSpecify();
        const calls: number[] = [];
        let count = 0;

        specify.onIdentityChange(() => {
          count += 1;
          calls.push(count);
          if (count === 1) {
            specify.identify(`0x${"ab".repeat(20)}` as Address);
          }
        });

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();

        expect(calls).toEqual([1, 2]);
      });

      it("does not loop when a listener re-identifies an address already registered", async () => {
        const specify = createSpecify();
        const listener = vi.fn(() => {
          specify.identify(VALID_MOCK_WALLET_ADDRESS);
        });

        specify.onIdentityChange(listener);
        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        await nextMacrotask();

        expect(listener).toHaveBeenCalledTimes(1);
      });
    });

    describe.runIf(typeof window === "undefined")("node", () => {
      it("returns an unsubscribe function and never calls the listener", async () => {
        const specify = createSpecify();
        const listener = vi.fn();

        const unsubscribe = specify.onIdentityChange(listener);
        expect(unsubscribe).toBeTypeOf("function");

        specify.identify(VALID_MOCK_WALLET_ADDRESS);
        specify.setCookieConsent(true);
        await nextMacrotask();

        expect(listener).not.toHaveBeenCalled();
      });

      it("does not throw when the unsubscribe is called once or twice", () => {
        const specify = createSpecify();

        const unsubscribe = specify.onIdentityChange(() => {
          /* never called without a browser */
        });
        expect(() => unsubscribe()).not.toThrow();
        expect(() => unsubscribe()).not.toThrow();
      });
    });
  });

  describe("setCookieConsent", () => {
    describe.runIf(typeof window !== "undefined")("browser", () => {
      it("updates what the next serve() sends", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);

        specify.setCookieConsent(true);
        await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          cookieConsent: true,
        });
        expect(specify.hasCookieConsent()).toBe(true);
      });

      it.each([[], undefined, null])(
        "issues a request with consent and %s as the addresses",
        async (empty) => {
          const specify = createSpecify();
          const { fetch, requests } = setupMockFetch(undefined, 204);

          specify.setCookieConsent(true);
          await expect(
            specify.serve(empty, { imageFormat: ImageFormat.NO_IMAGE })
          ).resolves.toBeNull();
          expect(fetch).toHaveBeenCalledOnce();
          expect(requestBody(requests[0] ?? {})).toMatchObject({
            cookieConsent: true,
            walletAddresses: [],
          });
        }
      );

      it("withdraws consent granted through the setter", async () => {
        const specify = createSpecify();
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;

        specify.setCookieConsent(true);
        specify.setCookieConsent(false);
        await expect(
          specify.serve([], { imageFormat: ImageFormat.LANDSCAPE })
        ).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(specify.hasCookieConsent()).toBe(false);
      });

      it("is read on each serve, not cached", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);

        specify.setCookieConsent(true);
        await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        });
        specify.setCookieConsent(false);
        await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          cookieConsent: true,
        });
        expect(requestBody(requests[1] ?? {})).toMatchObject({
          cookieConsent: false,
        });
      });
    });

    describe.runIf(typeof window === "undefined")("node", () => {
      it("does not change what serve() sends", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);

        specify.setCookieConsent(true);
        await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          cookieConsent: false,
        });
      });
    });
  });

  describe("hasCookieConsent", () => {
    describe.runIf(typeof window !== "undefined")("browser", () => {
      it("is false on a fresh instance and true after granting", () => {
        const specify = createSpecify();
        expect(specify.hasCookieConsent()).toBe(false);
        specify.setCookieConsent(true);
        expect(specify.hasCookieConsent()).toBe(true);
      });
    });

    describe.runIf(typeof window === "undefined")("node", () => {
      it("stays false because the setter does nothing", () => {
        const specify = createSpecify();
        expect(specify.hasCookieConsent()).toBe(false);
        specify.setCookieConsent(true);
        expect(specify.hasCookieConsent()).toBe(false);
      });
    });
  });

  describe.runIf(typeof window !== "undefined")("separate instances", () => {
    it("keeps one instance's identity and consent out of another", async () => {
      const first = createSpecify();
      const second = createSpecify();
      const secondListener = vi.fn();
      second.onIdentityChange(secondListener);
      const { requests } = setupMockFetch(mockAd);
      const firstAddress = `0x${"ab".repeat(20)}` as Address;

      first.identify(firstAddress);
      first.setCookieConsent(true);
      await first.serve({ imageFormat: ImageFormat.LANDSCAPE });
      await second.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });
      await nextMacrotask();

      expect(requestBody(requests[0] ?? {})).toMatchObject({
        cookieConsent: true,
        walletAddresses: [firstAddress],
      });
      expect(requests[1]?.credentials).toBe("omit");
      expect(requestBody(requests[1] ?? {})).toEqual({
        cookieConsent: false,
        imageFormat: ImageFormat.LANDSCAPE,
        walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
      });
      expect(second.hasCookieConsent()).toBe(false);
      expect(secondListener).not.toHaveBeenCalled();
    });
  });
});
