import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Hardening for local monorepo/workspace setups where Turbopack may infer
  // a parent directory as workspace root and fail to resolve Next packages.
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
