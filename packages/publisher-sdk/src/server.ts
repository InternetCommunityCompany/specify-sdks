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

/** Options for a server-side ad request */
export interface ServeOptions {
  /** Your own id for this placement, so you can compare placements in reporting */
  adUnitId?: string;
  /** The image format to request */
  imageFormat: ImageFormat;
  /** Your publisher key, which starts with spk_ */
  publisherKey: string;
  /** One or more wallet addresses to match against */
  walletAddresses: Address[];
}

/**
 * Serves an ad from a server
 *
 * @param options - Publisher key, wallet addresses, image format, and an optional ad unit id
 * @returns An ad, or null for no ad, an API failure, or a network failure
 * @throws {ValidationError} When the publisher key or an address is malformed, no addresses are given, or more than 50 are
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
