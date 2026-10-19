import { describe, expect, it, vi } from "vitest";
import {
  type Address,
  ImageFormat,
  type SpecifyAd,
  serve,
  ValidationError,
} from "../src/server";
import {
  distinctWalletAddresses,
  INVALID_PUBLISHER_KEY_MESSAGE,
  INVALID_WALLET_ADDRESS_MESSAGE,
  LONG_WALLET_ADDRESS,
  LOWER_CASE_WALLET_ADDRESS,
  MIXED_CASE_WALLET_ADDRESS,
  SHORT_WALLET_ADDRESS,
  UNPREFIXED_MOCK_PUBLISHER_KEY,
  VALID_MOCK_PUBLISHER_KEY,
  VALID_MOCK_WALLET_ADDRESS,
  WALLET_ADDRESS_LIMIT_MESSAGE,
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
    globalThis.fetch = vi.fn().mockResolvedValue(Response.json(response));

    await expect(serve(options())).resolves.toEqual(response);
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

  it.each([
    ["mixed case", MIXED_CASE_WALLET_ADDRESS, LOWER_CASE_WALLET_ADDRESS],
    ["lowercase", LOWER_CASE_WALLET_ADDRESS, MIXED_CASE_WALLET_ADDRESS],
  ])(
    "sends a case-duplicated address once, in the %s given first",
    async (_label, first, second) => {
      const { requests } = setupMockFetch(mockAd);

      await serve(options([first, second]));

      expect(requestBody(requests[0] ?? {})).toMatchObject({
        walletAddresses: [first],
      });
    }
  );

  it("counts case variants as one address toward the limit", async () => {
    const { requests } = setupMockFetch(mockAd);
    const addresses = [
      ...distinctWalletAddresses(49),
      MIXED_CASE_WALLET_ADDRESS,
      LOWER_CASE_WALLET_ADDRESS,
    ];

    await expect(serve(options(addresses))).resolves.toEqual(mockAd);
    expect(requestBody(requests[0] ?? {})).toMatchObject({
      walletAddresses: addresses.slice(0, 50),
    });
  });

  it.each([
    ["an unrelated string", "invalid"],
    [
      "a full-length key without the spk_ prefix",
      UNPREFIXED_MOCK_PUBLISHER_KEY,
    ],
  ])(
    "rejects %s as the publisher key before requesting",
    async (_label, publisherKey) => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      await expect(serve({ ...options(), publisherKey })).rejects.toThrow(
        new ValidationError(INVALID_PUBLISHER_KEY_MESSAGE)
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("rejects a missing publisher key with ValidationError before requesting", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(
      serve({ ...options(), publisherKey: undefined as unknown as string })
    ).rejects.toThrow(new ValidationError(INVALID_PUBLISHER_KEY_MESSAGE));
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
    ).rejects.toThrow(
      new ValidationError(
        "serve() needs at least one wallet address. A server request has no identity cookie to fall back on, so there is nothing to match."
      )
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["without the 0x prefix", "invalid_address" as Address],
    ["with non-hex characters", "0xinvalid" as Address],
    ["with 39 hex digits", SHORT_WALLET_ADDRESS],
    ["with 41 hex digits", LONG_WALLET_ADDRESS],
  ])("rejects an address %s before requesting", async (_label, address) => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(serve(options([address]))).rejects.toThrow(
      new ValidationError(INVALID_WALLET_ADDRESS_MESSAGE)
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 50 distinct addresses", async () => {
    const { requests } = setupMockFetch(mockAd);
    const addresses = distinctWalletAddresses(50);

    await expect(serve(options(addresses))).resolves.toEqual(mockAd);
    expect(requestBody(requests[0] ?? {})).toMatchObject({
      walletAddresses: addresses,
    });
  });

  it("rejects more than 50 unique addresses before requesting", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(serve(options(distinctWalletAddresses(51)))).rejects.toThrow(
      new ValidationError(WALLET_ADDRESS_LIMIT_MESSAGE)
    );
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
