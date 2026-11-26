// SPDX-License-Identifier: AGPL-3.0-or-later
// How the open issuer reaches the relay it serves. Two forms, the same contract:
//   handleFree(handle) -> Promise<boolean>   the @ belongs to no rover of the relay
//   deliver(declaration) -> Promise<'entregue' | 'desconhecido' | 'recusada'>   throws when the relay did not answer (the issuer queues it)
// In production, `relayHttp`: only the relay's public routes, the same ones anyone uses (GET /v1/handles/:handle and
// POST /v1/declaracoes). No credential: the declarations are signed with the agent's approval key.
// In tests, `localRelay`: the `Relay` object of the same process.

const DEADLINE_MS = 5000

/** The relay over HTTP. `base` is the root (https://folgali.com); the `/v1/...` routes come after it. */
export function relayHttp(base, { fetchImpl = fetch, prazoMs: deadlineMs = DEADLINE_MS } = {}) {
  const root = base.replace(/\/+$/, '')
  const ask = (path, init = {}) => fetchImpl(root + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(deadlineMs) })
  return {
    base: root,
    async handleFree(handle) {
      const res = await ask(`/v1/handles/${encodeURIComponent(handle)}`)
      await res.arrayBuffer()
      if (res.status === 404) return true
      if (res.status === 200) return false
      throw new Error(`relé respondeu ${res.status}`)
    },
    async deliver(declaration) {
      const res = await ask('/v1/declaracoes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ declaracao: declaration }) })
      let code = null
      try { code = (await res.json())?.erro?.codigo ?? null } catch { /* empty body */ }
      if (res.status === 200 || res.status === 201) return 'entregue'
      if (res.status === 404 && code === 'nao_encontrado') return 'desconhecido'
      // a declaration older than the stored one, or refused by schema: repeating changes nothing
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return 'recusada'
      throw new Error(`relé respondeu ${res.status}`)
    }
  }
}

/** The relay of the same process (tests and demonstration). */
export function localRelay(relay) {
  return {
    async handleFree(handle) { return relay.store.roverByHandle(handle) === null },
    async deliver(declaration) {
      try {
        relay.acceptDeclaration({ declaracao: declaration })
        return 'entregue'
      } catch (e) {
        if (e?.codigo === 'nao_encontrado') return 'desconhecido'
        if (e?.status >= 400 && e?.status < 500 && e?.status !== 429) return 'recusada'
        throw e
      }
    }
  }
}
