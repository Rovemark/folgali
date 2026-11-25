// ClienteHttp: fala com o relé real. O endereço vem de ROVER_NETWORK_RELE_URL (veja obter-rede.ts).
// Roda só no servidor do site: o navegador nunca fala direto com o relé, então nenhum endereço
// interno nem credencial vai para a tela. Toda resposta passa pelo `sanear` antes de ser usada.

import type { ClienteRede } from './cliente-rede'
import { LeituraSocialHttp, type Nivel } from './social/http/leitura'
import { codigoDoRele } from './social/http/erros'
import { verificarSelo, type ObjetoDeRede } from './dominio/aprovacao'
import { corpoDaDenuncia, validarDenuncia } from './dominio/denuncia'
import { termoDeBusca } from './dominio/handle'
import { ehIdObjeto, ehUid } from './dominio/ids'
import { HASH_RE, LIMITES_DE_IMAGEM, TIPO_MIME, type FormatoDeImagem } from './imagens'
import { sanearPostagem } from './sanear'
import * as S from './social/sanear-social'
import type { Atualizacao, ItemDaLinha, PaginaCartao } from './social/tipos'
import {
  ErroRede,
  type AgenteDeFora,
  type InfoDosAgentes,
  type DetalhePostagem,
  type Descoberta,
  type EntradaDenuncia,
  type Pagina,
  type PerfilRover,
  type Postagem,
  type ResultadoBusca,
  type TipoPostagem,
} from './tipos'

export interface OpcoesHttp {
  base: string
  /** milissegundos; o padrão é 8000 */
  prazo?: number
  /** troca o fetch (testes) */
  buscar?: typeof fetch
  /**
   * O cliente web não tem chave. Quem tem é o app do Rover Hangar: esta função devolve o valor do cabeçalho
   * `Authorization: Rover-Assinatura ...` para UM pedido exato (método e caminho com a consulta, como o relé
   * os vê, sem o prefixo do endereço-base), ou null. Sem ela, as leituras "próprias" nem saem do computador.
   */
  credencial?: (metodo: string, caminhoComConsulta: string) => Promise<string | null>
  /** uid do rover da pessoa (app pareado): usado na linha mista e nas sugestões. */
  leitor?: string
  /**
   * Guarda por este tempo (ms) as leituras públicas iguais. O site chama o relé por dentro da rede do servidor, então todos os
   * visitantes dividem a rajada de UMA origem no relé; o cache curto absorve a repetição (a mesma página aberta por várias
   * pessoas, o mesmo perfil em vários cartões). 0 desliga (padrão). Só leituras sem credencial entram; erro nunca entra.
   */
  cacheMs?: number
}

export class ClienteHttp extends LeituraSocialHttp implements ClienteRede {
  readonly modo = 'http' as const
  private readonly base: string
  private readonly prazo: number
  private readonly buscarUrl: typeof fetch

  private readonly credencial?: OpcoesHttp['credencial']
  private readonly cacheMs: number
  private readonly cache = new Map<string, { ate: number; valor: unknown }>()

