import {
  type Address as CoreAddress,
  ValidationError as CoreValidationError,
} from "@specify-sh/core";

import { bodyBytes, eventId, MAX_BODY_BYTES, send } from "./request";
import { ADVERTISER_KEY_PATTERN, isUserId, isWallet } from "./validation";

const MAX_DEDUPE_KEY_LENGTH = 256;

export type Address = CoreAddress;
export type ValidationError = CoreValidationError;
export const ValidationError: typeof CoreValidationError = CoreValidationError;

/** Options for an event recorded from a server */
export interface CaptureOptions {
  /** Your advertiser key, which starts with sak_ */
  advertiserKey: string;
  /** Your own ID for this event, such as an order ID, so a repeat with the same event name counts once */
  dedupeKey?: string;
  /** The event name, such as "purchase" */
  event: string;
  /** The user ID your site passes to identify() in the browser, or a wallet address */
  identity: string;
  /** The page where the event happened, if there is one, as an absolute URL */
  url?: string;
}

function validate(options: CaptureOptions): void {
  const { advertiserKey, dedupeKey, event, identity, url } =
    (options as Partial<CaptureOptions> | undefined) ?? {};
  if (
    typeof advertiserKey !== "string" ||
    !ADVERTISER_KEY_PATTERN.test(advertiserKey)
  ) {
    throw new ValidationError(
      "Invalid advertiser key. Copy it from your Specify dashboard; it starts with sak_."
    );
  }
  if (typeof event !== "string" || event.length === 0) {
    throw new ValidationError(
      'capture() needs an event name, such as "purchase".'
    );
  }
  if (typeof identity === "string" && identity.startsWith("0x")) {
    if (!isWallet(identity)) {
      throw new ValidationError(
        "identity starts with 0x, so it must be a wallet address: 0x followed by 40 hex characters."
      );
    }
  } else if (typeof identity !== "string" || !isUserId(identity)) {
    throw new ValidationError(
      "identity must be your user ID or a wallet address. A user ID can't be blank, contain @, or be longer than 256 bytes."
    );
  }
  if (
    dedupeKey !== undefined &&
    !(
      typeof dedupeKey === "string" &&
      dedupeKey.length > 0 &&
      dedupeKey.length <= MAX_DEDUPE_KEY_LENGTH
    )
  ) {
    throw new ValidationError(
      "dedupeKey must be a non-empty string of at most 256 characters, such as your order ID."
    );
  }
  if (url !== undefined && !(typeof url === "string" && URL.canParse(url))) {
    throw new ValidationError(
      "url must be an absolute URL, such as https://shop.example/checkout."
    );
  }
}

/**
 * Records an event from your server
 *
 * Use it for conversions your backend confirms, such as a completed payment.
 * Await it in serverless functions: it settles within about 18 seconds, and
 * it only rejects for invalid options, never because Specify is unreachable.
 *
 * @param options - Advertiser key, event name, identity, and optionally a URL and a dedupe key
 * @throws {ValidationError} When an option is invalid
 */
export async function capture(options: CaptureOptions): Promise<void> {
  validate(options);
  const { advertiserKey, dedupeKey, event, identity, url } = options;
  const body = {
    events: [
      {
        ...(dedupeKey === undefined ? { id: eventId() } : { dedupeKey }),
        name: event,
        ...(url === undefined ? {} : { url }),
      },
    ],
    identity,
    source: "server" as const,
  };
  if (bodyBytes(body) > MAX_BODY_BYTES) {
    throw new ValidationError(
      "This event is larger than 16 KiB. Shorten its name or url."
    );
  }
  await send(advertiserKey, "events", () => ({ body }));
}
