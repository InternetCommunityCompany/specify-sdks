const EDGE_SERVER_URL = "https://spfsrv.com/v1";
const ATTEMPT_TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [1000, 2000];

export const MAX_BODY_BYTES = 16 * 1024;

export interface Attempt {
  body: object;
  credentials?: RequestCredentials;
  keepalive?: boolean;
}

export function bodyBytes(body: object): number {
  return new TextEncoder().encode(JSON.stringify(body)).byteLength;
}

export function eventId(): string | undefined {
  return globalThis.crypto?.randomUUID?.();
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt(
  advertiserKey: string,
  operation: "events" | "identify",
  { body, credentials, keepalive }: Attempt
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(`${EDGE_SERVER_URL}/${operation}`, {
      body: JSON.stringify(body),
      ...(credentials === undefined ? {} : { credentials }),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": advertiserKey,
      },
      ...(keepalive === undefined ? {} : { keepalive }),
      method: "POST",
      signal: controller.signal,
    });
    return !shouldRetry(response.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWithRetries(
  advertiserKey: string,
  operation: "events" | "identify",
  prepare: () => Attempt,
  delays: number[]
): Promise<void> {
  if (await attempt(advertiserKey, operation, prepare())) {
    return;
  }
  const [delay, ...remaining] = delays;
  if (delay === undefined) {
    return;
  }
  await wait(delay);
  await sendWithRetries(advertiserKey, operation, prepare, remaining);
}

export function send(
  advertiserKey: string,
  operation: "events" | "identify",
  prepare: () => Attempt
): Promise<void> {
  return sendWithRetries(advertiserKey, operation, prepare, RETRY_DELAYS_MS);
}
