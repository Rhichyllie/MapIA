import { describe, expect, it } from "vitest";
import {
  buildLocalizedPathname,
  extractLocaleFromPathname,
  normalizePathname,
  routing,
  stripLocaleFromPathname,
} from "./routing";

describe("i18n routing", () => {
  it("extracts and strips locale-aware pathnames", () => {
    expect(extractLocaleFromPathname("/en-US/dashboard")).toBe("en-US");
    expect(stripLocaleFromPathname("/en-US/dashboard")).toBe("/dashboard");
    expect(stripLocaleFromPathname("/dashboard")).toBe("/dashboard");
  });

  it("normalizes trailing slashes without losing root", () => {
    expect(normalizePathname("/dashboard/")).toBe("/dashboard");
    expect(normalizePathname("/")).toBe("/");
  });

  it("builds localized routes with localePrefix as-needed", () => {
    expect(buildLocalizedPathname("/dashboard", routing.defaultLocale)).toBe("/dashboard");
    expect(buildLocalizedPathname("/dashboard", "en-US")).toBe("/en-US/dashboard");
    expect(buildLocalizedPathname("/", "en-US")).toBe("/en-US");
  });
});
