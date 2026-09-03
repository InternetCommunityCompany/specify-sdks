import {
  assertValidAddresses,
  assertValidPublisherKey,
  type Address as CoreAddress,
  ImageFormat as CoreImageFormat,
  type ImageFormat as CoreImageFormatType,
  type SpecifyAd as CoreSpecifyAd,
  ValidationError as CoreValidationError,
  MAX_WALLET_ADDRESSES,
  prepareWalletAddresses,
  requestAd,
} from "@specify-sh/core";

export type Address = CoreAddress;
export type ImageFormat = CoreImageFormatType;
export type SpecifyAd = CoreSpecifyAd;
export type ValidationError = CoreValidationError;
export const ImageFormat = CoreImageFormat;
export const ValidationError: typeof CoreValidationError = CoreValidationError;

interface ServeOptions {
  adUnitId?: string;
  imageFormat: ImageFormat;
}

export interface SpecifyInitConfig {
  publisherKey: string;
}

interface IdentitySubscription {
  listener: () => void;
}

function toAddressArray(
  addressOrAddresses: Address | Address[] | undefined | null
): Address[] {
  if (Array.isArray(addressOrAddresses)) {
    return addressOrAddresses;
  }
  return addressOrAddresses ? [addressOrAddresses] : [];
}

function resolveServeArgs(
  first: ServeOptions | Address | Address[] | undefined | null,
  second?: ServeOptions
): {
  addresses: Address | Address[] | undefined | null;
  options: ServeOptions;
} {
  if (typeof first === "object" && first !== null && !Array.isArray(first)) {
    return { addresses: undefined, options: first };
  }
  if (!second) {
    throw new ValidationError(
      "serve() needs an options object with an imageFormat; pass serve({ imageFormat }) or serve(addresses, { imageFormat })"
    );
  }
  return { addresses: first, options: second };
}

