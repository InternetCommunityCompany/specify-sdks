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
} from "./request.js";
import {
  ADVERTISER_KEY_PATTERN,
  apiBase,
  isUserId,
  isWallet,
} from "./validation.js";

const MAX_BATCH_EVENTS = 50;
const MAX_CLICK_TOKEN_LENGTH = 1024;

export type Address = CoreAddress;

export interface SpecifyInitConfig {
  /** Your advertiser key, which starts with sak_ */
  advertiserKey: string;
  /** Leave unset unless Specify gives you another API URL */
  apiUrl?: string;
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

type Consent = "pending" | "granted" | "denied";

function pageUrl(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location?.href;
}

function clickTokenIn(url: string): string | undefined {
  const token = new URL(url).searchParams.get("spclk");
  return token && token.length <= MAX_CLICK_TOKEN_LENGTH ? token : undefined;
}

function identifiesWithoutCookie(identity: Snapshot): boolean {
  return (
    identity.spclk !== undefined ||
    identity.userId !== undefined ||
    identity.walletAddresses.length > 0
  );
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
  private readonly apiUrl: string;
  private consent: Consent = "pending";
  private userId: string | undefined;
  private readonly wallets = new Set<Address>();
  private clickToken: string | undefined;
  private lastIdentify: string | undefined;
  private readonly held: CapturedEvent[][] = [];
  private flushing: Promise<void> | null = null;

  /**
   * Creates the Specify client
   *
   * Create one client and import it wherever you need it. Load it on every
   * page of your site, including the pages your ads link to.
   *
   * @param config - Client configuration
   * @param config.advertiserKey - Your advertiser key, which starts with sak_
   * @param config.apiUrl - Leave unset unless Specify gives you another API URL
   */
  constructor(config: SpecifyInitConfig) {
    const { advertiserKey: key, apiUrl } =
      (config as Partial<SpecifyInitConfig> | undefined) ?? {};
    const trimmed = typeof key === "string" ? key.trim() : "";
    const api = apiBase(apiUrl);
    this.advertiserKey =
      ADVERTISER_KEY_PATTERN.test(trimmed) && api !== undefined ? trimmed : "";
    this.apiUrl = api ?? "";
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
   * and again whenever it changes.
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
      if (this.consent === "granted") {
        this.sendIdentify(url);
        this.flush();
      } else {
        this.held.splice(0);
      }
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
      if (this.remember(walletOrUserId)) {
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
      if (identifiesWithoutCookie(identity) || this.consent === "granted") {
        this.sendEvents(identity, [captured]);
      } else if (this.consent === "pending") {
        this.hold(captured);
      }
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
    send(this.destination("identify"), () => this.attempt(identity));
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
    return send(this.destination("events"), () =>
      this.attempt({ ...identity, events })
    );
  }

  private destination(operation: "events" | "identify") {
    return {
      advertiserKey: this.advertiserKey,
      apiUrl: this.apiUrl,
      operation,
    };
  }

  private hold(event: CapturedEvent): void {
    const lastIndex = this.held.length - 1;
    const last = this.held[lastIndex];
    if (
      last &&
      last.length < MAX_BATCH_EVENTS &&
      bodyBytes(
        this.attempt({ events: [...last, event], walletAddresses: [] }).body
      ) <= MAX_BODY_BYTES
    ) {
      last.push(event);
      return;
    }
    this.held.push([event]);
  }

  private flush(): void {
    if (this.flushing) {
      return;
    }
    const batch = this.held.shift();
    if (!batch) {
      return;
    }
    this.flushing = this.sendEvents({ walletAddresses: [] }, batch).finally(
      () => {
        this.flushing = null;
        this.flush();
      }
    );
  }
}
