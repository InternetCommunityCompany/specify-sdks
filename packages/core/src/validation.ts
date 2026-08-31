import { ValidationError } from "./errors";
import type { Address } from "./types";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export const MAX_WALLET_ADDRESSES = 50;

export function assertValidPublisherKey(publisherKey: string): void {
  if (!(publisherKey.startsWith("spk_") && publisherKey.length === 34)) {
    throw new ValidationError("Invalid publisher key format");
  }
}

export function assertValidAddresses(addresses: Address[]): void {
  if (!addresses.every((address) => ADDRESS_PATTERN.test(address))) {
    throw new ValidationError("Invalid wallet address format");
  }
}

export function prepareWalletAddresses(addresses: Address[]): Address[] {
  assertValidAddresses(addresses);
  const uniqueAddresses = [...new Set(addresses)];
  if (uniqueAddresses.length > MAX_WALLET_ADDRESSES) {
    throw new ValidationError("Maximum 50 wallet addresses allowed");
  }
  return uniqueAddresses;
}
