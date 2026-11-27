// The mark of the request the 404 route makes to this same server (src/app/[lang]/[...resto]/route.ts and src/proxy.ts). It used to be
// the value `1`, which any visitor could send to turn any page into the 404. Now it is a random value born with the process and never
// sent outside, so only the server marks its own request; the proxy drops the header when the value is anything else.
//
// The value lives on globalThis under a registered symbol, so the proxy and the route handlers of the same process read the same one.

const KEY = Symbol.for('folgali.site.internal404Mark')

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The mark of this process (64 hexadecimal characters). */
export function internalMark(): string {
  const g = globalThis as unknown as Record<symbol, string | undefined>
  let v = g[KEY]
  if (typeof v !== 'string' || v.length !== 64) {
    v = hex(crypto.getRandomValues(new Uint8Array(32)))
    g[KEY] = v
  }
  return v
}

/** Constant-time comparison of a header value with the mark. */
export function isInternalMark(value: string | null): boolean {
  const mark = internalMark()
  if (typeof value !== 'string' || value.length !== mark.length) return false
  let diff = 0
  for (let i = 0; i < mark.length; i++) diff |= mark.charCodeAt(i) ^ value.charCodeAt(i)
  return diff === 0
}
