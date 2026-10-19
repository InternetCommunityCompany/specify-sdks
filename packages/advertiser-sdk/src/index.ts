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
   * Creates the Specify client
   *
   * Create one client and import it wherever you need it. Load it on every
   * page of your site, including the pages your ads link to.
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
   * Passes on the visitor's consent for advertising
   *
   * Call it on every page load once your consent manager knows the answer,
   * and again whenever it changes. Nothing is sent until the first call.
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
   * Identifies the visitor
   *
   * Call it when the visitor signs in or connects a wallet, and on every page
   * load while they're signed in. Use the same user ID your server passes to
   * capture(). Use your own ID, not an email address: IDs containing @ are
   * ignored.
   *
   * @param walletOrUserId - Your user ID for the visitor, a wallet address, or an array of wallet addresses
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
   * Forgets the visitor, such as when they sign out
   */
  reset(): void {
    this.userId = undefined;
    this.wallets.clear();
    this.clickToken = undefined;
    this.lastIdentify = undefined;
  }

  /**
   * Records an event, such as a sign-up
   *
   * Call it once the action has succeeded.
   *
   * @param event - The event name, such as "signup"
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
