
export const MAX_BODY_BYTES = 16 * 1024;

export async function requestAdvertiser(
  advertiserKey: string,
  body: object,
  credentials: RequestCredentials,
  operation: "events" | "identify",
  keepalive = false
): Promise<number | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const serializedBody = JSON.stringify(body);

    if (new TextEncoder().encode(serializedBody).byteLength > MAX_BODY_BYTES) {
      return null;
    }

    const controller = globalThis.AbortController
      ? new AbortController()
      : undefined;
    if (controller) {
      timeout = setTimeout(
        () =>
          controller.abort(
            new Error("Specify capture request timed out after 60 seconds.")
          ),
        60_000
      );
    }
    const response = await fetch(`${SERVICE_URL}/${operation}`, {
      body: serializedBody,
      credentials,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": advertiserKey,
      },
      keepalive,
      method: "POST",
      signal: controller?.signal,
    });
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
