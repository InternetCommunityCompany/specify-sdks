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

function createSpecify(config: { cookieConsent?: boolean } = {}): Specify {
  return new Specify({
    ...config,
    publisherKey: VALID_MOCK_PUBLISHER_KEY,
  });
}

function requestBody(request: RequestInit): unknown {
  return JSON.parse(String(request.body));
}

describe("Specify", () => {
  describe("constructor", () => {
    it("initializes with a valid publisher key", () => {
      expect(createSpecify()).toBeInstanceOf(Specify);
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

    it("sends cookieConsent true when configured", async () => {
      const specify = createSpecify({ cookieConsent: true });
      const { requests } = setupMockFetch(mockAd);

      await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });

      expect(requestBody(requests[0] ?? {})).toMatchObject({
        cookieConsent: true,
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

    it("issues a request with consent and no addresses", async () => {
      const specify = createSpecify({ cookieConsent: true });
      const { fetch, requests } = setupMockFetch(undefined, 204);

      await expect(
        specify.serve([], { imageFormat: ImageFormat.NO_IMAGE })
      ).resolves.toBeNull();
      expect(fetch).toHaveBeenCalledOnce();
      expect(requestBody(requests[0] ?? {})).toMatchObject({
        cookieConsent: true,
        walletAddresses: [],
      });
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
});
