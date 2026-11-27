import './src/lib/legacy-env'
import type { NextConfig } from 'next'

// X-Robots-Tag does NOT live here: `headers()` is resolved at build time and the indexing flag (FOLGALI_INDEXABLE) applies at
// run time. It is set by src/proxy.ts, from src/lib/seo/policy.ts.
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
          // HTTPS only for a year, subdomains too. No `preload`: entering the browsers' list is a decision that is hard to undo.
          // The Content-Security-Policy is per request (a fresh nonce), so it is set in src/proxy.ts, not here.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // reservation of text and data mining rights (TDMRep, W3C): third parties may not mine or train without an agreement (Terms 8.3-A; Lex, section 7)
          { key: 'tdm-reservation', value: '1' },
        ],
      },
      {
        // the claim page shows the secret in the address: no Referer to the outside (INTEGRATION-ROVEMARK-VERIFIED-OWNER.md, section 7)
        source: '/:lang/agentes/reivindicar/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/:lang/agentes/reivindicar',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        // the open issuer's link (folgali.com/reivindicar/<secret>) forwards to the claim page: same rule
        source: '/:lang/reivindicar/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ]
  },
}

export default nextConfig
