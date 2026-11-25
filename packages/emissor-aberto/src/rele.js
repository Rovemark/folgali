// SPDX-License-Identifier: AGPL-3.0-or-later
// Como o emissor aberto alcança o relé que ele serve. Duas formas, o mesmo contrato:
//   handleLivre(handle) -> Promise<boolean>   o @ não é de nenhum rover do relé
//   entregar(declaracao) -> Promise<'entregue' | 'desconhecido' | 'recusada'>   lança quando o relé não respondeu (o emissor põe na fila)
// Em produção, `releHttp`: só as rotas públicas do relé, as mesmas que qualquer pessoa usa (GET /v1/handles/:handle e
// POST /v1/declaracoes). Nada de credencial: as declarações são assinadas com a chave de aprovação do agente.
// Nos testes, `releLocal`: o objeto `Rele` do mesmo processo.

const PRAZO_MS = 5000

/** O relé por HTTP. `base` é a raiz (https://folgali.com); as rotas `/v1/...` vêm depois. */
export function releHttp(base, { fetchImpl = fetch, prazoMs = PRAZO_MS } = {}) {
  const raiz = base.replace(/\/+$/, '')
  const pedir = (caminho, init = {}) => fetchImpl(raiz + caminho, { ...init, redirect: 'error', signal: AbortSignal.timeout(prazoMs) })
  return {
    base: raiz,
    async handleLivre(handle) {
      const res = await pedir(`/v1/handles/${encodeURIComponent(handle)}`)
      await res.arrayBuffer()
      if (res.status === 404) return true
      if (res.status === 200) return false
      throw new Error(`relé respondeu ${res.status}`)
    },
    async entregar(declaracao) {
      const res = await pedir('/v1/declaracoes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ declaracao }) })
      let codigo = null
      try { codigo = (await res.json())?.erro?.codigo ?? null } catch { /* corpo vazio */ }
      if (res.status === 200 || res.status === 201) return 'entregue'
      if (res.status === 404 && codigo === 'nao_encontrado') return 'desconhecido'
      // declaração mais velha que a guardada, ou recusada por esquema: repetir não muda nada
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return 'recusada'
      throw new Error(`relé respondeu ${res.status}`)
    }
  }
}

/** O relé do mesmo processo (testes e demonstração). */
export function releLocal(rele) {
  return {
    async handleLivre(handle) { return rele.armazem.roverPorHandle(handle) === null },
    async entregar(declaracao) {
      try {
        rele.aceitarDeclaracao({ declaracao })
        return 'entregue'
      } catch (e) {
        if (e?.codigo === 'nao_encontrado') return 'desconhecido'
        if (e?.status >= 400 && e?.status < 500 && e?.status !== 429) return 'recusada'
        throw e
      }
    }
  }
}
