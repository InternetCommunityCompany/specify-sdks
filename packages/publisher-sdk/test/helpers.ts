import { afterEach } from "vitest";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

export interface MockResponse<T> extends Response {
  headers: Headers;
  json: () => Promise<T>;
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export interface ErrorResponse {
  details?: Array<{
    field: string;
    message: string;
  }>;
  error: string;
}

export const setupMockFetch = <T>(
  response: T,
  status = 200,
  contentType = "application/json"
) => {
  // Mock the global fetch function
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    // Verify the request is going to the correct endpoint
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("/api/ads")) {
      throw new Error(`Unexpected API endpoint: ${url}`);
    }

    // Verify the request method and headers
    if (init?.method !== "POST") {
      throw new Error(`Expected POST request, got ${init?.method}`);
    }

    if (
      init?.headers &&
      !(init.headers as Record<string, string>)["x-api-key"]
    ) {
      throw new Error("Missing x-api-key header");
    }

    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      body: null,
      bodyUsed: false,
      clone: () => new Response(),
      formData: () => Promise.resolve(new FormData()),
      headers: new Headers({
        "Content-Type": contentType,
      }),
      json: () => Promise.resolve(response),
      ok: status >= 200 && status < 300,
      redirected: false,
      status,
      statusText: "",
      text: () => {
        if (contentType === "text/plain") {
          return Promise.resolve((response as ErrorResponse).error || "");
        }
        return Promise.resolve(JSON.stringify(response));
      },
      type: "default" as ResponseType,
      url: typeof input === "string" ? input : input.toString(),
    } as MockResponse<T>);
  };
};
