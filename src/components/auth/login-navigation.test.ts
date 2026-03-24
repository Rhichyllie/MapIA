import { describe, expect, it } from "vitest";
import { resolvePostLoginNavigationTarget } from "./login-navigation";

describe("resolvePostLoginNavigationTarget", () => {
  it("normalizes same-origin absolute URLs into internal localized paths", () => {
    expect(
      resolvePostLoginNavigationTarget({
        callbackUrl: "/en-US/dashboard",
        resultUrl: "http://localhost:3000/en-US/dashboard?tab=recent",
        currentOrigin: "http://localhost:3000",
      }),
    ).toBe("/en-US/dashboard?tab=recent");
  });

  it("preserves relative locale-aware callback URLs", () => {
    expect(
      resolvePostLoginNavigationTarget({
        callbackUrl: "/en-US/editor?projectId=123",
        currentOrigin: "http://localhost:3000",
      }),
    ).toBe("/en-US/editor?projectId=123");
  });

  it("keeps external validated targets as full URLs", () => {
    expect(
      resolvePostLoginNavigationTarget({
        callbackUrl: "/dashboard",
        resultUrl: "https://accounts.example.com/sso/complete",
        currentOrigin: "http://localhost:3000",
      }),
    ).toBe("https://accounts.example.com/sso/complete");
  });
});
