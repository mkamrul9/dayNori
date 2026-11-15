import net from 'node:net';
import type { FastifyRequest } from 'fastify';

/**
 * Official Cloudflare IPv4 CIDR Blocks
 * Primary Source: https://www.cloudflare.com/ips-v4
 */
export const CLOUDFLARE_IPV4_CIDRS: readonly string[] = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

/**
 * Official Cloudflare IPv6 CIDR Blocks
 * Primary Source: https://www.cloudflare.com/ips-v6
 */
export const CLOUDFLARE_IPV6_CIDRS: readonly string[] = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

/**
 * RFC 1918 Private, RFC 6598 CGNAT, and Loopback IP Ranges
 * Trusted internal networks within container mesh, Kubernetes, Render, and Docker.
 */
export const PRIVATE_PROXY_CIDRS: readonly string[] = [
  '127.0.0.1',
  '127.0.0.0/8',
  '::1',
  '::1/128',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10', // Carrier-Grade NAT (RFC 6598) used by Render internal routers
];

/**
 * Full array of trusted proxies for Fastify trustProxy configuration.
 * Fastify (via proxy-addr) walks the X-Forwarded-For header from right to left,
 * trusting only proxies within these CIDR blocks and returning the first untrusted IP.
 */
export const TRUSTED_PROXY_CIDRS: readonly string[] = [
  ...PRIVATE_PROXY_CIDRS,
  ...CLOUDFLARE_IPV4_CIDRS,
  ...CLOUDFLARE_IPV6_CIDRS,
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [subnet, bitsStr] = cidr.split('/');
  if (!subnet) return false;
  const bits = bitsStr ? parseInt(bitsStr, 10) : 32;
  const mask = bits === 0 ? 0 : ((0xFFFFFFFF << (32 - bits)) >>> 0);
  const ipInt = ipv4ToInt(ip);
  const subnetInt = ipv4ToInt(subnet);
  return (ipInt & mask) === (subnetInt & mask);
}

function ipv6ToBigInt(ip: string): bigint {
  const parts = ip.split('::');
  let left = parts[0] ? parts[0].split(':') : [];
  let right = parts[1] ? parts[1].split(':') : [];
  if (parts.length > 1) {
    const missing = 8 - (left.length + right.length);
    const middle = Array(missing).fill('0');
    left = [...left, ...middle, ...right];
  }
  return left.reduce((acc, word) => (acc << 16n) + BigInt(parseInt(word || '0', 16)), 0n);
}

function ipv6InCidr(ip: string, cidr: string): boolean {
  const [subnet, bitsStr] = cidr.split('/');
  if (!subnet) return false;
  const bits = bitsStr ? BigInt(bitsStr) : 128n;
  const mask = bits === 0n ? 0n : ((~0n) << (128n - bits)) & ((1n << 128n) - 1n);
  const ipInt = ipv6ToBigInt(ip);
  const subnetInt = ipv6ToBigInt(subnet);
  return (ipInt & mask) === (subnetInt & mask);
}

/**
 * Verifies whether a given IP address belongs to a specified CIDR range.
 */
export function ipInCidr(rawIp: string, cidr: string): boolean {
  if (!rawIp || !cidr) return false;
  const ip = rawIp.replace(/^::ffff:/i, '');
  const ipType = net.isIP(ip);
  const [subnet] = cidr.split('/');
  if (!subnet) return false;
  const cidrType = net.isIP(subnet);

  if (ipType === 0 || ipType !== cidrType) {
    return false;
  }

  if (ipType === 4) {
    return ipv4InCidr(ip, cidr);
  }
  if (ipType === 6) {
    return ipv6InCidr(ip, cidr);
  }
  return false;
}

/**
 * Checks whether an IP address belongs to official Cloudflare edge IP ranges.
 */