  constructor(opcoes: OpcoesHttp) {
    super()
    this.credencial = opcoes.credencial
    this.cacheMs = Math.max(0, opcoes.cacheMs ?? 0)
    if (opcoes.leitor !== undefined) {
      if (!ehUid(opcoes.leitor)) throw new ErroRede('invalido', 'uid do leitor inválido')
      this.leitor = opcoes.leitor
    }
    let u: URL
    try {
      u = new URL(opcoes.base)
    } catch {
      throw new ErroRede('invalido', 'endereço do relé inválido')
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ErroRede('invalido', 'endereço do relé precisa ser http ou https')
    this.base = u.origin + u.pathname.replace(/\/+$/, '')
    this.prazo = opcoes.prazo ?? 8000
    this.buscarUrl = opcoes.buscar ?? fetch
  }

  protected async ler(caminho: string, nivel: Nivel): Promise<unknown> {
    const cabecalhos: Record<string, string> = {}
    if (nivel !== 'publica') {
      let c: string | null = null
      try {
        c = (await this.credencial?.('GET', caminho)) ?? null
      } catch {
        c = null
      }
      if (nivel === 'propria' && !c) throw new ErroRede('proibido', 'leitura própria exige o rover da pessoa')
      if (c) cabecalhos.authorization = c
    }
    return this.chamar('GET', caminho, undefined, cabecalhos)
  }

  protected postagem(x: unknown): Postagem {
    return sanearPostagem(x)
  }

  // `suporta(recurso)` mora em LeituraSocialHttp (social/http/leitura.ts): os recursos da 0.3.1 que o relé declara em `/v1/info`.

  /**
   * Um item no formato completo do relé 0.3.1 (`{ envelope, autor, contagens, minhaReacao }`) vira a postagem que as telas mostram,
   * com as contagens REAIS e o autor que já vem junto (sem uma chamada de perfil por item).
   */
  private postagemDeItem(bruto: unknown): Postagem {
    const item = bruto as { envelope?: { objeto?: Record<string, unknown> }; autor?: unknown; contagens?: { respostas?: unknown; reacoes?: Record<string, unknown> }; minhaReacao?: unknown } | null
    const o = item?.envelope?.objeto
    const corpo = (o?.corpo ?? {}) as Record<string, unknown>
    if (!o || (o.tipo !== 'postagem' && o.tipo !== 'resposta')) throw new ErroRede('indisponivel', 'resposta do relé fora do contrato')
    const reacoes = item?.contagens?.reacoes ?? {}
    return sanearPostagem({
      id: o.id,
      tipo: o.tipo,
      autor: S.roverResumo(item?.autor),
      texto: corpo.texto,
      topicos: corpo.topicos ?? [],
      criadaEm: new Date((Number(o.criadoEm) || 0) * 1000).toISOString(),
      respondeA: o.tipo === 'resposta' && typeof corpo.alvo === 'string' ? corpo.alvo : undefined,
      respostas: item?.contagens?.respostas ?? 0,
      reacoes: { curtir: reacoes.curtir ?? 0, util: reacoes.util ?? 0 },
      minhaReacao: item?.minhaReacao ?? null,
      imagens: (item as { imagens?: unknown } | null)?.imagens,
    })
  }

  /**
   * 0.5.0: os bytes de uma imagem do relé, para a rota `/midia/...` do próprio site servir (o navegador nunca fala com o relé).
   * Só hash hexadecimal vira caminho; só JPEG, PNG e WebP voltam, pelo tipo que o relé declara; o tamanho tem o teto do protocolo.
   */
  async imagem(hash: string): Promise<{ bytes: Uint8Array; formato: FormatoDeImagem } | null> {
    if (!HASH_RE.test(hash)) return null
    let res: Response
    try {
      res = await this.buscarUrl(`${this.base}/v1/midia/${hash}`, { method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(this.prazo) })
    } catch {
      return null
    }
    if (res.status !== 200) return null
    const formato = (Object.entries(TIPO_MIME) as [FormatoDeImagem, string][]).find(([, t]) => t === res.headers.get('content-type'))?.[0]
    const declarado = Number(res.headers.get('content-length'))
    if (!formato || (Number.isFinite(declarado) && declarado > LIMITES_DE_IMAGEM.bytesMax)) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytes.length > LIMITES_DE_IMAGEM.bytesMax ? null : { bytes, formato }
  }

  private paginaDeItens(bruto: unknown, tipo?: TipoPostagem): Pagina<Postagem> {
    const r = bruto as { itens?: unknown; proximo?: unknown } | null
    if (!r || !Array.isArray(r.itens)) throw new ErroRede('indisponivel', 'resposta do relé fora do contrato')
    const itens = r.itens.slice(0, 50).map((i) => this.postagemDeItem(i)).filter((p) => tipo === undefined || p.tipo === tipo)
    return typeof r.proximo === 'number' || typeof r.proximo === 'string' ? { itens, proximo: String(r.proximo) } : { itens }
  }

  private async chamar(metodo: string, caminho: string, corpo?: unknown, extras: Record<string, string> = {}): Promise<unknown> {
    const cacheavel = this.cacheMs > 0 && metodo === 'GET' && !('authorization' in extras)
    if (cacheavel) {
      const guardado = this.cache.get(caminho)
      if (guardado && guardado.ate > Date.now()) return guardado.valor
    }
    const valor = await this.chamarSemCache(metodo, caminho, corpo, extras)
    if (cacheavel) {
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value as string)
      this.cache.set(caminho, { ate: Date.now() + this.cacheMs, valor })
    }
    return valor
  }

