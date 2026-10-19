import {
  assertValidAddresses,
  type Address as CoreAddress,
  MAX_WALLET_ADDRESSES,
} from "@specify-sh/core";

import { MAX_BODY_BYTES, requestAdvertiser } from "./request";

const MAX_BATCH_EVENTS = 50;

export type Address = CoreAddress;

export interface SpecifyInitConfig {
  /** Your organization's advertiser key. */
  advertiserKey: string;
}

export interface CaptureOptions {
  /** An absolute server event URL; browser calls use the current page URL. */
  url?: string;
}

interface PendingBatch {
  body: {
    cookieConsent: boolean;
    events: { name: string; url: string }[];
    source: "browser";
    spclk?: string;
    userId?: string;
    walletAddresses: Address[];
  };
  contextKey: string;
}

export default class Specify {
  private readonly advertiserKey: string = "";
  private cookieConsent: boolean;
  private userId: string | undefined;
  private readonly identifiedAddresses = new Set<Address>();
  private readonly pendingBatches: PendingBatch[] = [];
  private pendingIdentification: boolean;
  private sending: Promise<number | null> | null = null;

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
        const body = this.identityBody();
        this.pendingIdentification = false;
        requestAdvertiser(
          this.advertiserKey,
          body,
          "include",
          "identify",
          true
        );
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

      return await requestAdvertiser(
        this.advertiserKey,
        this.identityBody(),
        "include",
        "identify",
        true
      );
    } catch {
      return null;
    }
  }

  /**
   * Later identity or URL changes never alter a captured event.
   * Before consent, the snapshot stays in memory and is sent after consent.
   * With consent, captures send directly without waiting for buffered events or identify.
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
            events: [{ name, ...(url === undefined ? {} : { url }) }],
            identity,
            source: "server",
          },
          "omit",
          "events"
        );
      }

      const body = {
        ...this.identityBody(identity),
        events: [{ name, url: window.location.href }],
      };

      if (!this.cookieConsent) {
        this.enqueue(body);
        return null;
      }

      return await requestAdvertiser(
        this.advertiserKey,
        body,
        "include",
        "events",
        true
      );
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

  private enqueue(body: PendingBatch["body"]): void {
    const { events, ...context } = body;
    const contextKey = JSON.stringify(context);
    const lastBatchIndex = this.pendingBatches.length - 1;
    const batch = this.pendingBatches[lastBatchIndex];

    const combinedBody = batch && {
      ...body,
      events: [...batch.body.events, ...events],
    };

    if (
      batch?.contextKey === contextKey &&
      combinedBody &&
      combinedBody.events.length <= MAX_BATCH_EVENTS &&
      new TextEncoder().encode(JSON.stringify(combinedBody)).byteLength <=
        MAX_BODY_BYTES
    ) {
      batch.body = combinedBody;
    } else {
      this.pendingBatches.push({ body, contextKey });
    }
  }

  private sendPendingRequests(): void {
    if (this.sending || !this.cookieConsent) {
      return;
    }

    // shift() removes and returns the oldest batch. Taking it out now keeps
    // new captures from joining a batch whose request is already in flight.
    const batch = this.pendingBatches.shift();
    if (!batch) {
      return;
    }

    this.sending = requestAdvertiser(
      this.advertiserKey,
      batch.body,
      "include",
      "events",
      true
    ).finally(() => {
      this.sending = null;
      this.sendPendingRequests();
    });
  }
}
