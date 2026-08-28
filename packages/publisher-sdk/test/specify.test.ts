import { describe, expect, it, vi } from "vitest";
import Specify, {
  type Address,
  ImageFormat,
  type SpecifyAd,
  ValidationError,
} from "../src";
import { VALID_MOCK_PUBLISHER_KEY, VALID_MOCK_WALLET_ADDRESS } from "./consts";
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

    it("throws ValidationError for an invalid publisher key", () => {
      expect(() => new Specify({ publisherKey: "invalid_key" })).toThrow(
        ValidationError
      );
      expect(() => new Specify({ publisherKey: "spk_short" })).toThrow(
        ValidationError
      );
      expect(
        () => new Specify({ publisherKey: `spk_${"a".repeat(31)}` })
      ).toThrow(ValidationError);
    });
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

    it("applies the address limit after deduplication", async () => {
      const specify = createSpecify();
      setupMockFetch(mockAd);

      await expect(
        specify.serve(
          Array.from({ length: 51 }, () => VALID_MOCK_WALLET_ADDRESS),
          {
            imageFormat: ImageFormat.LANDSCAPE,
          }
        )
      ).resolves.toEqual(mockAd);
    });

    it("throws ValidationError for an invalid wallet address", async () => {
      const specify = createSpecify();

      await expect(
        specify.serve("invalid_address" as Address, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).rejects.toThrow(ValidationError);
      await expect(
        specify.serve("0xinvalid" as Address, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).rejects.toThrow(ValidationError);
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

    it("throws ValidationError for more than 50 unique addresses", async () => {
      const specify = createSpecify();
      const manyAddresses = Array.from(
        { length: 51 },
        (_, index) => `0x${index.toString().padStart(40, "0")}` as Address
      );

      await expect(
        specify.serve(manyAddresses, { imageFormat: ImageFormat.LANDSCAPE })
      ).rejects.toThrow(ValidationError);
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

    it("includes credentials on the request", async () => {
      const specify = createSpecify();
      const { fetch } = setupMockFetch(mockAd);

      await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://spfsrv.com/v1/ads",
        expect.objectContaining({ credentials: "include" })
      );
    });

    it("returns a 200 body exactly as received", async () => {
      const specify = createSpecify();
      const response = {
        ...mockAd,
        imageUrl: null,
        serviceMetadata: "unchanged",
      };
      setupMockFetch(response);

      await expect(
        specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.NO_IMAGE,
        })
      ).resolves.toBe(response);
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

      it.each([undefined, null])(
        "treats %s as no addresses like today",
        async (empty) => {
          const specify = createSpecify();
          const { fetch, requests } = setupMockFetch(undefined, 204);

          specify.setCookieConsent(true);
          await expect(
            specify.serve(empty, { imageFormat: ImageFormat.NO_IMAGE })
          ).resolves.toBeNull();
          expect(fetch).toHaveBeenCalledOnce();
          expect(requestBody(requests[0] ?? {})).toMatchObject({
            walletAddresses: [],
          });
        }
      );
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

    it.each([undefined, null])(
      "treats %s as no addresses like today",
      async (empty) => {
        const specify = createSpecify();
        setupMockFetch(mockAd);

        await expect(
          specify.serve(empty, { imageFormat: ImageFormat.NO_IMAGE })
        ).resolves.toBeNull();
      }
    );

    it("throws ValidationError when called with no arguments at all", async () => {
      const specify = createSpecify();

      await expect(
        // @ts-expect-error JavaScript callers can omit every argument
        specify.serve()
      ).rejects.toThrow(ValidationError);
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

      it("sends a case-duplicated address once, in the caller's casing", async () => {
        const specify = createSpecify();
        const { requests } = setupMockFetch(mockAd);
        const checksummed = `0x${"AbCd".repeat(10)}` as Address;

        specify.identify(checksummed.toLowerCase() as Address);
        await specify.serve(checksummed, {
          imageFormat: ImageFormat.LANDSCAPE,
        });

        expect(requestBody(requests[0] ?? {})).toMatchObject({
          walletAddresses: [checksummed],
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

      it("registers nothing from a call with a malformed address", async () => {
        const specify = createSpecify();
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;

        expect(() =>
          specify.identify([
            VALID_MOCK_WALLET_ADDRESS,
            "not-an-address" as Address,
          ])
        ).toThrow(ValidationError);
        await expect(
          specify.serve({ imageFormat: ImageFormat.LANDSCAPE })
        ).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
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

      it("issues a request with consent and no addresses", async () => {
        const specify = createSpecify();
        const { fetch, requests } = setupMockFetch(undefined, 204);

        specify.setCookieConsent(true);
        await expect(
          specify.serve([], { imageFormat: ImageFormat.NO_IMAGE })
        ).resolves.toBeNull();
        expect(fetch).toHaveBeenCalledOnce();
        expect(requestBody(requests[0] ?? {})).toMatchObject({
          cookieConsent: true,
          walletAddresses: [],
        });
      });

      it("withdraws consent granted through the setter", async () => {
        const specify = createSpecify();
        setupMockFetch(mockAd);
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
});
