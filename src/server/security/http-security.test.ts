import { describe, expect, it } from "vitest";
import {
  API_NO_STORE_HEADERS,
  DEFAULT_SECURITY_HEADERS,
  applySecurityHeaders,
  getNextSecurityHeaderRules,
} from "@/src/server/security/http-security";

describe("http-security", () => {
  it("applies default hardening headers to mutable responses", () => {
    const headers = new Headers();

    applySecurityHeaders(headers);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("exposes one global header rule and one api no-store rule", () => {
    const rules = getNextSecurityHeaderRules();

    expect(rules).toEqual([
      {
        source: "/:path*",
        headers: DEFAULT_SECURITY_HEADERS,
      },
      {
        source: "/api/:path*",
        headers: API_NO_STORE_HEADERS,
      },
    ]);
    expect(API_NO_STORE_HEADERS).toEqual([
      {
        key: "Cache-Control",
        value: "no-store",
      },
    ]);
  });
});
