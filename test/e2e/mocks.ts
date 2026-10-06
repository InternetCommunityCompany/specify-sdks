import { vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    SEALED_TOKEN_ACTIVE_KEY_ID: 1,
    SEALED_TOKEN_KEY_1: Buffer.alloc(32, 1),
  },
}));

vi.mock("@/lib/report-failure", () => ({ reportFailure: vi.fn() }));

vi.mock("@/lib/cache", async () => {
  const { storage } = await import("./storage");
  return {
    cache: {
      del: (...keys: string[]) => {
        for (const key of keys) {
          storage.identity.hashes.delete(key);
        }
        return Promise.resolve(keys.length);
      },
      get: (key: string) => {
        if (storage.redisUnavailable) {
          throw new Error("Test Redis unavailable");
        }
        const keys = {
          "advertiser:key:test-development-key": {
            isDevelopment: true,
            organizationId: "test-advertiser",
          },
          "advertiser:key:test-production-key": {
            isDevelopment: false,
            organizationId: "test-advertiser",
          },
        };
        return Promise.resolve(keys[key as keyof typeof keys] ?? null);
      },
      hexpire: (...args: Parameters<typeof storage.identity.cache.hexpire>) =>
        storage.identity.cache.hexpire(...args),
      hmget: (...args: Parameters<typeof storage.identity.cache.hmget>) =>
        storage.identity.cache.hmget(...args),
      hset: (...args: Parameters<typeof storage.identity.cache.hset>) =>
        storage.identity.cache.hset(...args),
      hsetnx: (...args: Parameters<typeof storage.identity.cache.hsetnx>) =>
        storage.identity.cache.hsetnx(...args),
    },
  };
});

vi.mock("@/lib/clickhouse", async () => {
  const { insert, storage } = await import("./storage");
  return {
    getClickHouseClient: () => ({ insert }),
    query: (...args: Parameters<typeof storage.identity.query>) =>
      storage.identity.query(...args),
  };
});
