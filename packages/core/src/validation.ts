import { ValidationError } from "./errors.js";
import type { Address } from "./types.js";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export const MAX_WALLET_ADDRESSES = 50;

export function assertValidPublisherKey(publisherKey: string): void {
  if (
    !(
      typeof publisherKey === "string" &&
      publisherKey.startsWith("spk_") &&
      publisherKey.length === 34
    )
  ) {
    throw new ValidationError("Invalid publisher key format");
  }
}

export function assertValidAddresses(addresses: Address[]): void {
  if (!addresses.every((address) => ADDRESS_PATTERN.test(address))) {
    throw new ValidationError("Invalid wallet address format");
  }
}

// Sites pass addresses from other chains, such as Solana, alongside EVM ones,
// and those must not cost the visitor an ad, so they are skipped.
export function prepareWalletAddresses(addresses: Address[]): Address[] {
  const wallets = addresses
    .filter(
      (address) => typeof address === "string" && ADDRESS_PATTERN.test(address)
    )
    // Letter case is only a checksum, so case variants are one wallet.
    .map((address) => address.toLowerCase() as Address);
  return [...new Set(wallets)];
}