export function isCloudflareIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/i, '');
  const type = net.isIP(normalized);
  if (type === 4) {
    return CLOUDFLARE_IPV4_CIDRS.some((cidr) => ipv4InCidr(normalized, cidr));
  }
  if (type === 6) {
    return CLOUDFLARE_IPV6_CIDRS.some((cidr) => ipv6InCidr(normalized, cidr));
  }
  return false;
}

/**
 * Checks whether an IP address is considered a trusted internal proxy or Cloudflare proxy.
 */
export function isTrustedProxy(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/i, '');
  const type = net.isIP(normalized);
  if (type === 4) {
    for (const cidr of PRIVATE_PROXY_CIDRS) {
      if (cidr.includes('/') ? ipv4InCidr(normalized, cidr) : normalized === cidr) {
        return true;
      }
    }
    return isCloudflareIp(normalized);
  }
  if (type === 6) {
    for (const cidr of PRIVATE_PROXY_CIDRS) {
      if (cidr.includes('/') ? ipv6InCidr(normalized, cidr) : normalized === cidr) {
        return true;
      }
    }
    return isCloudflareIp(normalized);
  }
  return false;
}

/**
 * Securely resolves the genuine client IP address for rate limiting and auditing.
 *
 * RULES:
 * 1. If request.actor?.userId is present, actor identity is authoritative.
 * 2. If the immediate peer socket is NOT a trusted proxy, it is an untrusted client connecting directly.
 *    In this case, ALL proxy headers (CF-Connecting-IP, X-Forwarded-For) are completely ignored.
 * 3. Never trust a client-supplied CF-Connecting-IP unless the immediate peer socket or a verified
 *    upstream proxy in the chain is an official Cloudflare edge address.
 * 4. Never trust the leftmost IP in X-Forwarded-For; only walk right-to-left through verified proxies.
 */
export function resolveClientIp(request: FastifyRequest): string {
  // If actor is authenticated, rate-limiting is keyed on user ID
  if (request.actor?.userId) {
    return `actor:${request.actor.userId}`;
  }

  const socketIp =
    request.raw?.socket?.remoteAddress ||
    (request as unknown as { socket?: { remoteAddress?: string } }).socket?.remoteAddress ||
    request.ip ||
    '127.0.0.1';
  const cleanSocketIp = socketIp.replace(/^::ffff:/i, '');

  // If the direct socket peer is NOT a trusted proxy, it is an untrusted client connecting directly.
  // In this case, ALL proxy headers (CF-Connecting-IP, X-Forwarded-For) are completely untrusted and ignored.
  if (!isTrustedProxy(cleanSocketIp)) {
    return cleanSocketIp;
  }

  let hasCloudflareHop = isCloudflareIp(cleanSocketIp);
  let xffResolvedIp: string | null = null;
  const rawXff = request.headers?.['x-forwarded-for'];

  if (typeof rawXff === 'string' && rawXff.trim()) {
    const hops = rawXff.split(',').map((h) => h.trim().replace(/^::ffff:/i, '')).filter(Boolean);
    // Walk from right to left
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i];
      if (!hop) continue;
      if (isCloudflareIp(hop)) {
        hasCloudflareHop = true;
      }
      if (!xffResolvedIp && !isTrustedProxy(hop)) {
        // This is the first untrusted IP from the right = the genuine client IP!
        xffResolvedIp = hop;
      }
    }
  }

  // If Cloudflare is verified in the ingress path, CF-Connecting-IP is trustworthy
  if (hasCloudflareHop) {
    const cfIp = request.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) {
      const cleanCfIp = cfIp.trim().replace(/^::ffff:/i, '');
      if (net.isIP(cleanCfIp)) {
        return cleanCfIp;
      }
    }
  }

  if (xffResolvedIp) {
    return xffResolvedIp;
  }

  // If Fastify already resolved request.ip and it is not a proxy, use it
  if (request.ip && !isTrustedProxy(request.ip.replace(/^::ffff:/i, ''))) {
    return request.ip.replace(/^::ffff:/i, '');
  }

  return cleanSocketIp;
}
