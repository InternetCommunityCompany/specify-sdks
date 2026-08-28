import { ValidationError as CoreValidationError } from "./errors";
import {
  type AdRequest as CoreAdRequest,
  requestAd as coreRequestAd,
} from "./request";
import {
  type Address as CoreAddress,
  ImageFormat as CoreImageFormat,
  type ImageFormat as CoreImageFormatType,
  type SpecifyAd as CoreSpecifyAd,
} from "./types";
import {
  MAX_WALLET_ADDRESSES as CORE_MAX_WALLET_ADDRESSES,
  assertValidAddresses as coreAssertValidAddresses,
  assertValidPublisherKey as coreAssertValidPublisherKey,
  prepareWalletAddresses as corePrepareWalletAddresses,
} from "./validation";

export type AdRequest = CoreAdRequest;
export type Address = CoreAddress;
export type ImageFormat = CoreImageFormatType;
export type SpecifyAd = CoreSpecifyAd;
export const ImageFormat = CoreImageFormat;
export const ValidationError = CoreValidationError;
export const MAX_WALLET_ADDRESSES = CORE_MAX_WALLET_ADDRESSES;
export const assertValidAddresses = coreAssertValidAddresses;
export const assertValidPublisherKey = coreAssertValidPublisherKey;
export const prepareWalletAddresses = corePrepareWalletAddresses;
export const requestAd = coreRequestAd;
