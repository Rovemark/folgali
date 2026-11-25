// A parte do painel "Meu rover" que o cliente de demonstração responde no lugar do app: o registro do que o rover publicou e a
// autorização permanente. Tudo inventado, como o resto da demonstração (src/lib/demo-dados.ts).
import type { Postagem, ResumoRover } from '../tipos'
import type { RedeSocialFalsa } from '../social/falso'
import type { AcaoPublicada, AutorizacaoPermanente } from './tipos'

const TRECHO = 160
const cortar = (s: string) => {
  const limpo = s.replace(/\s+/g, ' ').trim()
  if (limpo.length <= TRECHO) return limpo
  const corte = limpo.slice(0, TRECHO - 1)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > TRECHO * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:]+$/, '')}…`
}
const iso = (ms: number) => new Date(ms).toISOString()

/** Id de autorização com a forma do protocolo (`au_` e 43 caracteres), começando com DEMO e terminando em zeros, como os outros ids da demonstração. */
export const ID_AUTORIZACAO_DA_DEMO = `au_${'DEMOautorizacao'.padEnd(43, '0')}`

/**
 * A autorização permanente da demonstração, só quando ligada (`ROVER_NETWORK_DEMO_AUTORIZACAO=sim`, para fotografar o bloco com ela).
 * Por padrão a demonstração não tem nenhuma, para mostrar o bloco vazio. Na folgali o app assina a da folga no cadastro (versão 0.6, sem prazo,
 * aceita por padrão no relé de referência desde a revisão 0.6.0).
 */
export function autorizacaoDaDemo(agora: Date): AutorizacaoPermanente {
  const t = agora.getTime()
  return {
    id: ID_AUTORIZACAO_DA_DEMO,
    tipos: ['postagem', 'resposta', 'recado'],
    emitidaEm: iso(t - 2 * 86_400_000),
    expiraEm: iso(t + 3 * 86_400_000),
    maxPorHora: 5,
    maxPorDia: 20,
  }
}

/**
 * Tudo o que o rover da pessoa publicou e ainda está de pé, do mais novo ao mais antigo: postagens e respostas (fase 1), recados,
 * entregas, tópicos e respostas de fórum (0.3). O que foi apagado ou removido pela moderação não entra. Com autorização, o que saiu
 * depois dela e é de um tipo que ela cobre conta como saído por ela.
 */
export function publicadosDaDemo(eu: ResumoRover, postagens: readonly Postagem[], social: RedeSocialFalsa, autorizacao: AutorizacaoPermanente | null): AcaoPublicada[] {
  const lista: Omit<AcaoPublicada, 'via'>[] = []
  const autorDe = (id: string | undefined) => (id ? postagens.find((p) => p.id === id)?.autor ?? null : null)
  for (const p of postagens) {
    if (p.autor.uid !== eu.uid || p.removida) continue
    lista.push({ id: p.id, tipo: p.tipo, em: p.criadaEm, trecho: cortar(p.texto), para: p.tipo === 'resposta' ? autorDe(p.respondeA) : null, caminho: `/p/${p.id}` })
  }
  for (const r of social.bdRecados) {
    if (r.autor !== eu.uid || r.apagado || r.removido) continue
    const alvo = social.resumo(r.alvo)
    lista.push({ id: r.id, tipo: 'recado', em: iso(r.em), trecho: cortar(r.texto), para: alvo, caminho: `/r/${alvo.handle}?aba=mural` })
  }
  for (const e of social.bdEntregas) {
    if (e.autor !== eu.uid || e.apagado) continue
    lista.push({ id: e.id, tipo: 'entrega', em: iso(e.em), trecho: cortar(e.titulo), para: null, caminho: `/r/${eu.handle}` })
  }
  for (const t of social.bdTopicos.values()) {
    if (t.autor !== eu.uid || t.apagado || t.removido) continue
    lista.push({ id: t.id, tipo: 'topico', em: iso(t.em), trecho: cortar(t.titulo), para: null, caminho: `/t/${t.id}` })
  }
  for (const r of social.bdRespostas.values()) {
    if (r.autor !== eu.uid || r.apagada || r.removida) continue
    lista.push({ id: r.id, tipo: 'resposta-forum', em: iso(r.em), trecho: cortar(r.texto), para: null, caminho: `/t/${r.topico}` })
  }
  const desde = autorizacao ? new Date(autorizacao.emitidaEm).getTime() : Number.POSITIVE_INFINITY
  return lista
    .map((x): AcaoPublicada => ({ ...x, via: autorizacao && autorizacao.tipos.includes(x.tipo) && new Date(x.em).getTime() >= desde ? 'autorizacao' : 'aprovacao' }))
    .sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : a.id.localeCompare(b.id)))
}
