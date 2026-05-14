import path from "path";
import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

const repoRoot = path.join(__dirname, "..", "..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {};

export default nextConfig;
