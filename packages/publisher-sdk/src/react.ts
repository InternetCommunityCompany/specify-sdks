"use client";

import { useEffect, useState } from "react";
import type Specify from "./index.js";
import type { Address, ImageFormat, SpecifyAd } from "./index.js";

/** Options for useSpecifyAd() */
export interface UseSpecifyAdOptions {
  /** Your own id for this placement, so you can compare placements in reporting */
  adUnitId?: string;
  /** The image format to request */
  imageFormat: ImageFormat;
  /** The Specify client to serve through. Create it once and reuse the same instance on every render. */
  specify: Specify;
}

function resolveHookArgs(
  first: UseSpecifyAdOptions | Address | Address[] | undefined | null,
  second?: UseSpecifyAdOptions
): {
  options: UseSpecifyAdOptions | undefined;
  wallets: Address | Address[] | undefined | null;
} {
  if (typeof first === "object" && first !== null && !Array.isArray(first)) {
    return { options: first, wallets: undefined };
  }
  return { options: second, wallets: first };
}

// A comma never appears in a wallet address, so joining round-trips exactly.
// The string stands in for the array in the effect dependencies: a new array
// with the same addresses compares equal, so an inline `[address]` is safe.
function toWalletKey(wallets: Address | Address[] | undefined | null): string {
  if (Array.isArray(wallets)) {
    return wallets.join(",");
  }
  return wallets ?? "";
}

/**
 * Fills an ad slot in a Client Component, using identify() and the current consent
 *
 * The first ad to arrive fills the slot for good — it won't swap or clear later.
 *
 * @param options - The Specify client and how to serve this placement
 * @returns The ad for this slot, or null while it's empty
 */
export function useSpecifyAd(options: UseSpecifyAdOptions): SpecifyAd | null;
/**
 * Fills an ad slot in a Client Component for the given wallet address or addresses
 *
 * The wallets only matter for the first serve; once the slot fills, later renders ignore them.
 * Anything that isn't an EVM wallet address, such as a Solana address, is skipped.
 *
 * @param addressOrAddresses - One address, an array of them, or nothing to rely on identify() and consent alone
 * @param options - The Specify client and how to serve this placement
 * @returns The ad for this slot, or null while it's empty
 */
export function useSpecifyAd(
  addressOrAddresses: Address | Address[] | undefined | null,
  options: UseSpecifyAdOptions
): SpecifyAd | null;
export function useSpecifyAd(
  first: UseSpecifyAdOptions | Address | Address[] | undefined | null,
  second?: UseSpecifyAdOptions
): SpecifyAd | null {
  const { options, wallets } = resolveHookArgs(first, second);
  const [ad, setAd] = useState<SpecifyAd | null>(null);
  const walletKey = toWalletKey(wallets);
  const specify = options?.specify;
  const imageFormat = options?.imageFormat;
  const adUnitId = options?.adUnitId;
  const filled = ad !== null;

  useEffect(() => {
    if (filled || !(specify && imageFormat)) {
      return;
    }
    let active = true;
    const request = () => {
      specify
        .serve(walletKey.split(",") as Address[], { adUnitId, imageFormat })
        .then((result) => {
          if (active && result) {
            setAd((current) => current ?? result);
          }
        })
        .catch(() => {
          // Nothing here should reject, but if it does the host must not see it.
        });
    };
    const unsubscribe = specify.onIdentityChange(request);
    request();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [adUnitId, filled, imageFormat, specify, walletKey]);

  return ad;
}
