import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { getNextSecurityHeaderRules } from "./src/server/security/http-security";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Hardening for local monorepo/workspace setups where Turbopack may infer
  // a parent directory as workspace root and fail to resolve Next packages.
  turbopack: {
    root: repoRoot,
  },
  async headers() {
    return getNextSecurityHeaderRules();
  },
};

export default withNextIntl(nextConfig);
