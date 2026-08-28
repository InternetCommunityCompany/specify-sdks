import { describe, expect, it, vi } from "vitest";
import {
  type Address,
  ImageFormat,
  type SpecifyAd,
  serve,
  ValidationError,
} from "../src/server";
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

function requestBody(request: RequestInit): Record<string, unknown> {
  return JSON.parse(String(request.body));
}

function options(walletAddresses: Address[] = [VALID_MOCK_WALLET_ADDRESS]) {
  return {
    adUnitId: "header",
    imageFormat: ImageFormat.LANDSCAPE,
    publisherKey: VALID_MOCK_PUBLISHER_KEY,
    walletAddresses,
  };
}

describe("serve", () => {
  it("returns a 200 body exactly as received", async () => {
    const response = { ...mockAd, serviceMetadata: "unchanged" };
    setupMockFetch(response);

    await expect(serve(options())).resolves.toBe(response);
  });

  it("sends the server request without browser identity fields", async () => {
    const { fetch, requests } = setupMockFetch(mockAd);

    await serve(options());

    expect(fetch).toHaveBeenCalledWith(
      "https://spfsrv.com/v1/ads",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": VALID_MOCK_PUBLISHER_KEY,
        }),
      })
    );
    const request = requests[0] ?? {};
    expect(request.credentials).toBeUndefined();
    expect(requestBody(request)).toEqual({
      adUnitId: "header",
      imageFormat: ImageFormat.LANDSCAPE,
      walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
    });
    expect(requestBody(request)).not.toHaveProperty("cookieConsent");
  });

  it("deduplicates addresses before enforcing the limit", async () => {
    const { requests } = setupMockFetch(mockAd);

    await expect(
      serve(
        options(Array.from({ length: 51 }, () => VALID_MOCK_WALLET_ADDRESS))
      )
    ).resolves.toBe(mockAd);
    expect(requestBody(requests[0] ?? {})).toMatchObject({
      walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
    });
  });

  it("rejects a malformed publisher key before requesting", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(
      serve({ ...options(), publisherKey: "invalid" })
    ).rejects.toThrow(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty array", []],
    ["a missing value", undefined],
    ["a non-array value", VALID_MOCK_WALLET_ADDRESS],
  ])("rejects %s before requesting", async (_label, walletAddresses) => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(
      serve({
        ...options(),
        // @ts-expect-error JavaScript callers can provide an invalid value
        walletAddresses,
      })
    ).rejects.toThrow(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed address before requesting", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(serve(options(["0xinvalid" as Address]))).rejects.toThrow(
      ValidationError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects more than 50 unique addresses before requesting", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const addresses = Array.from(
      { length: 51 },
      (_, index) => `0x${index.toString(16).padStart(40, "0")}` as Address
    );

    await expect(serve(options(addresses))).rejects.toThrow(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for 204 without parsing the body", async () => {
    const { json } = setupMockFetch(undefined, 204);

    await expect(serve(options())).resolves.toBeNull();
    expect(json).not.toHaveBeenCalled();
  });

  it.each([400, 401, 404, 500, 502, 503])(
    "returns null for a %s response",
    async (status) => {
      setupMockFetch({}, status);

      await expect(serve(options())).resolves.toBeNull();
    }
  );

  it("returns null when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(serve(options())).resolves.toBeNull();
  });

  it("returns null when a 200 body cannot be parsed", async () => {
    const { json } = setupMockFetch(mockAd);
    json.mockRejectedValue(new SyntaxError("Invalid JSON"));

    await expect(serve(options())).resolves.toBeNull();
  });
});
