import {
  type Address as CoreAddress,
  MAX_WALLET_ADDRESSES,
} from "@specify-sh/core";

import {
  type Attempt,
  bodyBytes,
  eventId,
  MAX_BODY_BYTES,
  send,
} from "./request";
import { ADVERTISER_KEY_PATTERN, isUserId, isWallet } from "./validation";

const MAX_BATCH_EVENTS = 50;
const MAX_CLICK_TOKEN_LENGTH = 1024;

export type Address = CoreAddress;

export interface SpecifyInitConfig {
  /** Your advertiser key, which starts with sak_ */
  advertiserKey: string;
}

interface Snapshot {
  spclk?: string;
  userId?: string;
  walletAddresses: Address[];
}

interface CapturedEvent {
  id?: string;
  name: string;
  url: string;
}

interface Batch {
  events: CapturedEvent[];
  identity: Snapshot;
  key: string;
}

type Consent = "pending" | "granted" | "denied";

function pageUrl(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location?.href;
}

function clickTokenIn(url: string): string | undefined {
  const token = new URL(url).searchParams.get("spclk");
  return token !== null && token.length <= MAX_CLICK_TOKEN_LENGTH
    ? token
    : undefined;
}

function contained(run: () => void): boolean {
  try {
    run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Specify Advertiser SDK client for the browser
 *
 * Every method does nothing outside a browser, such as during a server
 * render. Use `@specify-sh/advertiser-sdk/server` on a server.
 */
export default class Specify {
  private readonly advertiserKey: string;
  private consent: Consent = "pending";
  private userId: string | undefined;
  private readonly wallets = new Set<Address>();
  private clickToken: string | undefined;
  private lastIdentify: string | undefined;
  private readonly pending: Batch[] = [];
  private flushing: Promise<void> | null = null;

  /**
   * Creates a Specify client
   *
   * Create it once, as early as possible on every page, so it sees the ad
   * click that brought the visitor. Nothing is sent until setCookieConsent()
   * is first called. A malformed key turns every method into a no-op.
   *
   * @param config - Client configuration
   * @param config.advertiserKey - Your advertiser key, which starts with sak_
   */
  constructor(config: SpecifyInitConfig) {
    const key = (config as Partial<SpecifyInitConfig> | undefined)
      ?.advertiserKey;
    const trimmed = typeof key === "string" ? key.trim() : "";
    this.advertiserKey = ADVERTISER_KEY_PATTERN.test(trimmed) ? trimmed : "";
    contained(() => {
      const url = pageUrl();
      if (url !== undefined) {
        this.notice(url);
      }
    });
  }

  /**
   * Tells Specify whether the visitor consented to being identified
   *
   * Pass your consent manager's answer for advertising or marketing, once it
   * knows it, on every page load and whenever it changes. Until the first
   * call, events and identification wait in memory. After a refusal they are
   * still sent, without Specify's cookie.
   *
   * @param granted - Whether the visitor consented
   */
  setCookieConsent(granted: boolean): void {
    contained(() => {
      const url = pageUrl();
      if (url === undefined) {
        return;
      }
      const previous = this.consent;
      this.consent = granted === true ? "granted" : "denied";
      if (previous === this.consent || !this.advertiserKey) {
        return;
      }
      if (previous === "pending" || this.consent === "granted") {
        this.sendIdentify(url);
      }
      this.flush();
    });
  }

  /**
   * Identifies the visitor by your user ID or their wallet addresses
   *
   * Call it after sign-in, when a wallet connects, and on each page load for a
   * signed-in visitor. Your server's capture() calls only count for a user ID
   * your site has passed here. A new user ID replaces the previous one;
   * wallets add up, and the 50 most recent are kept. A string starting with
   * 0x is treated as a wallet. A user ID can't be blank, contain @, or be
   * longer than 256 bytes; invalid input is ignored.
   *
   * @param walletOrUserId - Your user ID, a wallet address, or an array of wallet addresses
   */
  identify(walletOrUserId: string | Address[]): void {
    contained(() => {
      const url = pageUrl();
      if (url === undefined || !this.advertiserKey) {
        return;
      }
      if (this.remember(walletOrUserId) && this.consent !== "pending") {
        this.sendIdentify(url);
      }
    });
  }

  /**
   * Forgets the identified user ID, wallets and ad click, such as on sign-out
   *
   * Events already captured keep the identity they were captured with.
   */
  reset(): void {
    this.userId = undefined;
    this.wallets.clear();
    this.clickToken = undefined;
    this.lastIdentify = undefined;
  }

  /**
   * Records an event, such as a purchase or a sign-up
   *
   * The event keeps the identity and page URL from the moment it was captured.
   * Before setCookieConsent() is first called, it waits in memory.
   *
   * @param event - The event name, such as "purchase"
   */
  capture(event: string): void {
    contained(() => {
      const url = pageUrl();
      if (
        url === undefined ||
        !this.advertiserKey ||
        typeof event !== "string" ||
        event.length === 0
      ) {
        return;
      }
      const identity = this.snapshot(url);
      const captured = { id: eventId(), name: event, url };
      if (this.consent === "pending") {
        this.enqueue(identity, captured);
        return;
      }
      this.sendEvents(identity, [captured]);
    });
  }

  private remember(walletOrUserId: string | Address[]): boolean {
    if (
      typeof walletOrUserId === "string" &&
      !walletOrUserId.startsWith("0x")
    ) {
      if (!isUserId(walletOrUserId)) {
        return false;
      }
      this.userId = walletOrUserId;
      return true;
    }
    const addresses = [walletOrUserId].flat() as Address[];
    if (addresses.length === 0) {
      return false;
    }
    if (!addresses.every((address) => isWallet(address))) {
      return false;
    }
    for (const address of addresses) {
      const wallet = address.toLowerCase() as Address;
      this.wallets.delete(wallet);
      this.wallets.add(wallet);
    }
    while (this.wallets.size > MAX_WALLET_ADDRESSES) {
      this.wallets.delete(this.wallets.values().next().value as Address);
    }
    return true;
  }

  private notice(url: string): void {
    const token = clickTokenIn(url);
    if (token !== undefined) {
      this.clickToken = token;
    }
  }

  private snapshot(url: string): Snapshot {
    this.notice(url);
    return {
      ...(this.clickToken === undefined ? {} : { spclk: this.clickToken }),
      ...(this.userId === undefined ? {} : { userId: this.userId }),
      walletAddresses: [...this.wallets],
    };
  }

  private attempt(body: object): Attempt {
    const granted = this.consent === "granted";
    return {
      body: { cookieConsent: granted, source: "browser", ...body },
      credentials: granted ? "include" : "omit",
      keepalive: true,
    };
  }

  private sendIdentify(url: string): void {
    const identity = this.snapshot(url);
    const identifiable =
      identity.userId !== undefined ||
      identity.walletAddresses.length > 0 ||
      (this.consent === "granted" && identity.spclk !== undefined);
    const { body, credentials } = this.attempt(identity);
    const key = JSON.stringify([credentials, body]);
    if (
      !identifiable ||
      key === this.lastIdentify ||
      bodyBytes(body) > MAX_BODY_BYTES
    ) {
      return;
    }
    this.lastIdentify = key;
    send(this.advertiserKey, "identify", () => this.attempt(identity));
  }

  private sendEvents(
    identity: Snapshot,
    events: CapturedEvent[]
  ): Promise<void> {
    if (
      bodyBytes(this.attempt({ ...identity, events }).body) > MAX_BODY_BYTES
    ) {
      return Promise.resolve();
    }
    return send(this.advertiserKey, "events", () =>
      this.attempt({ ...identity, events })
    );
  }

  private enqueue(identity: Snapshot, event: CapturedEvent): void {
    const key = JSON.stringify(identity);
    const lastIndex = this.pending.length - 1;
    const last = this.pending[lastIndex];
    if (
      last?.key === key &&
      last.events.length < MAX_BATCH_EVENTS &&
      bodyBytes(
        this.attempt({ ...identity, events: [...last.events, event] }).body
      ) <= MAX_BODY_BYTES
    ) {
      last.events.push(event);
      return;
    }
    this.pending.push({ events: [event], identity, key });
  }

  private flush(): void {
    if (this.flushing) {
      return;
    }
    const batch = this.pending.shift();
    if (!batch) {
      return;
    }
    this.flushing = this.sendEvents(batch.identity, batch.events).finally(
      () => {
        this.flushing = null;
        this.flush();
      }
    );
  }
}
