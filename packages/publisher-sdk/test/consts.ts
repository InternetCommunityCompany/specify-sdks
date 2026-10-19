import type { Address } from "../src";

export const VALID_MOCK_PUBLISHER_KEY = "spk_1234567890abcdef1234567890abcd";
export const VALID_MOCK_WALLET_ADDRESS =
  "0x1234567890123456789012345678901234567890";
export const MIXED_CASE_WALLET_ADDRESS: Address = `0x${"AbCd".repeat(10)}`;
export const LOWER_CASE_WALLET_ADDRESS =
  MIXED_CASE_WALLET_ADDRESS.toLowerCase() as Address;

export function distinctWalletAddresses(count: number): Address[] {
  return Array.from(
    { length: count },
    (_, index) => `0x${index.toString(16).padStart(40, "0")}` as Address
  );
}
