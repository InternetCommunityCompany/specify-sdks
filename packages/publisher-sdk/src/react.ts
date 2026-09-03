"use client";

import { useEffect, useState } from "react";
import type Specify from "./index";
import type { Address, ImageFormat, SpecifyAd } from "./index";

/** Options for a hook-driven ad slot */
export interface UseSpecifyAdOptions {
  /** Your own id for this placement, so you can compare placements in reporting */
  adUnitId?: string;
  /** The image format to request */
  imageFormat: ImageFormat;
  /** The Specify client to serve through; create it once outside your components and pass the same instance on every render */
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

function toWalletAddresses(walletKey: string): Address[] {
  return walletKey
    .split(",")
    .filter((entry): entry is Address => entry.startsWith("0x"));
}

/**
 * Serves an ad into a Client Component using the addresses registered through
 * identify() and the current consent
 *
 * Serves once on mount, and serves again when the client's identity improves,
 * such as when identify() registers a new wallet. The first ad to arrive is
 * kept for the life of the component, so a filled slot never swaps or goes
 * blank under the reader.
 *
 * @param options - How to serve this placement, including the Specify client
 * @returns The ad for this slot, or null while empty; it stays null for a no-fill, an API failure, or a network failure
 */
export function useSpecifyAd(options: UseSpecifyAdOptions): SpecifyAd | null;
/**
 * Serves an ad into a Client Component for the given wallet address or
 * addresses
 *
 * These go out ahead of anything registered through identify(), and at most
 * 50 addresses are sent in total. The addresses only matter while the slot is
 * still empty, and a fresh array with the same addresses does not serve
 * again, so an inline array literal is safe.
 *
 * @param addressOrAddresses - One address, an array of them, or nothing to rely on identify() and consent alone
 * @param options - How to serve this placement, including the Specify client
 * @returns The ad for this slot, or null while empty; it stays null for a no-fill, an API failure, or a network failure
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
        .serve(toWalletAddresses(walletKey), { adUnitId, imageFormat })
        .then((result) => {
          if (active && result) {
            setAd((current) => current ?? result);
          }
        })
        .catch(() => {
          // A bad address must not break the host; the slot just stays empty.
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
