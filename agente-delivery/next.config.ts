import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // El VPS no tiene RAM suficiente para el type-checker de Next.js.
  // Usamos tsc --noEmit por separado en local para validar tipos.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