  private async chamarSemCache(metodo: string, caminho: string, corpo?: unknown, extras: Record<string, string> = {}): Promise<unknown> {
    let res: Response
    try {
      res = await this.buscarUrl(`${this.base}${caminho}`, {
        method: metodo,
        headers: { accept: 'application/json', ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...extras },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(this.prazo),
      })
    } catch {
      throw new ErroRede('indisponivel', 'o relé não respondeu')
    }
    if (!res.ok) {
      // O código do protocolo vale mais que o status; a MENSAGEM do relé nunca é repassada (é dado de estranho).
      let corpoErro: unknown
      try {
        corpoErro = await res.json()
      } catch {
        corpoErro = undefined
      }
      throw new ErroRede(codigoDoRele(res.status, corpoErro), 'o relé recusou o pedido')
    }
    if (res.status === 204) return undefined
    try {
      return await res.json()
    } catch {
      throw new ErroRede('indisponivel', 'resposta do relé fora do contrato')
    }
  }

  async publicar(objeto: ObjetoDeRede): Promise<{ id: string }> {
    // O cliente nunca manda para a rede o que não passou por uma aprovação.
    if (!verificarSelo(objeto)) throw new ErroRede('sem-aprovacao', 'objeto sem aprovação humana válida')
    const r = (await this.chamar('POST', '/v1/objetos', objeto)) as { id?: unknown } | undefined
    if (!r || typeof r.id !== 'string') throw new ErroRede('indisponivel', 'resposta do relé fora do contrato')
    return { id: r.id }
  }

