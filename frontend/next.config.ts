import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";

// The monorepo keeps a single .env.local at the repository root, but Next.js
// only auto-loads env files from the app directory.
//
// `forceReload` matters: Next loads the frontend-scoped env before it evaluates
// this file, and @next/env caches that first load. Without forcing a reload the
// root files are silently ignored and every NEXT_PUBLIC_* value is inlined as
// an empty string.
const repoRoot = path.resolve(process.cwd(), "..");
const { combinedEnv } = loadEnvConfig(
  repoRoot,
  process.env.NODE_ENV !== "production",
  console,
  true,
);

const supabaseUrl = combinedEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = combinedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const nextConfig: NextConfig = {
  // Public Supabase credentials are safe to inline: they are anon keys whose
  // reach is limited by Row Level Security. SUPABASE_SERVICE_ROLE_KEY is never
  // read here and must stay out of the browser bundle.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
