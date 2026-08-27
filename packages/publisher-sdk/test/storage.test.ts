import { afterEach, describe, expect, it } from "vitest";
import { getLocalId, removeLocalId, setLocalId } from "../src/storage";

afterEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("__specify_local_id");
  }
});

describe("storage", () => {
  if (typeof window === "undefined") {
    it("does nothing when localStorage is unavailable", () => {
      expect(getLocalId()).toBeNull();
      expect(() => setLocalId("x")).not.toThrow();
      expect(removeLocalId).not.toThrow();
      expect(getLocalId()).toBeNull();
    });
  } else {
    it("stores and removes the local id", () => {
      expect(getLocalId()).toBeNull();

      setLocalId("local-123");

      expect(getLocalId()).toBe("local-123");
      expect(window.localStorage.getItem("__specify_local_id")).toBe(
        "local-123"
      );

      removeLocalId();

      expect(getLocalId()).toBeNull();
    });
  }
});
