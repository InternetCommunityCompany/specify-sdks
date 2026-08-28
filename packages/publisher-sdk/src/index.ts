const SERVE_URL = "https://spfsrv.com/v1/ads";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

interface ServeOptions {
  adUnitId?: string;
  imageFormat: ImageFormat;
}

export type Address = `0x${string}`;

export const ImageFormat = {
  LANDSCAPE: "LANDSCAPE",
  LONG_BANNER: "LONG_BANNER",
  NO_IMAGE: "NO_IMAGE",
  SHORT_BANNER: "SHORT_BANNER",
} as const;

export type ImageFormat = (typeof ImageFormat)[keyof typeof ImageFormat];

export interface SpecifyInitConfig {
  publisherKey: string;
}

export interface SpecifyAd {
  adId: string;
  adUnitId?: string;
  campaignId: string;
  communityLogo: string;
  communityName: string;
  content: string;
  ctaLabel: string;
  ctaUrl: string;
  headline: string;
  imageFormat: ImageFormat;
  imageUrl: string | null;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isValidPublisherKey(key: string): boolean {
  return key.startsWith("spk_") && key.length === 34;
}

function areValidAddresses(addresses: Address[]): boolean {
  return addresses.every((address) => ADDRESS_PATTERN.test(address));
}

function toAddressArray(
  addressOrAddresses: Address | Address[] | undefined | null
): Address[] {
  if (Array.isArray(addressOrAddresses)) {
    return addressOrAddresses;
  }
  return addressOrAddresses ? [addressOrAddresses] : [];
}

const MAX_WALLET_ADDRESSES = 50;

function mergeIdentified(
  provided: Address[],
  identified: ReadonlySet<Address>
): Address[] {
  const identifiedNewestFirst = [...identified].reverse();
  return [...new Set([...provided, ...identifiedNewestFirst])].slice(
    0,
    MAX_WALLET_ADDRESSES
  );
}

/**
 * Specify Publisher SDK client
 *
 * Provides access to publisher content based on end user wallet address.
 */
export default class Specify {
  private readonly publisherKey: string;

  private cookieConsent = false;

  private readonly identifiedAddresses = new Set<Address>();

  /**
   * Creates a new Specify client instance
   *
   * @param config - SDK configuration object
   * @param config.publisherKey - Publisher key used for authentication
   * @throws {ValidationError} When publisher key format is invalid
   */
  constructor(config: SpecifyInitConfig) {
    if (!isValidPublisherKey(config.publisherKey)) {
      throw new ValidationError("Invalid publisher key format");
    }
    this.publisherKey = config.publisherKey;
  }

  /**
   * Updates the consent signal for Specify's identity cookie
   *
   * Call this when your consent management platform reports a change, so the
   * next serve() call reflects it without a page reload. Consent starts false
   * on a new instance, so this is the only way it ever becomes true. Does
   * nothing outside a browser, such as during a server render. The value is
   * never persisted: the publisher's CMP is the source of truth and it is
   * read from the instance on each serve().
   *
   * @param granted - Whether the user consented to Specify's identity cookie
   * @returns Nothing
   */
  setCookieConsent(granted: boolean): void {
    if (typeof window === "undefined") {
      return;
    }
    this.cookieConsent = granted;
  }

  /**
   * Returns the current consent signal
   *
   * Returns false until setCookieConsent(true) grants it. Outside a browser,
   * such as during a server render, it is always false because the setter
   * does nothing there.
   *
   * @returns The current consent value
   */
  hasCookieConsent(): boolean {
    return this.cookieConsent;
  }

  /**
   * Registers wallet addresses to include in every later serve() call
   *
   * Use this when the user connects a wallet, so its address rides along on
   * every serve() even when the call itself passes other addresses.
   * Registration merges and never removes: multiple wallets are one person,
   * so a disconnect does not retract an address. The SDK keeps at most the 50
   * most recently registered addresses. Does nothing outside a browser, such
   * as during a server render.
   *
   * @param addresses - Single wallet address or array of wallet addresses
   * @throws {ValidationError} In a browser, when any address in the call is malformed; nothing from that call is registered. Outside a browser the call returns before validating, so it never throws there.
   * @returns Nothing
   */
  identify(addresses: Address | Address[]): void {
    if (typeof window === "undefined") {
      return;
    }
    const provided = toAddressArray(addresses);
    if (!areValidAddresses(provided)) {
      throw new ValidationError("Invalid wallet address format");
    }
    for (const address of provided) {
      this.identifiedAddresses.add(address);
    }
    while (this.identifiedAddresses.size > MAX_WALLET_ADDRESSES) {
      const oldest = this.identifiedAddresses.values().next().value;
      if (oldest === undefined) {
        break;
      }
      this.identifiedAddresses.delete(oldest);
    }
  }

  /**
   * Serves content to the specified wallet address(es)
   *
   * @param addressOrAddresses - Single wallet address, array of wallet addresses, an empty array, or undefined
   * @param options - Configuration options containing imageFormat and optional adUnitId
   * @param options.imageFormat - The desired image format for the ad
   * @param options.adUnitId - arbitrary string id to identify where the ad is being displayed
   * @throws {ValidationError} When a wallet address is malformed or more than 50 unique addresses are provided
   * @returns Ad content on a 200 response, or null for no-fill, API failure, or network failure
   */
  async serve(
    addressOrAddresses: Address | Address[] | undefined | null,
    options: ServeOptions
  ): Promise<SpecifyAd | null> {
    const providedAddresses = toAddressArray(addressOrAddresses);

    if (!areValidAddresses(providedAddresses)) {
      throw new ValidationError("Invalid wallet address format");
    }

    const uniqueProvided = [...new Set(providedAddresses)];

    if (uniqueProvided.length > MAX_WALLET_ADDRESSES) {
      throw new ValidationError("Maximum 50 wallet addresses allowed");
    }

    // provided first in the order given, then identified newest first, deduped, capped at 50
    const walletAddresses = mergeIdentified(
      uniqueProvided,
      this.identifiedAddresses
    );

    if (walletAddresses.length === 0 && !this.cookieConsent) {
      return null;
    }

    try {
      const response = await fetch(SERVE_URL, {
        body: JSON.stringify({
          adUnitId: options.adUnitId,
          cookieConsent: this.cookieConsent,
          imageFormat: options.imageFormat,
          walletAddresses,
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.publisherKey,
        },
        method: "POST",
      });

      if (response.status !== 200) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }
}
