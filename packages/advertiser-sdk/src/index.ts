import {
  assertValidAddresses,
  type Address as CoreAddress,
  MAX_WALLET_ADDRESSES,
} from "@specify-sh/core";

import { requestAdvertiser } from "./request";

export type Address = CoreAddress;

export interface SpecifyInitConfig {
  /** Your organization's advertiser key. */
  advertiserKey: string;
}

export interface CaptureOptions {
  /** An absolute server event URL; browser calls use the current page URL. */
  url?: string;
}

interface PendingRequest {
  body: object;
  operation: "events" | "identify";
  resolve?: (status: number | null) => void;
}

export default class Specify {
  private readonly advertiserKey: string = "";
  private cookieConsent: boolean;
  private userId: string | undefined;
  private readonly identifiedAddresses = new Set<Address>();
  private pendingRequests: PendingRequest[] = [];
  private pendingIdentification: boolean;
  private sending: Promise<void> | null = null;

  /**
   * Browser consent starts false; call setCookieConsent on page load.
   * @param config - Your organization's advertiser key.
   */
  constructor(config: SpecifyInitConfig) {
    this.cookieConsent = false;
    this.pendingIdentification = false;

    try {
      if (
        typeof config.advertiserKey === "string" &&
        config.advertiserKey.trim().length > 0
      ) {
        this.advertiserKey = config.advertiserKey;
      }
    } catch {
      this.advertiserKey = "";
    }
  }

  /**
   * Call on page load and whenever your consent manager reports a change.
   * Granting consent releases buffered requests.
   * Withdrawing consent pauses unsent requests; sent requests may complete.
   * Does nothing on a server.
   * @param granted - Whether the visitor consented to tracking.
   */
  setCookieConsent(granted: boolean): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      this.cookieConsent = granted === true;

      if (!(this.cookieConsent && this.advertiserKey)) {
        return;
      }

      if (this.pendingIdentification) {
        this.pendingRequests.unshift({
          body: this.identityBody(),
          operation: "identify",
        });
        this.pendingIdentification = false;
      }

      this.sendPendingRequests();
    } catch {
      // A missing page URL must not break the host's consent callback.
    }
  }

  /**
   * Browsers remember identity; linking waits for cookie consent. Null clears
   * browser identity and cancels unsent identification, preserving captured events.
   * Servers send one identity immediately and never remember it for later calls.
   * @param identity - A user ID or wallet; browsers also accept wallet arrays or null.
   * @returns The HTTP status, or null for deferred identification or no response.
   */
  async identify(identity?: string | Address[] | null): Promise<number | null> {
    try {
      if (!this.advertiserKey || identity === undefined || identity === "") {
        return null;
      }

      if (typeof window === "undefined") {
        if (typeof identity !== "string") {
          return null;
        }

        if (identity.startsWith("0x")) {
          assertValidAddresses([identity as Address]);
        }

        return await requestAdvertiser(
          this.advertiserKey,
          { identity, source: "server" },
          "omit",
          "identify"
        );
      }

      if (identity === null) {
        this.userId = undefined;
        this.identifiedAddresses.clear();
        this.pendingIdentification = false;

        this.pendingRequests = this.pendingRequests.filter((request) => {
          if (request.operation === "events") {
            return true;
          }

          request.resolve?.(null);
          return false;
        });

        return null;
      }

      if (typeof identity === "string" && !identity.startsWith("0x")) {
        this.userId = identity;
      } else {
        const addresses = [identity].flat() as Address[];
        assertValidAddresses(addresses);

        if (addresses.length === 0) {
          return null;
        }

        for (const address of addresses) {
          this.identifiedAddresses.delete(address);
          this.identifiedAddresses.add(address);
        }

        while (this.identifiedAddresses.size > MAX_WALLET_ADDRESSES) {
          this.identifiedAddresses.delete(
            this.identifiedAddresses.values().next().value as Address
          );
        }
      }

      if (!this.cookieConsent) {
        this.pendingIdentification = true;
        return null;
      }

      return await this.enqueue("identify", this.identityBody());
    } catch {
      return null;
    }
  }

  /**
   * Later identity or URL changes never alter a captured event.
   * Before consent, the snapshot stays in memory and is sent after consent.
   * Servers require identity on every call and send immediately without cookies.
   * @param name - The nonempty product event name.
   * @param identity - A user ID or wallet for this event; required on a server.
   * @param options - Optional server event URL; browsers use the current page URL.
   * @returns The HTTP status, or null when buffered, rejected, or no response arrives.
   */
  async capture(
    name: string,
    identity?: string,
    options?: CaptureOptions
  ): Promise<number | null> {
    try {
      if (
        !this.advertiserKey ||
        typeof name !== "string" ||
        name.length === 0
      ) {
        return null;
      }

      if (typeof window === "undefined") {
        if (typeof identity !== "string" || identity.length === 0) {
          return null;
        }

        if (identity.startsWith("0x")) {
          assertValidAddresses([identity as Address]);
        }

        const url = options?.url;

        if (url !== undefined && !URL.canParse(url)) {
          return null;
        }

        return await requestAdvertiser(
          this.advertiserKey,
          {
            event: { name, ...(url === undefined ? {} : { url }) },
            identity,
            source: "server",
          },
          "omit",
          "events"
        );
      }

      const body = {
        ...this.identityBody(identity),
        event: { name, url: window.location.href },
      };

      if (!this.cookieConsent) {
        this.pendingRequests.push({ body, operation: "events" });
        return null;
      }

      return await this.enqueue("events", body);
    } catch {
      return null;
    }
  }

  private identityBody(identity?: string) {
    const spclk = new URL(window.location.href).searchParams.get("spclk");
    let { userId } = this;
    let walletAddresses = [...this.identifiedAddresses];

    if (identity !== undefined) {
      if (typeof identity !== "string" || identity.length === 0) {
        throw new Error("Supply a nonempty user ID or a valid wallet.");
      }

      if (identity.startsWith("0x")) {
        assertValidAddresses([identity as Address]);
        userId = undefined;
        walletAddresses = [identity as Address];
      } else {
        userId = identity;
        walletAddresses = [];
      }
    }

    return {
      cookieConsent: true,
      ...(userId === undefined ? {} : { userId }),
      source: "browser" as const,
      ...(spclk === null ? {} : { spclk }),
      walletAddresses,
    };
  }

  private enqueue(
    operation: PendingRequest["operation"],
    body: object
  ): Promise<number | null> {
    return new Promise((resolve) => {
      this.pendingRequests.push({ body, operation, resolve });
      this.sendPendingRequests();
    });
  }

  private sendPendingRequests(): void {
    if (
      this.sending !== null ||
      !this.cookieConsent ||
      this.pendingRequests.length === 0
    ) {
      return;
    }

    this.sending = this.sendNextRequest().finally(() => {
      this.sending = null;
      this.sendPendingRequests();
    });
  }

  private async sendNextRequest(): Promise<void> {
    if (!this.cookieConsent) {
      return;
    }

    const next = this.pendingRequests.shift();

    if (next === undefined) {
      return;
    }

    const status = await requestAdvertiser(
      this.advertiserKey,
      next.body,
      "include",
      next.operation,
      true
    );
    next.resolve?.(status);
  }
}
