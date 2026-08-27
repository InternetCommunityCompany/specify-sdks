import { describe, expect, it } from "vitest";
import Specify, {
  type Address,
  APIError,
  AuthenticationError,
  ImageFormat,
  ValidationError,
} from "../src";
import { VALID_MOCK_PUBLISHER_KEY, VALID_MOCK_WALLET_ADDRESS } from "./consts";
import { setupMockFetch } from "./helpers";

interface MockSpecifyAd {
  adId?: string;
  campaignId?: string;
  communityLogo?: string;
  communityName?: string;
  content?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  error?: string;
  headline?: string;
  imageUrl?: string;
  walletAddress?: string;
}

describe("Specify", () => {
  describe("constructor", () => {
    it("should initialize with valid publisher key", () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });
      expect(specify).toBeInstanceOf(Specify);
    });

    it("should throw AuthenticationError with invalid publisher key", () => {
      expect(() => new Specify({ publisherKey: "invalid_key" })).toThrow(
        ValidationError
      );

      expect(() => new Specify({ publisherKey: "spk_short" })).toThrow(
        ValidationError
      );

      // 35 characters, one over the allowed length
      expect(
        () => new Specify({ publisherKey: `spk_${"a".repeat(31)}` })
      ).toThrow(ValidationError);
    });
  });

  describe("serve", () => {
    it("should return content for valid wallet address", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      const mockResponse = {
        adId: "A",
        campaignId: "abcd1234567",
        communityLogo:
          "https://outpostscdn.com/file/outposts/8b44e98c-6753-4d00-91a7-811347bf0888/logos/bbafcd7b-e52c-4e4f-8764-8f45187825f6",
        communityName: "Outposts",
        content: "Join the club with the hottest NFTs in the metaverse.",
        ctaLabel: "Mint Now",
        ctaUrl: "https://boredapeyachtclub.com/collection",
        headline: "Bored Ape Yacht Club Collection",
        imageUrl: "https://example.com/image.jpg",
        walletAddress: VALID_MOCK_WALLET_ADDRESS,
      };

      setupMockFetch<MockSpecifyAd>(mockResponse);

      const content = await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });

      expect(content).toBeDefined();
      expect(content).toHaveProperty(
        "walletAddress",
        VALID_MOCK_WALLET_ADDRESS
      );
      expect(content).toHaveProperty("campaignId", "abcd1234567");
      expect(content).toHaveProperty("adId", "A");
      expect(content).toHaveProperty(
        "headline",
        "Bored Ape Yacht Club Collection"
      );
      expect(content).toHaveProperty(
        "content",
        "Join the club with the hottest NFTs in the metaverse."
      );
      expect(content).toHaveProperty(
        "imageUrl",
        "https://example.com/image.jpg"
      );
      expect(content).toHaveProperty(
        "ctaUrl",
        "https://boredapeyachtclub.com/collection"
      );
      expect(content).toHaveProperty("ctaLabel", "Mint Now");
      expect(content).toHaveProperty("communityName", "Outposts");
      expect(content).toHaveProperty(
        "communityLogo",
        "https://outpostscdn.com/file/outposts/8b44e98c-6753-4d00-91a7-811347bf0888/logos/bbafcd7b-e52c-4e4f-8764-8f45187825f6"
      );
    });

    it("should return content for array of wallet addresses", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      const mockResponse = {
        adId: "A",
        campaignId: "abcd1234567",
        communityLogo:
          "https://outpostscdn.com/file/outposts/8b44e98c-6753-4d00-91a7-811347bf0888/logos/bbafcd7b-e52c-4e4f-8764-8f45187825f6",
        communityName: "Outposts",
        content: "Join the club with the hottest NFTs in the metaverse.",
        ctaLabel: "Mint Now",
        ctaUrl: "https://boredapeyachtclub.com/collection",
        headline: "Bored Ape Yacht Club Collection",
        imageUrl: "https://example.com/image.jpg",
        walletAddress: VALID_MOCK_WALLET_ADDRESS,
      };

      setupMockFetch<MockSpecifyAd>(mockResponse);

      const content = await specify.serve([VALID_MOCK_WALLET_ADDRESS], {
        imageFormat: ImageFormat.LANDSCAPE,
      });

      expect(content).toBeDefined();
      expect(content).toHaveProperty(
        "walletAddress",
        VALID_MOCK_WALLET_ADDRESS
      );
    });

    it("should deduplicate addresses in array", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      const mockResponse = {
        adId: "A",
        campaignId: "abcd1234567",
        communityLogo:
          "https://outpostscdn.com/file/outposts/8b44e98c-6753-4d00-91a7-811347bf0888/logos/bbafcd7b-e52c-4e4f-8764-8f45187825f6",
        communityName: "Outposts",
        content: "Join the club with the hottest NFTs in the metaverse.",
        ctaLabel: "Mint Now",
        ctaUrl: "https://boredapeyachtclub.com/collection",
        headline: "Bored Ape Yacht Club Collection",
        imageUrl: "https://example.com/image.jpg",
        walletAddress: VALID_MOCK_WALLET_ADDRESS,
      };

      setupMockFetch<MockSpecifyAd>(mockResponse);

      // Pass the same address multiple times
      const content = await specify.serve(
        [VALID_MOCK_WALLET_ADDRESS, VALID_MOCK_WALLET_ADDRESS],
        {
          imageFormat: ImageFormat.LANDSCAPE,
        }
      );

      expect(content).toBeDefined();
      expect(content).toHaveProperty(
        "walletAddress",
        VALID_MOCK_WALLET_ADDRESS
      );
    });

    it("should throw ValidationError for invalid wallet address", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

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

    it("should return null for empty address array when no localId is present", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      await expect(
        specify.serve([], { imageFormat: ImageFormat.LANDSCAPE })
      ).resolves.toBeNull();
    });

    it("should throw ValidationError for too many addresses", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      const manyAddresses = Array.from(
        { length: 51 },
        (_, i) => `0x${i.toString().padStart(40, "0")}` as Address
      );

      await expect(
        specify.serve(manyAddresses, { imageFormat: ImageFormat.LANDSCAPE })
      ).rejects.toThrow(ValidationError);
    });

    it("should throw NotFoundError when ad is not found", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      setupMockFetch<MockSpecifyAd>({ error: "Not Found" }, 404);

      const content = await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LANDSCAPE,
      });
      expect(content).toBeNull();
    });

    it("should throw AuthenticationError for 401 status", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      setupMockFetch<MockSpecifyAd>({ error: "Unauthorized" }, 401);

      await expect(
        specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it("should throw ValidationError for 400 status with details", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      const errorResponse = {
        details: [
          { field: "walletAddresses", message: "Invalid address format" },
        ],
        error: "Invalid request",
      };

      setupMockFetch<MockSpecifyAd>(errorResponse, 400);

      const error = await specify
        .serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details).toEqual(errorResponse.details);
    });

    it("should throw APIError with status code for HTTP errors", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      setupMockFetch<MockSpecifyAd>({ error: "Internal Server Error" }, 500);

      const error = await specify
        .serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
        .catch((e) => e);
      expect(error).toBeInstanceOf(APIError);
      expect(error.status).toBe(500);
    });

    it("should throw APIError for network errors", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      setupMockFetch<MockSpecifyAd>({ error: "Network error" }, 0);

      await expect(
        specify.serve(VALID_MOCK_WALLET_ADDRESS, {
          imageFormat: ImageFormat.LANDSCAPE,
        })
      ).rejects.toThrow(APIError);
    });

    it("should return content when imageFormat is provided", async () => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      const mockResponse = {
        adId: "A",
        campaignId: "abcd1234567",
        content: "Test content for long banner image",
        ctaLabel: "Click Here",
        ctaUrl: "https://example.com",
        headline: "Test Ad with Long Banner Format",
        imageId: "long_banner123",
        walletAddress: VALID_MOCK_WALLET_ADDRESS,
      };

      setupMockFetch<MockSpecifyAd>(mockResponse);

      const content = await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: ImageFormat.LONG_BANNER,
      });

      expect(content).toBeDefined();
      expect(content).toHaveProperty(
        "walletAddress",
        VALID_MOCK_WALLET_ADDRESS
      );
      expect(content).toHaveProperty(
        "headline",
        "Test Ad with Long Banner Format"
      );
    });

    it.each([
      ImageFormat.LANDSCAPE,
      ImageFormat.LONG_BANNER,
      ImageFormat.SHORT_BANNER,
      ImageFormat.NO_IMAGE,
    ])("should work with image format %s", async (format) => {
      const specify = new Specify({
        publisherKey: VALID_MOCK_PUBLISHER_KEY,
      });

      const mockResponse = {
        adId: "A",
        campaignId: "abcd1234567",
        content: `Test content for ${format.toLowerCase()}`,
        ctaLabel: "Click Here",
        ctaUrl: "https://example.com",
        headline: `Test Ad with ${format}`,
        imageId: `${format.toLowerCase()}123`,
        walletAddress: VALID_MOCK_WALLET_ADDRESS,
      };

      setupMockFetch<MockSpecifyAd>(mockResponse);

      const content = await specify.serve(VALID_MOCK_WALLET_ADDRESS, {
        imageFormat: format,
      });

      expect(content).toBeDefined();
      expect(content).toHaveProperty("headline", `Test Ad with ${format}`);
      expect(content).toHaveProperty(
        "walletAddress",
        VALID_MOCK_WALLET_ADDRESS
      );
    });
  });
});
