/** @type {import('next').NextConfig} */
/**
 * CSP with per-request nonces is applied in `src/middleware.ts` (Next.js 15 App Router guidance).
 * Do not set Content-Security-Policy here — static header values cannot carry request nonces
 * and would race with middleware (including reintroducing unsafe-inline for scripts).
 */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@daynori/design-tokens',
    '@daynori/ui-web',
    '@daynori/contracts',
    '@daynori/sync',
    '@daynori/domain',
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

export default nextConfig;
