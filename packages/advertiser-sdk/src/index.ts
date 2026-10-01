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
}
