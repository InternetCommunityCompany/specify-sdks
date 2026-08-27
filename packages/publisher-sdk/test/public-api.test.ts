import { describe, expect, it } from "vitest";
import * as publicApi from "../src";

describe("public API", () => {
  it("preserves the complete public surface", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "APIError",
      "AuthenticationError",
      "ImageFormat",
      "NotFoundError",
      "ValidationError",
      "default",
    ]);
    expect(publicApi.default).toBeTypeOf("function");
    expect(publicApi.default.name).toBe("Specify");
    expect(publicApi.ImageFormat).toEqual({
      LANDSCAPE: "LANDSCAPE",
      LONG_BANNER: "LONG_BANNER",
      NO_IMAGE: "NO_IMAGE",
      SHORT_BANNER: "SHORT_BANNER",
    });
    expect(new publicApi.APIError("message").name).toBe("APIError");
    expect(new publicApi.AuthenticationError("message").name).toBe("AuthenticationError");
    expect(new publicApi.NotFoundError().name).toBe("NotFoundError");
    expect(new publicApi.ValidationError("message").name).toBe("ValidationError");
  });
});
