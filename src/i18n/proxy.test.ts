import { describe, expect, it } from "vitest";
import {
  buildProtectedLoginRedirect,
  resolveProxyLocale,
} from "./proxy-helpers";
import { routing } from "./routing";

describe("i18n proxy helpers", () => {
  it("resolves locales generically from localized and unlocalized paths", () => {
    expect(resolveProxyLocale("/dashboard")).toBe(routing.defaultLocale);
    expect(resolveProxyLocale("/dashboard/")).toBe(routing.defaultLocale);

    for (const locale of routing.locales) {
      const pathname = locale === routing.defaultLocale
        ? "/editor"
        : `/${locale}/editor`;

      expect(resolveProxyLocale(pathname)).toBe(locale);
    }
  });

  it("builds login redirects without prefix for the default locale", () => {
    const redirectUrl = buildProtectedLoginRedirect({
      requestUrl: "https://mapia.local/dashboard?tab=recent",
      resolvedPathname: "/dashboard",
      requestPathname: "/dashboard",
      requestSearch: "?tab=recent",
    });

    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("callbackUrl")).toBe(
      "/dashboard?tab=recent",
    );
  });

  it("builds login redirects with prefix for alternate locales", () => {
    const redirectUrl = buildProtectedLoginRedirect({
      requestUrl: "https://mapia.local/en-US/editor?projectId=123",
      resolvedPathname: "/en-US/editor",
      requestPathname: "/en-US/editor",
      requestSearch: "?projectId=123",
    });

    expect(redirectUrl.pathname).toBe("/en-US/login");
    expect(redirectUrl.searchParams.get("callbackUrl")).toBe(
      "/en-US/editor?projectId=123",
    );
  });

  it("preserves the locale from rewritten protected routes", () => {
    const redirectUrl = buildProtectedLoginRedirect({
      requestUrl: "https://mapia.local/en-US/dashboard",
      resolvedPathname: "/en-US/dashboard",
      requestPathname: "/en-US/create",
      requestSearch: "?fromProjectId=abc",
    });

    expect(redirectUrl.pathname).toBe("/en-US/login");
    expect(redirectUrl.searchParams.get("callbackUrl")).toBe(
      "/en-US/create?fromProjectId=abc",
    );
  });
});
