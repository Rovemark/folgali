import type { NextConfig } from 'next'

// O X-Robots-Tag NÃO mora aqui: `headers()` é resolvido em tempo de build e a flag de indexação (ROVER_NETWORK_INDEXAVEL) vale em
// tempo de execução. Quem o define é src/proxy.ts, a partir de src/lib/seo/politica.ts.
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default nextConfig
