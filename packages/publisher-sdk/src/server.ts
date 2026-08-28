import {
  assertValidPublisherKey,
  type Address as CoreAddress,
  ImageFormat as CoreImageFormat,
  type ImageFormat as CoreImageFormatType,
  type SpecifyAd as CoreSpecifyAd,
  ValidationError as CoreValidationError,
  prepareWalletAddresses,
  requestAd,
} from "@specify-sh/core";

export type Address = CoreAddress;
export type ImageFormat = CoreImageFormatType;
export type SpecifyAd = CoreSpecifyAd;
export type ValidationError = CoreValidationError;
export const ImageFormat = CoreImageFormat;
export const ValidationError: typeof CoreValidationError = CoreValidationError;

/**
 * Configuration for a server-side ad request.
 *
 * @param publisherKey - Publisher key used for authentication
 * @param walletAddresses - One or more wallet addresses used for matching
 * @param imageFormat - The desired image format for the ad
 * @param adUnitId - Optional identifier for where the ad is displayed
 */
export interface ServeOptions {
  adUnitId?: string;
  imageFormat: ImageFormat;
  publisherKey: string;
  walletAddresses: Address[];
}

/**
 * Serves an ad from a server using the provided wallet addresses.
 *
 * @param options - Publisher key, wallet addresses, image format, and optional ad unit identifier
 * @returns Ad content on a 200 response, or null for no-fill, API failure, or network failure
 * @throws {ValidationError} When the publisher key or wallet addresses are invalid, the address list is empty, or more than 50 unique addresses are provided
 */
export async function serve(options: ServeOptions): Promise<SpecifyAd | null> {
  assertValidPublisherKey(options.publisherKey);
  if (
    !Array.isArray(options.walletAddresses) ||
    options.walletAddresses.length === 0
  ) {
    throw new ValidationError(
      "serve() needs at least one wallet address. A server request has no identity cookie to fall back on, so there is nothing to match."
    );
  }
  const walletAddresses = prepareWalletAddresses(options.walletAddresses);

  return await requestAd({
    adUnitId: options.adUnitId,
    imageFormat: options.imageFormat,
    publisherKey: options.publisherKey,
    walletAddresses,
  });
}
