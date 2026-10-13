/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@daynori/design-tokens', '@daynori/ui-web', '@daynori/contracts'],
};

export default nextConfig;
