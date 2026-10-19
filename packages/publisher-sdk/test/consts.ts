import type { Address } from "../src";

export const VALID_MOCK_PUBLISHER_KEY = "spk_1234567890abcdef1234567890abcd";
// The right length with the wrong prefix, so only the prefix check rejects it.
export const UNPREFIXED_MOCK_PUBLISHER_KEY =
  "xpk_1234567890abcdef1234567890abcd";
export const VALID_MOCK_WALLET_ADDRESS =
  "0x1234567890123456789012345678901234567890";
export const MIXED_CASE_WALLET_ADDRESS: Address = `0x${"AbCd".repeat(10)}`;
export const LOWER_CASE_WALLET_ADDRESS =
  MIXED_CASE_WALLET_ADDRESS.toLowerCase() as Address;

export const SHORT_WALLET_ADDRESS: Address = `0x${"a".repeat(39)}`;
export const LONG_WALLET_ADDRESS: Address = `0x${"a".repeat(41)}`;

export const INVALID_PUBLISHER_KEY_MESSAGE = "Invalid publisher key format";
export const INVALID_WALLET_ADDRESS_MESSAGE = "Invalid wallet address format";
export const WALLET_ADDRESS_LIMIT_MESSAGE =
  "Maximum 50 wallet addresses allowed";

export function distinctWalletAddresses(count: number): Address[] {
  return Array.from(
    { length: count },
    (_, index) => `0x${index.toString(16).padStart(40, "0")}` as Address
  );
}
