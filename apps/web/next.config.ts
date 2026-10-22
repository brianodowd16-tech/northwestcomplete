import type { NextConfig } from "next";

// One .env at the repo root serves every package.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
} catch {
  // no .env: rely on the real environment
}

const config: NextConfig = {
  transpilePackages: ["@round/core", "@round/db"],
  serverExternalPackages: ["pg"],
};

export default config;
