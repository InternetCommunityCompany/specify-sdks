import {
  assertValidAddresses,
  type Address as CoreAddress,
  MAX_WALLET_ADDRESSES,
} from "@specify-sh/core";

const CAPTURE_URL = "https://spfsrv.com/v1/events";

export type Address = CoreAddress;

/** Capture confirmation, with a message explaining skipped or unconfirmed events. */
export type CaptureResult =
  | { success: true; error: null }
  | {
      success: false;
      error: string;
      /** Request fields that failed validation. */
      details?: { field: string; message: string }[];
    };

/** Configuration for the browser-only advertiser client. */
export interface SpecifyInitConfig {
  /** Your organization's advertiser key. */
  advertiserKey: string;
  /** Reads the current tracking consent from your consent manager. */
  getConsent: () => boolean;
}

/** Browser-only Specify advertiser client. */
export default class Specify {
  private readonly advertiserKey: string = "";

  private readonly getConsent: () => boolean = () => false;

  private readonly identifiedAddresses = new Set<Address>();

  /**
   * Creates a browser advertiser client.
   *
   * @param config - Advertiser key and a getter for the current tracking consent.
   */
  constructor(config: SpecifyInitConfig) {
    if (typeof window === "undefined") {
      return;
    }
    try {
      this.getConsent = config.getConsent;
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
   * Identifies wallets for subsequent event captures.
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
   * Captures a named product event.
   *
   * @param name - The nonempty name of the product event to record.
   * @returns Whether the request was accepted, or a failure message.
   */
  async capture(name: string): Promise<CaptureResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (typeof window === "undefined") {
        return {
          error: "Event capture is only available in a browser.",
          success: false,
        };
      }
      if (this.getConsent() !== true) {
        return {
          error: "Tracking consent is required.",
          success: false,
        };
      }
      if (!this.advertiserKey) {
        return {
          error: "Advertiser key is required.",
          success: false,
        };
      }
      if (typeof name !== "string" || name.length === 0) {
        return {
          error: "Request validation failed.",
          success: false,
        };
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

      return response.ok
        ? { error: null, success: true }
        : {
            error: `Capture could not be confirmed (HTTP ${response.status}).`,
            success: false,
          };
    } catch {
      return {
        error: "Capture could not be confirmed.",
        success: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
