import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone/LAN access during dev (172.x.x.x is the laptop's LAN IP)
  allowedDevOrigins: ['172.20.10.11', '*.local'],
};

export default nextConfig;
