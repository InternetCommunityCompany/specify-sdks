import {
  assertValidAddresses,
  type Address as CoreAddress,
  MAX_WALLET_ADDRESSES,
} from "@specify-sh/core";

const CAPTURE_URL = "https://spfsrv.com/v1/events";

export type Address = CoreAddress;

/**
 * Checks that the SDK is callable in the current environment.
 *
 * @returns True. This is a local smoke check and does not contact Specify.
 */
export function health(): boolean {
  return true;
}

/** Configuration for the browser-only advertiser client. */
export interface SpecifyInitConfig {
  /** Your organization's advertiser key. */
  advertiserKey: string;
}

/** Browser-only Specify advertiser client. */
export default class Specify {
  private readonly advertiserKey: string = "";

  private cookieConsent = false;

  private readonly identifiedAddresses = new Set<Address>();

  /**
   * Creates an advertiser client without sending requests or writing storage.
   * Invalid configuration or construction outside a browser leaves it inactive.
   *
   * @param config - Configuration containing your organization's advertiser key.
   */
  constructor(config: SpecifyInitConfig) {
    if (typeof window === "undefined") {
      return;
    }
    try {
      this.advertiserKey = config.advertiserKey;
      if (
        typeof this.advertiserKey !== "string" ||
        this.advertiserKey.trim().length === 0
      ) {
        this.advertiserKey = "";
      }
    } catch {
      this.advertiserKey = "";
    }
  }

  /**
   * Sets whether the user consented to Specify tracking.
   *
   * Consent starts false. Call this when your consent manager reports a choice
   * or a change, including restoring a saved choice on each page load. This only
   * updates the client; it sends no requests and writes no storage. Does nothing
   * outside a browser.
   *
   * @param granted - Whether the user consented to Specify tracking.
   */
  setCookieConsent(granted: boolean): void {
    if (typeof window === "undefined" || this.cookieConsent === granted) {
      return;
    }
    this.cookieConsent = granted === true;
  }

  /**
   * Remembers wallets to include in later event captures, without sending them.
   *
   * Call when a wallet connects, is restored, or changes. Disconnecting does not
   * remove wallets. The 50 most recently identified addresses are retained.
   * Invalid input is ignored without changing the remembered wallets. Does
   * nothing outside a browser.
   *
   * @param addressOrAddresses - One wallet address, an array, or nothing.
   */
  identify(addressOrAddresses: Address | Address[] | undefined | null): void {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const addresses = [addressOrAddresses].flatMap((value) => value ?? []);

      assertValidAddresses(addresses);

      for (const address of addresses) {
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
    } catch {
      // Invalid wallet input must not interrupt the host application.
    }
  }

  /**
   * Captures one named product event with the current page URL and remembered wallets.
   *
   * Requires consent. With no remembered wallets, Specify checks its identity
   * cookie and discards the event if it cannot identify the user. Sends once,
   * without buffering or retries, and times out after 60 seconds when the browser
   * supports AbortController. Withdrawing consent blocks new captures;
   * requests already sent may still complete.
   * Does nothing outside a browser.
   *
   * @param name - The nonempty name of the product event to record.
   * @returns True when Specify confirms storage; false when skipped or unconfirmed.
   */
  async capture(name: string): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (
        typeof window === "undefined" ||
        !this.cookieConsent ||
        !this.advertiserKey ||
        typeof name !== "string" ||
        name.length === 0
      ) {
        return false;
      }

      const controller = globalThis.AbortController
        ? new AbortController()
        : undefined;

      if (controller) {
        // Abort requests that haven't completed after 60 seconds.
        timeout = setTimeout(
          () =>
            controller.abort(
              new Error("Specify capture request timed out after 60 seconds.")
            ),
          60_000
        );
      }

      const response = await fetch(CAPTURE_URL, {
        body: JSON.stringify({
          cookieConsent: true,
          event: { name, url: window.location.href },
          walletAddresses: [...this.identifiedAddresses],
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.advertiserKey,
        },
        keepalive: true,
        method: "POST",
        signal: controller?.signal,
      });

      return response.status === 200;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