  /**
   * O perfil de um rover, pelo uid ou pelo @handle. O relé achou o handle em `/v1/handles/:handle` (não existe `/v1/rovers/@handle`).
   * A resposta é a do relé 0.3 (descricao, habilidades, retrato...), lida pelo saneador social.
   */
  async obterRover(ref: string): Promise<PerfilRover> {
    if (ehUid(ref)) return S.perfilSocial(await this.chamar('GET', `/v1/rovers/${ref}`))
    const handle = ref.replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9._]{3,30}$/.test(handle)) throw new ErroRede('nao-encontrado', 'não encontrado')
    return S.perfilSocial(await this.chamar('GET', `/v1/handles/${encodeURIComponent(handle)}`))
  }

  /**
   * 0.6.0: a plataforma e a folga de um agente de fora, do emissor aberto (mesmo endereço-base: o proxy do domínio manda /v1/agentes/... a
   * ele). Leitura pública, entra no cache curto. 404 vira `null`: o emissor não conhece (ou já tirou) o agente, e a tela fica só com o selo.
   */
  async agenteDeFora(uid: string): Promise<AgenteDeFora | null> {
    if (!ehUid(uid)) return null
    try {
      return S.agenteDeFora(await this.chamar('GET', `/v1/agentes/${uid}`))
    } catch (e) {
      if (e instanceof ErroRede && e.codigo === 'nao-encontrado') return null
      throw e
    }
  }

  /** 0.6.0: `GET /v1/agentes/info`. Sem emissor aberto no domínio (404), `null`: a tela não promete número nenhum. */
  async infoDosAgentes(): Promise<InfoDosAgentes | null> {
    try {
      return S.infoDosAgentes(await this.chamar('GET', '/v1/agentes/info'))
    } catch (e) {
      if (e instanceof ErroRede && e.codigo === 'nao-encontrado') return null
      throw e
    }
  }

  /**
   * Transforma o envelope que o relé serve (objeto + aprovação) na postagem que as telas mostram. O relé NÃO serve a contagem de
   * respostas nem de reações de uma postagem: elas chegam como 0, e as telas não devem prometer o que o relé não sabe.
   */
  private async postagemDoEnvelope(env: unknown): Promise<Postagem> {
    const o = (env as { objeto?: Record<string, unknown> } | null)?.objeto
    const corpo = (o?.corpo ?? {}) as Record<string, unknown>
    if (!o || (o.tipo !== 'postagem' && o.tipo !== 'resposta') || typeof o.autor !== 'string' || !ehUid(o.autor)) {
      throw new ErroRede('indisponivel', 'resposta do relé fora do contrato')
    }
    const autor = await this.obterRover(o.autor)
    return sanearPostagem({
      id: o.id,
      tipo: o.tipo,
      autor: { uid: autor.uid, handle: autor.handle, nome: autor.nome, rosto: autor.rosto },
      texto: corpo.texto,
      topicos: corpo.topicos ?? [],
      criadaEm: new Date((Number(o.criadoEm) || 0) * 1000).toISOString(),
      respondeA: o.tipo === 'resposta' && typeof corpo.alvo === 'string' ? corpo.alvo : undefined,
      respostas: 0,
      reacoes: { curtir: 0, util: 0 },
    })
  }

  private async paginaDeEnvelopes(bruto: unknown, tipo?: TipoPostagem): Promise<Pagina<Postagem>> {
    const r = bruto as { itens?: unknown; proximo?: unknown } | null
    if (!r || !Array.isArray(r.itens)) throw new ErroRede('indisponivel', 'resposta do relé fora do contrato')
    // Um item cujo autor saiu da rede (404) some da lista; qualquer outra falha (fora do contrato, relé fora do ar) é da página inteira.
    const lidas = await Promise.all(
      r.itens.slice(0, 50).map((e) =>
        this.postagemDoEnvelope(e).catch((erro) => {
          if (erro instanceof ErroRede && erro.codigo === 'nao-encontrado') return null
          throw erro
        }),
      ),
    )
    const itens = lidas.filter((p): p is Postagem => p !== null && (tipo === undefined || p.tipo === tipo))
    return typeof r.proximo === 'number' || typeof r.proximo === 'string' ? { itens, proximo: String(r.proximo) } : { itens }
  }

  async postagensDoRover(uid: string, opcoes: { cursor?: string; tipo?: TipoPostagem } = {}): Promise<Pagina<Postagem>> {
    if (!ehUid(uid)) throw new ErroRede('nao-encontrado', 'não encontrado')
    const q = new URLSearchParams({ limite: '20' })
    if (opcoes.cursor) q.set('antes', opcoes.cursor)
    // 0.3.1: a lista completa traz o autor e as contagens de respostas e reações; o relé 0.3 só trazia o envelope (contagens zeradas).
    if (await this.suporta('lista-completa')) {
      q.set('completo', '1')
      return this.paginaDeItens(await this.ler(`/v1/rovers/${uid}/postagens?${q}`, 'opcional'), opcoes.tipo)
    }
    return this.paginaDeEnvelopes(await this.chamar('GET', `/v1/rovers/${uid}/postagens?${q}`), opcoes.tipo)
  }

  /** Quem publica na linha do visitante: os recém-chegados e, se faltar gente, quem participa das primeiras comunidades abertas. */
  private async roversParaALinha(): Promise<string[]> {
    const uids = new Set<string>()
    const juntar = (bruto: unknown, uidDe: (x: unknown) => unknown) => {
      const itens = (bruto as { itens?: unknown } | null)?.itens
      if (!Array.isArray(itens)) return
      for (const x of itens) {
        const u = uidDe(x)
        if (typeof u === 'string' && ehUid(u)) uids.add(u)
      }
    }
    juntar(await this.chamar('GET', '/v1/descobrir/recem-chegados?limite=12').catch(() => null), (x) => (x as { uid?: unknown })?.uid)
    if (uids.size < 12) {
      const comunidades = await this.chamar('GET', '/v1/comunidades?limite=3').catch(() => null)
      const ids = ((comunidades as { itens?: unknown } | null)?.itens as { id?: unknown }[] | undefined)?.map((c) => c?.id).filter((i): i is string => typeof i === 'string' && ehIdObjeto(i)) ?? []
      const lotes = await Promise.all(ids.map((id) => this.chamar('GET', `/v1/comunidades/${id}/membros?limite=10`).catch(() => null)))
      for (const l of lotes) juntar(l, (x) => (x as { rover?: { uid?: unknown } })?.rover?.uid)
    }
    return [...uids].slice(0, 12)
  }

  /**
   * A linha de quem olha. Com o rover da pessoa pareado, é a linha dele (`/v1/linha/inicio?rover=`). Sem ele (visitante) o relé não
   * tem linha: monta-se uma pública com as postagens mais novas de quem chegou há pouco ou participa das comunidades abertas, sem paginação.
   */
  async linhaInicio(cursor?: string): Promise<Pagina<Postagem>> {
    if (this.leitor) {
      const q = new URLSearchParams({ rover: this.leitor, limite: '20' })
      if (cursor) q.set('antes', cursor)
      if (await this.suporta('lista-completa')) {
        q.set('completo', '1')
        return this.paginaDeItens(await this.ler(`/v1/linha/inicio?${q}`, 'opcional'))
      }
      return this.paginaDeEnvelopes(await this.chamar('GET', `/v1/linha/inicio?${q}`))
    }
    if (cursor) return { itens: [] }
    const uids = await this.roversParaALinha()
    const paginas = await Promise.all(uids.map((u) => this.postagensDoRover(u, { tipo: 'postagem' }).catch(() => ({ itens: [] as Postagem[] }))))
    const todas = paginas.flatMap((p) => p.itens.slice(0, 3))
    todas.sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1))
    return { itens: todas.slice(0, 30) }
  }

  /**
   * A linha mista (postagens e atualizações de página). Com o rover da pessoa pareado, é a linha dele. O visitante não tem linha no relé
   * (`linha/inicio` pede `rover`): para ele monta-se uma pública, sem paginação, com as postagens de quem chegou há pouco e as
   * atualizações das páginas mais recentes, da mais nova para a mais velha.
   */
  override async linhaMista(cursor?: string): Promise<Pagina<ItemDaLinha>> {
    if (this.leitor) return super.linhaMista(cursor)
    if (cursor) return { itens: [] }
    const [posts, paginas] = await Promise.all([
      this.linhaInicio().catch(() => ({ itens: [] as Postagem[] })),
      this.paginas({ ordem: 'recentes' }).catch(() => ({ itens: [] as PaginaCartao[] })),
    ])
    // a lista de atualizações do relé não traz o nome da página; a linha mostra a inicial dele, então ele vem do cartão da página
    const lotes = await Promise.all(
      paginas.itens.slice(0, 6).map(async (g) => {
        const l = await this.atualizacoes(g.id).catch(() => ({ itens: [] as Atualizacao[] }))
        return l.itens.slice(0, 3).map((a): Atualizacao => ({ ...a, paginaNome: a.paginaNome ?? g.nome }))
      }),
    )
    const itens: ItemDaLinha[] = [
      ...posts.itens.map((postagem): ItemDaLinha => ({ tipo: 'postagem', postagem })),
      ...lotes.flat().map((atualizacao): ItemDaLinha => ({ tipo: 'atualizacao', atualizacao })),
    ]
    const quando = (i: ItemDaLinha) => (i.tipo === 'postagem' ? i.postagem.criadaEm : i.atualizacao.criadaEm)
    itens.sort((a, b) => (quando(a) < quando(b) ? 1 : -1))
    return { itens: itens.slice(0, 30) }
  }

  /** Uma postagem ou resposta. Num relé 0.3 ele não lista as respostas a uma postagem (`respostas` vem vazio); a 0.3.1 lista. O pai de uma resposta vem do próprio relé. */
  async obterObjeto(id: string): Promise<DetalhePostagem> {
    if (!ehIdObjeto(id)) throw new ErroRede('nao-encontrado', 'não encontrado')
    // 0.3.1: a postagem com as contagens reais e as respostas listadas. Se o id não é de postagem (uma resposta, por exemplo) o relé
    // responde 404 e o caminho de antes segue valendo.
    if (await this.suporta('postagem-detalhe')) {
      try {
        const postagem = this.postagemDeItem(await this.ler(`/v1/postagens/${id}`, 'opcional'))
        const lista = await this.ler(`/v1/postagens/${id}/respostas?ordem=antigas&limite=50`, 'opcional').catch(() => ({ itens: [] }))
        return { postagem, respostas: this.paginaDeItens(lista).itens }
      } catch (erro) {
        if (!(erro instanceof ErroRede && erro.codigo === 'nao-encontrado')) throw erro
      }
    }
    const postagem = await this.postagemDoEnvelope(await this.chamar('GET', `/v1/objetos/${id}`))
    const pai = postagem.respondeA && ehIdObjeto(postagem.respondeA)
      ? await this.postagemDoEnvelope(await this.chamar('GET', `/v1/objetos/${postagem.respondeA}`)).catch(() => undefined)
      : undefined
    return { postagem, ...(pai ? { pai } : {}), respostas: [] }
  }

  async denunciar(entrada: EntradaDenuncia): Promise<void> {
    const v = validarDenuncia(entrada)
    if (!v.ok) throw new ErroRede('invalido', `denúncia inválida: ${v.erro}`)
    // Só alvo e motivo. Nada sobre quem denuncia: nem chave, nem cookie, nem referência. O site não tem nada disso para mandar.
    await this.chamar('POST', `/v1/objetos/${v.denuncia.alvo}/denuncias`, corpoDaDenuncia(v.denuncia))
  }

  async removerPeloAutor(id: string, autor: string): Promise<void> {
    if (!ehIdObjeto(id) || !ehUid(autor)) throw new ErroRede('invalido', 'pedido inválido')
    await this.chamar('DELETE', `/v1/objetos/${id}`, { autor })
  }

  async buscar(termo: string): Promise<ResultadoBusca> {
    const t = termoDeBusca(termo)
    if (!t) return { rovers: [] }
    const r = (await this.chamar('GET', `/v1/busca?${new URLSearchParams({ q: t, tipo: 'rovers', limite: '20' })}`)) as { itens?: unknown }
    if (!r || !Array.isArray(r.itens)) throw new ErroRede('indisponivel', 'resposta do relé fora do contrato')
    const uids = r.itens.slice(0, 20).map((x) => (x as { uid?: unknown })?.uid).filter((u): u is string => typeof u === 'string' && ehUid(u))
    const perfis = await Promise.all(uids.map((u) => this.obterRover(u).catch(() => null)))
    return { rovers: perfis.filter((p): p is PerfilRover => p !== null) }
  }

  /** "Em alta": quem escreveu os tópicos em alta (o relé não tem rovers em alta). "Recém-chegados": a rota de descoberta do relé. */
  async descobrir(): Promise<Descoberta> {
    const quais = (bruto: unknown, campo: 'autor' | 'raiz'): string[] => {
      const itens = (bruto as { itens?: unknown } | null)?.itens
      if (!Array.isArray(itens)) return []
      const uids = itens.map((x) => (campo === 'autor' ? (x as { autor?: { uid?: unknown } })?.autor?.uid : (x as { uid?: unknown })?.uid))
      return [...new Set(uids.filter((u): u is string => typeof u === 'string' && ehUid(u)))]
    }
    const [alta, novos] = await Promise.all([
      this.chamar('GET', '/v1/descobrir/em-alta?tipo=topicos&janela=7d').catch(() => ({ itens: [] })),
      this.chamar('GET', '/v1/descobrir/recem-chegados?limite=8'),
    ])
    const perfis = (uids: string[]) => Promise.all(uids.map((u) => this.obterRover(u).catch(() => null))).then((l) => l.filter((p): p is PerfilRover => p !== null))
    const [emAlta, recemChegados] = await Promise.all([perfis(quais(alta, 'autor').slice(0, 6)), perfis(quais(novos, 'raiz').slice(0, 8))])
    return { emAlta, recemChegados }
  }
}
