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

  /** The scheduled flush, or null when none is pending. */
  private identityFlush: Promise<void> | null = null;

  /**
   * Creates a Specify client
   *
   * @param config - Client configuration
   * @param config.publisherKey - Your publisher key, which starts with spk_
   * @throws {ValidationError} When the publisher key is malformed
   */
  constructor(config: SpecifyInitConfig) {
    assertValidPublisherKey(config.publisherKey);
    this.publisherKey = config.publisherKey;
  }

  /**
   * Sets whether the user consented to Specify's identity cookie
   *
   * Call it whenever your consent platform reports a change, and the next
   * serve() uses the new value without a page reload. Consent starts false,
   * and this is the only way to grant it. The SDK never stores it, so set it
   * again on each page load. Does nothing outside a browser, such as during a
   * server render.
   *
   * @param granted - Whether the user consented
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
   * Reports whether consent has been granted on this client
   *
   * @returns True once setCookieConsent(true) has run in a browser
   */
  hasCookieConsent(): boolean {
    return this.cookieConsent;
  }

  /**
   * Registers wallet addresses to include in every later serve()
   *
   * Call it when the user connects a wallet. Registering merges and never
   * removes, so a disconnect does not retract an address, and the 50 most
   * recently registered are kept. Does nothing outside a browser, such as
   * during a server render.
   *
   * @param addressOrAddresses - One address, an array of them, or nothing
   * @throws {ValidationError} In a browser, when any address in the batch is malformed. Nothing from that call is registered.
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
   * Registers a listener for when a later serve() could do better
   *
   * Runs when identify() adds an address that was not already registered, or
   * setCookieConsent(true) grants consent. Withdrawing consent does not run
   * it. Several changes in the same tick arrive as a single call, shortly
   * after the change rather than during it. Does nothing outside a browser,
   * such as during a server render.
   *
   * @param listener - Called when the identity improved
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
    if (this.identityFlush !== null || this.identitySubscriptions.size === 0) {
      return;
    }
    this.identityFlush = Promise.resolve().then(() =>
      this.flushIdentityChange()
    );
  }

  private flushIdentityChange(): void {
    this.identityFlush = null;
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
   * Serves an ad using the addresses registered through identify() and the
   * current consent
   *
   * @param options - How to serve this placement
   * @param options.imageFormat - The image format to request
   * @param options.adUnitId - Your own id for this placement, so you can compare placements in reporting
   * @throws {ValidationError} When called with no arguments
   * @returns An ad, or null for no ad, an API failure, or a network failure
   */
  serve(options: ServeOptions): Promise<SpecifyAd | null>;
  /**
   * Serves an ad to the given wallet address or addresses
   *
   * These go out ahead of anything registered through identify(), and at most
   * 50 addresses are sent in total.
   *
   * @param addressOrAddresses - One address, an array of them, or nothing to rely on identify() and consent alone
   * @param options - How to serve this placement
   * @param options.imageFormat - The image format to request
   * @param options.adUnitId - Your own id for this placement, so you can compare placements in reporting
   * @throws {ValidationError} When an address is malformed, or more than 50 are passed here
   * @returns An ad, or null for no ad, an API failure, or a network failure
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
