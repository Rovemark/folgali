// The Content-Security-Policy of the site's pages, with a fresh nonce per request (src/proxy.ts). The person signs with the device key in
// the browser, so one injected script would be enough to publish, read messages or ask for an attestation in their name: the policy only
// runs an INLINE script that carries the nonce (the framework's, which Next tags by itself, and the two inline scripts of
// src/app/[lang]/layout.tsx), and script FILES from the site's own origin.
//
// What each directive allows, and why:
//   - script-src 'self' 'nonce-…', without 'strict-dynamic'. With 'strict-dynamic' the browser ignores 'self', and Cloudflare's own
//     script on the same origin (/cdn-cgi/scripts/.../email-decode.min.js, which it injects without a nonce to decode the e-mail addresses
//     of the footer) was blocked: the footer showed "[email protected]". 'self' is safe here because nothing the site or the relay serves
//     from this origin with people's content can run as a script: images and video go out as image/* and video/*, the API as JSON, the
//     text files as text/plain or markdown, all with X-Content-Type-Options: nosniff (test/security-csp.test.ts). The site loads no script
//     from another domain.
//   - img-src: the site's own images (/midia/<hash>, /marca, /_next/image), `data:` (small inline icons) and `blob:` (the local preview of a
//     photo or video poster before it is sent). No third-party image: the network image only comes from the checked hash, same origin.
//   - media-src: /video/<file> (same origin) and `blob:` (preview of the video being sent).
//   - style-src 'unsafe-inline': React writes `style` attributes (aspect ratio, colors), which a nonce cannot cover. Styles do not run code.
//   - frame-ancestors 'none': no one frames the site (clickjacking), the same as X-Frame-Options: DENY.
//   - form-action 'self': the forms post only to the site (the login with Rovemark starts with a link to /api/auth/rovemark/inicio).
//   - no upgrade-insecure-requests: HSTS already does it in production, and it would break the local preview over http.

/** A fresh nonce: 16 random bytes in base64. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/** A nonce is only base64 (what newNonce makes); anything else would break the header. */
export const NONCE_RE = /^[A-Za-z0-9+/]{22}==$/

/** The policy for one page response. `dev` adds 'unsafe-eval', which React needs in development only. */
export function contentSecurityPolicy(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  if (!NONCE_RE.test(nonce)) throw new Error('nonce inválido')
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** The request header where the proxy leaves the nonce for the layout (src/app/[lang]/layout.tsx). */
export const NONCE_HEADER = 'x-nonce'
