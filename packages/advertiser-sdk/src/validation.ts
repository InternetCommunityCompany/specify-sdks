import { type Address, assertValidAddresses } from "@specify-sh/core";

const MAX_USER_ID_BYTES = 256;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TRAILING_SLASHES = /\/+$/;

export const ADVERTISER_KEY_PATTERN = /^sak_[0-9a-f]{30}$/;

export function apiBase(value: unknown): string | undefined {
  if (value === undefined) {
    return "https://spfsrv.com";
  }
  if (typeof value !== "string" || !URL.canParse(value)) {
    return;
  }
  const url = new URL(value);
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname));
  if (!secure || url.search || url.hash || url.username || url.password) {
    return;
  }
  return `${url.origin}${url.pathname.replace(TRAILING_SLASHES, "")}`;
}

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