function mergeIdentified(
  provided: Address[],
  identifiedNewestFirst: Address[]
): Address[] {
  const seen = new Set<string>();
  const merged: Address[] = [];
  for (const address of [...provided, ...identifiedNewestFirst]) {
    const key = address.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(address);
    if (merged.length === MAX_WALLET_ADDRESSES) {
      break;
    }
  }
  return merged;
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

  private readonly identitySubscriptions = new Set<IdentitySubscription>();

  private identityFlushScheduled = false;

  /**
   * Creates a new Specify client instance
   *
   * @param config - SDK configuration object
   * @param config.publisherKey - Publisher key used for authentication
   * @throws {ValidationError} When publisher key format is invalid
   */
  constructor(config: SpecifyInitConfig) {
    assertValidPublisherKey(config.publisherKey);
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
    const gainedConsent = granted && !this.cookieConsent;
    this.cookieConsent = granted;
    if (gainedConsent) {
      this.scheduleIdentityChange();
    }
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
   * Registers wallet address(es) to send on every later serve()
   *
   * Call this when the user connects a wallet. Registered addresses ride
   * along on every serve() in either form, merged after any addresses the
   * caller passes there, and the SDK sends at most 50 addresses in total.
   * Registration merges and never removes: several wallets can be one
   * person, and a disconnect does not retract one. Does nothing outside a
   * browser, such as during a server render.
   *
   * @param addressOrAddresses - Single wallet address, array of wallet addresses, an empty array, or undefined
   * @returns Nothing
   * @throws {ValidationError} When any wallet address in the batch is malformed; nothing from that call is registered
   */
  identify(addressOrAddresses: Address | Address[] | undefined | null): void {
    if (typeof window === "undefined") {
      return;
    }
    const addresses = toAddressArray(addressOrAddresses);
    assertValidAddresses(addresses);
    let gainedAddress = false;
    for (const address of addresses) {
      if (!this.identifiedAddresses.has(address)) {
        gainedAddress = true;
      }
      this.identifiedAddresses.delete(address);
      this.identifiedAddresses.add(address);
    }
    while (this.identifiedAddresses.size > MAX_WALLET_ADDRESSES) {
      const oldest = this.identifiedAddresses.values().next().value;
      if (oldest === undefined) {
        break;
      }
      this.identifiedAddresses.delete(oldest);
    }
    if (gainedAddress) {
      this.scheduleIdentityChange();
    }
  }

  /**
   * Registers a listener for identity changes that improve the next serve()
   *
   * The listener runs when a later serve() would send something better than
   * the last one would have: a wallet address newly registered through
   * identify(), or cookie consent newly granted through
   * setCookieConsent(true). A consent withdrawal and the eviction of old
   * addresses past the 50-address cap do not fire it. Several changes in the
   * same tick coalesce into one call, delivered in a microtask after the
   * change. A listener that throws is swallowed and does not affect other
   * listeners. Outside a browser, such as during a server render, this does
   * nothing and still returns a callable unsubscribe.
   *
   * @param listener - Called with no arguments when the identity improved
   * @returns A function that detaches the listener; safe to call twice
   */
  onIdentityChange(listener: () => void): () => void {
    if (typeof window === "undefined") {
      return () => {
        /* nothing to detach outside a browser */
      };
    }
    const subscription: IdentitySubscription = { listener };
    this.identitySubscriptions.add(subscription);
    return () => {
      this.identitySubscriptions.delete(subscription);
    };
  }

  private scheduleIdentityChange(): void {
    if (this.identityFlushScheduled || this.identitySubscriptions.size === 0) {
      return;
    }
    this.identityFlushScheduled = true;
    queueMicrotask(() => this.flushIdentityChange());
  }

  private flushIdentityChange(): void {
    this.identityFlushScheduled = false;
    for (const subscription of [...this.identitySubscriptions]) {
      if (!this.identitySubscriptions.has(subscription)) {
        continue;
      }
      try {
        subscription.listener();
      } catch {
        // A misbehaving listener must not break the host page or the others.
      }
    }
  }

  /**
   * Serves content using the wallets registered through identify() and the
   * consent signal, without passing addresses at the call site
   *
   * @param options - Configuration options containing imageFormat and optional adUnitId
   * @param options.imageFormat - The desired image format for the ad
   * @param options.adUnitId - arbitrary string id to identify where the ad is being displayed
   * @throws {ValidationError} When called with no arguments at all
   * @returns Ad content on a 200 response, or null for no-fill, API failure, or network failure
   */
  serve(options: ServeOptions): Promise<SpecifyAd | null>;
  /**
   * Serves content to the specified wallet address(es)
   *
   * Addresses passed here take priority over the ones registered through
   * identify(): they are sent first, and the SDK sends at most 50 addresses
   * in total.
   *
   * @param addressOrAddresses - Single wallet address, array of wallet addresses, an empty array, or undefined
   * @param options - Configuration options containing imageFormat and optional adUnitId
   * @param options.imageFormat - The desired image format for the ad
   * @param options.adUnitId - arbitrary string id to identify where the ad is being displayed
   * @throws {ValidationError} When a wallet address is malformed or more than 50 unique addresses are provided
   * @returns Ad content on a 200 response, or null for no-fill, API failure, or network failure
   */
  serve(
    addressOrAddresses: Address | Address[] | undefined | null,
    options: ServeOptions
  ): Promise<SpecifyAd | null>;
  async serve(
    first: ServeOptions | Address | Address[] | undefined | null,
    second?: ServeOptions
  ): Promise<SpecifyAd | null> {
    const { addresses, options } = resolveServeArgs(first, second);
    const providedAddresses = toAddressArray(addresses);
    const uniqueProvided = prepareWalletAddresses(providedAddresses);

    const walletAddresses = mergeIdentified(
      uniqueProvided,
      [...this.identifiedAddresses].reverse()
    );

    if (walletAddresses.length === 0 && !this.cookieConsent) {
      return null;
    }

    return await requestAd({
      adUnitId: options.adUnitId,
      cookieConsent: this.cookieConsent,
      credentials: "include",
      imageFormat: options.imageFormat,
      publisherKey: this.publisherKey,
      walletAddresses,
    });
  }
}
