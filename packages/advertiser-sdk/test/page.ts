import { vi } from "vitest";

const inBrowser = typeof window !== "undefined";

export function visit(pathAndQuery: string): string {
  if (inBrowser) {
    window.history.replaceState(null, "", pathAndQuery);
    return window.location.href;
  }
  const { href } = new URL(pathAndQuery, "https://shop.example");
  vi.stubGlobal("window", { location: { href } });
  return href;
}
