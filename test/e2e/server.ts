import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { POST } from "@/app/v1/events/route";

export async function startEdge() {
  const browserBundle = execFileSync(
    "bun",
    ["build", "test/e2e/browser.ts", "--target=browser"],
    { encoding: "utf8" }
  );
  const requests: {
    body: {
      cookieConsent: boolean;
      event: { name: string; url: string };
      walletAddresses: string[];
    };
    cookie: string | undefined;
  }[] = [];
  const errors: unknown[] = [];

  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? "/", "https://spfsrv.com");
      if (url.pathname === "/sdk.js") {
        outgoing.setHeader("Content-Type", "text/javascript");
        outgoing.end(browserBundle);
        return;
      }
      if (url.pathname === "/v1/events") {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) {
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks).toString();
        const headers = new Headers();
        for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
          headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
        }
        const request = new Request(url, {
          body: incoming.method === "POST" ? body : undefined,
          headers,
          method: incoming.method,
        });
        requests.push({
          body: JSON.parse(body),
          cookie: incoming.headers.cookie,
        });
        const response = await POST(request);
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers)
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      outgoing.setHeader("Content-Type", "text/html");
      outgoing.end(`<!doctype html>
        <html lang="en"><head><title>SDK test consumer</title></head>
        <body><button type="button">Host action</button><output></output>
        <script type="module" src="/sdk.js"></script></body></html>`);
    } catch (error) {
      errors.push(error);
      outgoing.writeHead(500);
      outgoing.end("Test server failed");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind a TCP port");
  }
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    errors,
    requests,
    url: `http://127.0.0.1:${address.port}`,
  };
}
