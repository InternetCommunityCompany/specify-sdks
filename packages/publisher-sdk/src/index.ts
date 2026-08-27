const SERVE_URL = "https://spfsrv.com/v1/ads";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

interface ErrorDetail {
  field: string;
  message: string;
}

interface ServeOptions {
  adUnitId?: string;
  imageFormat: ImageFormat;
}

export type Address = `0x${string}`;

export const ImageFormat = {
  LANDSCAPE: "LANDSCAPE",
  LONG_BANNER: "LONG_BANNER",
  NO_IMAGE: "NO_IMAGE",
  SHORT_BANNER: "SHORT_BANNER",
} as const;

export type ImageFormat = (typeof ImageFormat)[keyof typeof ImageFormat];

export interface SpecifyInitConfig {
  /**
   * Carries the publisher's own consent signal for Specify's identity cookie.
   * Set this from your CMP on each page load. The SDK never persists it.
   */
  cookieConsent?: boolean;
  publisherKey: string;
}

export interface SpecifyAd {
  adId: string;
  adUnitId?: string;
  campaignId: string;
  communityLogo: string;
  communityName: string;
  content: string;
  ctaLabel: string;
  ctaUrl: string;
  headline: string;
  imageFormat: ImageFormat;
  imageUrl: string | null;
}

export class ValidationError extends Error {
  readonly details?: ErrorDetail[];

  constructor(message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

function isValidPublisherKey(key: string): boolean {
  return key.startsWith("spk_") && key.length === 34;
}

function areValidAddresses(addresses: Address[]): boolean {
  return addresses.every((address) => ADDRESS_PATTERN.test(address));
}

function toAddressArray(
  addressOrAddresses: Address | Address[] | undefined | null
): Address[] {
  if (Array.isArray(addressOrAddresses)) {
    return addressOrAddresses;
  }
  return addressOrAddresses ? [addressOrAddresses] : [];
}

/**
 * Specify Publisher SDK client
 *
 * Provides access to publisher content based on end user wallet address.
 */
export default class Specify {
  private readonly publisherKey: string;

  private readonly cookieConsent: boolean;

  /**
   * Creates a new Specify client instance
   *
   * @param config - SDK configuration object
   * @param config.publisherKey - Publisher key used for authentication
   * @param config.cookieConsent - The publisher's own consent signal for Specify's identity cookie. Set it from your CMP on each page load. The SDK never persists it. Defaults to false.
   * @throws {ValidationError} When publisher key format is invalid
   */
  constructor(config: SpecifyInitConfig) {
    if (!isValidPublisherKey(config.publisherKey)) {
      throw new ValidationError("Invalid publisher key format");
    }
    this.publisherKey = config.publisherKey;
    this.cookieConsent = config.cookieConsent ?? false;
  }

  /**
   * Serves content to the specified wallet address(es)
   *
   * @param addressOrAddresses - Single wallet address, array of wallet addresses, an empty array, or undefined
   * @param options - Configuration options containing imageFormat and optional adUnitId
   * @param options.imageFormat - The desired image format for the ad
   * @param options.adUnitId - arbitrary string id to identify where the ad is being displayed
   * @throws {ValidationError} When a wallet address is malformed or more than 50 unique addresses are provided
   * @returns Ad content on a 200 response, or null for no-fill, API failure, or network failure
   */
  async serve(
    addressOrAddresses: Address | Address[] | undefined | null,
    options: ServeOptions
  ): Promise<SpecifyAd | null> {
    const providedAddresses = toAddressArray(addressOrAddresses);

    if (!areValidAddresses(providedAddresses)) {
      throw new ValidationError("Invalid wallet address format");
    }

    const uniqueAddresses = [...new Set(providedAddresses)];

    if (uniqueAddresses.length === 0 && !this.cookieConsent) {
      return null;
    }

    if (uniqueAddresses.length > 50) {
      throw new ValidationError("Maximum 50 wallet addresses allowed");
    }

    try {
      const response = await fetch(SERVE_URL, {
        body: JSON.stringify({
          adUnitId: options.adUnitId,
          cookieConsent: this.cookieConsent,
          imageFormat: options.imageFormat,
          walletAddresses: uniqueAddresses,
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.publisherKey,
        },
        method: "POST",
      });

      if (response.status === 204) {
        return null;
      }

      if (response.status !== 200) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }
}
