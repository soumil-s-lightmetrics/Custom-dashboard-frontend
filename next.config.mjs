/**
 * Nothing to configure: the UI calls its own /api/custom-dashboard route
 * handlers on the same origin, so there is no proxying to set up. Everything
 * else is read from the environment at runtime (see
 * src/custom-dashboard/server/config.ts).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {};

export default nextConfig;
