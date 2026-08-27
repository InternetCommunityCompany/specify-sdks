import { getLocalId, removeLocalId, setLocalId } from "./storage";

const API_BASE_URL = "https://app.specify.sh/api";

const WALLET_CACHE_VOID = "WALLET_CACHE_VOID";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

interface ErrorDetail {
  field: string;
  message: string;
}

interface ServeOptions {
  adUnitId?: string;
  imageFormat: ImageFormat;
}

interface ServeResponse extends SpecifyAd {
  localId: string;
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
  cacheMostRecentAddress?: boolean;
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
  imageUrl: string;
  walletAddress: string;
}

export interface APIErrorResponse {
  details?: ErrorDetail[];
  error: string;
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ValidationError extends Error {
  readonly details?: ErrorDetail[];

  constructor(message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

export class APIError extends Error {
  readonly status?: number;

  readonly details?: ErrorDetail[];

  constructor(message: string, status?: number, details?: ErrorDetail[]) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(message = "No ad found for this address") {
    super(message);
    this.name = "NotFoundError";
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

function isSdkError(
  error: unknown
): error is APIError | AuthenticationError | NotFoundError | ValidationError {
  return (
    error instanceof APIError ||
    error instanceof AuthenticationError ||
    error instanceof ValidationError ||
    error instanceof NotFoundError
  );
}

function statusOf(error: unknown): number {
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return 0;
}

/**
 * Specify Publisher SDK client
 *
 * Provides access to publisher content based on end user wallet address.
 */
export default class Specify {
  private readonly publisherKey: string;

  private readonly cacheMostRecentAddress: boolean;

  /**
   * Creates a new Specify client instance
   *
   * @param config - SDK configuration object
   * @param config.publisherKey - Publisher key used for authentication
   * @param config.cacheMostRecentAddress - Whether to cache wallet addresses across requests in the browser's local session. Only available in browser environments. Defaults to false.
   * @throws {ValidationError} When publisher key format is invalid
   */
  constructor(config: SpecifyInitConfig) {
    if (!isValidPublisherKey(config.publisherKey)) {
      throw new ValidationError("Invalid publisher key format");
    }
    this.publisherKey = config.publisherKey;
    this.cacheMostRecentAddress = config.cacheMostRecentAddress ?? false;
  }

  /**
   * Serves content to the specified wallet address(es)
   *
   * @param addressOrAddresses - Single wallet address, array of wallet addresses. Also accepts an empty array, or undefined if relying solely on SDK memory
   * @param options - Configuration options containing imageFormat and optional adUnitId
   * @param options.imageFormat - The desired image format for the ad
   * @param options.adUnitId - arbitrary string id to identify where the ad is being displayed
   * @throws {ValidationError} When wallet address format is invalid
   * @returns Ad content for the specified wallet address or null if the ad is not found
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

    let localId: string | null = null;

    if (this.cacheMostRecentAddress) {
      localId = getLocalId();
    }

    if (uniqueAddresses.length === 0 && !localId) {
      return null;
    }

    if (uniqueAddresses.length > 50) {
      throw new ValidationError("Maximum 50 wallet addresses allowed");
    }

    try {
      const response = await fetch(`${API_BASE_URL}/ads`, {
        body: JSON.stringify({
          adUnitId: options.adUnitId,
          imageFormat: options.imageFormat,
          localId,
          walletAddresses: uniqueAddresses,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.publisherKey,
        },
        method: "POST",
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data: ServeResponse = await response.json();

      this.cacheLocalId(data.localId);

      const { localId: _servedLocalId, ...adData } = data;
      return adData;
    } catch (error) {
      if (isSdkError(error)) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : "Unknown error";
      const failure = new APIError(
        `Failed to fetch ad content: ${reason}`,
        statusOf(error)
      );
      failure.cause = error;
      throw failure;
    }
  }

  /**
   * A 404 is not an error for the caller: the API uses it to hand back or void the cached local id,
   * so the body is read and no ad is reported. Every other unsuccessful status throws.
   */
  private async handleErrorResponse(response: Response): Promise<null> {
    if (response.status === 404) {
      const errorData: ServeResponse = await response.json();
      if (errorData.localId === WALLET_CACHE_VOID) {
        removeLocalId();
      } else if (errorData.localId) {
        setLocalId(errorData.localId);
      }
      return null;
    }

    if (response.status === 401) {
      throw new AuthenticationError("Invalid Publisher key");
    }

    if (response.status === 400) {
      const errorData: APIErrorResponse = await response.json();
      throw new ValidationError(
        errorData.error || "Invalid request",
        errorData.details
      );
    }

    throw new APIError(
      `HTTP error! status: ${response.status}`,
      response.status
    );
  }

  private cacheLocalId(localId: string | undefined): void {
    if (
      this.cacheMostRecentAddress &&
      localId &&
      localId !== WALLET_CACHE_VOID
    ) {
      setLocalId(localId);
    }
  }
}
