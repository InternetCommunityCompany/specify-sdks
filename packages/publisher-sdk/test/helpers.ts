import { afterEach, expect, vi } from "vitest";

const SERVE_URL = "https://spfsrv.com/v1/ads";

const originalFetch = globalThis.fetch;

let pendingMismatches: string[][] = [];

// The SDK turns a throwing fetch into a null result, so a mock that threw on a
// malformed request would let any test expecting null pass anyway.
afterEach(() => {
  globalThis.fetch = originalFetch;
  const mismatches = pendingMismatches.flat();
  pendingMismatches = [];
  expect(mismatches, "malformed ad request").toEqual([]);
});

export const setupMockFetch = <T>(response: T, status = 200) => {
  const requests: RequestInit[] = [];
  const mismatches: string[] = [];
  pendingMismatches.push(mismatches);
  let body: string | null = null;
  if (status !== 204) {
    body = JSON.stringify(response);
  }
  const mockResponse = new Response(body, {
    headers: { "Content-Type": "application/json" },
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
    if (url !== SERVE_URL) {
      mismatches.push(`Unexpected API endpoint: ${url}`);
    }
    if (init?.method !== "POST") {
      mismatches.push(`Expected POST request, got ${init?.method}`);
    }
    if (!new Headers(init?.headers).has("x-api-key")) {
      mismatches.push("Missing x-api-key header");
    }
    return Promise.resolve(mockResponse);
  });

  globalThis.fetch = fetchMock;

  return { fetch: fetchMock, json, requests };
};
