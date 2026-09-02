const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: API_BASE_URL,
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
