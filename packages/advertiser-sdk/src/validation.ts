import { type Address, assertValidAddresses } from "@specify-sh/core";

const MAX_USER_ID_BYTES = 256;

export const ADVERTISER_KEY_PATTERN = /^sak_[0-9a-f]{30}$/;

export function isUserId(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !value.includes("@") &&
    !value.startsWith("0x") &&
    new TextEncoder().encode(value).byteLength <= MAX_USER_ID_BYTES
  );
}

export function isWallet(value: string): boolean {
  try {
    assertValidAddresses([value as Address]);
    return true;
  } catch {
    return false;
  }
}
