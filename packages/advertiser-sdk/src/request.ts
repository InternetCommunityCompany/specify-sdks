const SERVICE_URL = "https://spfsrv.com/v1";

export async function requestAdvertiser(
  advertiserKey: string,
  body: object,
  credentials: RequestCredentials,
  operation: "events" | "identify",
  keepalive = false
): Promise<number | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
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
      body: JSON.stringify(body),
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
