import { afterEach, vi } from "vitest";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

export const setupMockFetch = <T>(
  response: T,
  status = 200,
  contentType = "application/json"
) => {
  const requests: RequestInit[] = [];
  let body: string | null = null;
  if (status !== 204) {
    body =
      contentType === "text/plain"
        ? String(response)
        : JSON.stringify(response);
  }
  const mockResponse = new Response(body, {
    headers: { "Content-Type": contentType },
    status,
  });
  const json = vi
    .spyOn(mockResponse, "json")
    .mockImplementation(() =>
      status === 204
        ? Promise.reject(new SyntaxError("Unexpected end of JSON input"))
        : Promise.resolve(response)
    );

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("/v1/ads")) {
      throw new Error(`Unexpected API endpoint: ${url}`);
    }

    if (init?.method !== "POST") {
      throw new Error(`Expected POST request, got ${init?.method}`);
    }

    if (!new Headers(init?.headers).has("x-api-key")) {
      throw new Error("Missing x-api-key header");
    }

    return Promise.resolve(mockResponse);
  });

  globalThis.fetch = fetchMock;

  return { fetch: fetchMock, json, requests };
};
