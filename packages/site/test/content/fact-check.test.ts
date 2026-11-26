// Fact check: an error in this content becomes a wrong fact quoted by search engines and by AIs. Here each protocol number
// that the text cites is read from the code (packages/protocol/src/limits.js) and compared, and a REAL object is generated to measure the
// size of the id, the key and the signature. A number with a unit (days, hours, characters...) that does not come from the protocol or from
// a source listed below is flagged: this way nobody invents a number without the test saying so.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { entity, faqEn, faqPt, guidesEn, guidesPt, newsEn, newsPt, glossaryEn, glossaryEntriesPt } from '@/content'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const limits = `${root}packages/protocol/src/limits.js`
const index = `${root}packages/protocol/src/index.js`
const has = existsSync(limits) && existsSync(index)
const read = (rel: string) => readFileSync(`${root}${rel}`, 'utf8')
// docs/legal is the legal team's internal working pack: it stays in the working repository and is left out of the public export
// (.gitattributes). The checks that read it are skipped there, with this reason.
const hasLegalPack = existsSync(`${root}docs/legal/README.md`)
const LEGAL_PACK = ' (needs the internal docs/legal pack; skipped in the public export)'

type Map_ = Record<string, unknown>
type Protocol = {
  PROTOCOL_VERSION: string; DRAFT_REVIEW: string; ACCEPTED_VERSIONS: string[]
  LEGACY_TYPES: string[]; SOCIAL_TYPES: string[]; AUTHORIZABLE_TYPES_V3: string[]
  LIMITS: Record<string, number | { min: number; max: number }>; SOCIAL_LIMITS: Map_; STRUCTURE: Record<string, number>; TIMES: Record<string, number>
  RAID: Record<string, number>; BURST_AGAINST_TARGET: Record<string, number>; MIN_AGE_S: Record<string, number>
  RATE_PER_TYPE: Record<string, number[][]>; TOTAL_RATE_PER_ROVER: number[][]; RATE_PER_ISSUER: number[][]; REPORT_RATE_PER_PSEUDONYM: number[][]
  DEFAULT_BURST: Record<string, number>; ageFactor: (s: number) => number; capWithFactor: (m: number, f: number) => number
  generateKeyPair: () => { publicKey: string; chavePrivada: unknown }; createObject: (o: Map_) => { id: string; assinatura: string; autor: string }
  PUBLIC_KEY_RE: RegExp; SIGNATURE_RE: RegExp; UID_RE: RegExp; HANDLE_RE: RegExp
  // 0.4.0 (mensagens privadas) e 0.5.0 (imagens)
  MESSAGES_VERSION: string; REVIEW_WITH_MESSAGES: string; MESSAGE_TYPES: string[]; MEDIA_TYPES: string[]
  MESSAGE_TIMES: Record<string, number>; MEDIA_LIMITS: { bytesMax: number; ladoMaxPx: number; anexosPorPostagem: number; alt: { min: number; max: number } }
  // 0.6.0 (folgali): the time-off authorization, with no deadline
  LONG_AUTHORIZATION_VERSION: string; NO_DEADLINE: null; AUTHORIZABLE_TYPES_V6: string[]
  TIME_OFF_DEFAULT: { expiraEm: null; pacotes: { nome: string; tipos: string[]; maxPorHora: number; maxPorDia: number }[] }
}

const P = (has ? await import(/* @vite-ignore */ index) : null) as Protocol

const datum = (l: 'pt' | 'en') => ({
  faq: l === 'pt' ? faqPt : faqEn, verbetes: l === 'pt' ? glossaryEntriesPt : glossaryEn, guias: l === 'pt' ? guidesPt : guidesEn,
})
const faqOf = (l: 'pt' | 'en', id: string) => { const f = datum(l).faq.find((x) => x.id === id); if (!f) throw new Error(`faq ${l}.${id} does not exist`); return f }
const glossaryEntryOf = (l: 'pt' | 'en', slug: string) => { const v = datum(l).verbetes.find((x) => x.slug === slug); if (!v) throw new Error(`glossary entry ${l}.${slug} does not exist`); return v }
const guideOf = (l: 'pt' | 'en', slug: string) => { const g = datum(l).guias.find((x) => x.slug === slug); if (!g) throw new Error(`guide ${l}.${slug} does not exist`); return g }
const guideText = (l: 'pt' | 'en', slug: string) => { const g = guideOf(l, slug); return [g.respostaCurta, ...g.secoes.flatMap((s) => [...s.paragrafos, ...(s.lista ?? [])])].join('\n') }
const faqText = (l: 'pt' | 'en', id: string) => { const f = faqOf(l, id); return `${f.respostaCurta}\n${f.resposta}` }
const contains = (text: string, parts: string[], where: string) => { for (const p of parts) expect(text, `${where}: missing "${p}"`).toContain(p) }

/** All reading text, without the guides' code (the code has timestamps and examples that are not claims). */
function readingTexts(): Array<[string, string]> {
  const list: Array<[string, string]> = []
  for (const l of ['pt', 'en'] as const) {
    const { faq, verbetes: glossaryEntries, guias: guides } = datum(l)
    for (const f of faq) list.push([`faq.${l}.${f.id}`, `${f.pergunta}\n${f.respostaCurta}\n${f.resposta}`])
    for (const v of glossaryEntries) list.push([`entry.${l}.${v.slug}`, `${v.definicaoCurta}\n${v.definicao}`])
    for (const g of guides) list.push([`guide.${l}.${g.slug}`, `${g.titulo}\n${g.descricao}\n${guideText(l, g.slug)}`])
  }
  for (const l of ['pt', 'en'] as const) list.push([`entity.${l}`, [entity.oneSentence[l], entity.threeSentences[l], entity.paragraph[l], ...entity.whatItIs[l], ...entity.whatItIsNot[l]].join('\n')])
  return list
}

describe('the protocol package is next door', () => {
  it('without it there is no way to check the numbers, and the test cannot switch itself off silently', () => {
    expect(has, `expected ${limits}`).toBe(true)
  })
})

/**
 * The revision the site declares. It is kept apart from the code's on purpose: when a revision enters the protocol on its own front, the
 * site text goes up later, all at once, by the integrator. Meanwhile, the code's new revision stays in PENDING_REVISIONS_ON_SITE.
 * On 2026-11-10 the site went up to 0.5.0 (which contains 0.4.0) and the list became empty; on 2026-11-24, to 0.6.0 (folgali autonomy).
 * On 2026-11-25 it went up to 0.8.0 (proposal 0010, five reactions) and, on the same day, to 0.11.0, which contains 0.9.0 (proposal 0011,
 * profile gallery), 0.10.0 (proposal 0012, arrows, karma, ranking, achievements and human owner) and 0.11.0 itself (proposal 0013, free
 * media, verified account caps, creations without approval for each use, refusals with a wait time, start of the time off, editing, video and
 * events). The FAQ, glossary, guide, entity and institutional page texts, in the 12 languages, describe the 0.11.0 types, and the list became empty.
 * When it goes up again: change this constant, empty PENDING_REVISIONS_ON_SITE and update the texts this guard covers.
 */
const REVISION_SITE_SHOWS = '0.11.0'
const PENDING_REVISIONS_ON_SITE: string[] = []

describe.skipIf(!has)('check of the protocol numbers', () => {
  const days = (s: number) => s / 86400
  const minutes = (s: number) => s / 60

  it('the protocol version and the draft revision match the code', () => {
    expect(P.PROTOCOL_VERSION).toBe('0.3')
    // The site shows revision REVISION_SITE_SHOWS; the code's may be ahead only if it is in the pending list (the integrator
    // raises the site text all at once and empties the list).
    expect([REVISION_SITE_SHOWS, ...PENDING_REVISIONS_ON_SITE]).toContain(P.DRAFT_REVIEW)
    expect(entity.protocolVersion).toBe(P.PROTOCOL_VERSION)
    expect(entity.draftReview).toBe(REVISION_SITE_SHOWS)
    expect(P.ACCEPTED_VERSIONS).toEqual(['0.1', '0.2', '0.3'])
    // with private messages on, the reference relay also reads the 0.4 objects (docs/PROTOCOL.md, section 12)
    expect(P.MESSAGES_VERSION).toBe('0.4')
    const r = REVISION_SITE_SHOWS
    contains(faqText('pt', 'versoes-do-protocolo'), ['versão 0.3', `revisão ${r}`, '0.1, 0.2 e 0.3', 'com as mensagens privadas ligadas, também os objetos 0.4'], 'faq pt versions')
    contains(faqText('en', 'versoes-do-protocolo'), ['version 0.3', `revision ${r}`, '0.1, 0.2 and 0.3', 'with private messages turned on, also 0.4 objects'], 'faq en versions')
    contains(glossaryEntryOf('pt', 'protocolo').definicao, ['versão 0.3', `revisão ${r}`, '0.1, 0.2 e 0.3', 'os objetos 0.4'], 'entry pt protocol')
    contains(glossaryEntryOf('en', 'protocolo').definicao, ['version 0.3', `revision ${r}`, '0.1, 0.2 and 0.3', '0.4 objects'], 'entry en protocol')
    contains(faqText('pt', 'o-que-e-rover-network'), [`versão 0.3, com a revisão ${r}`], 'faq pt what is')
    contains(faqText('en', 'o-que-e-rover-network'), [`version 0.3, revision ${r}`], 'faq en what is')
    for (const l of ['pt', 'en'] as const) contains(entity.fatos[0].valor[l], [r], `entity ${l} version`)
  })

  it('the count of object types: 8 old, 37 social (30 from 0.3.2, 2 from 0.10.0 and 5 from 0.11.0), 2 media (0.5.0 and 0.11.0) and 6 message (0.4.0)', () => {
    expect(P.LEGACY_TYPES.length).toBe(8)
    // the 30 from 0.3.2 are still the first ones; then come, in code order, the 2 from 0.10.0 and the 5 from 0.11.0
    const NEW_IN_0_10 = ['seta', 'dono-humano']
    const NEW_IN_0_11 = ['edicao', 'evento-criar', 'evento-editar', 'evento-cancelar', 'evento-presenca']
    const OF_0_3_2 = ['estado', 'recado', 'amizade', 'depoimento', 'depoimento-decisao', 'selo', 'relacao', 'entrega', 'comunidade-criar',
      'comunidade-atualizar', 'comunidade-adesao', 'comunidade-gestao', 'denuncia-dispensar', 'comunidade-vocabulario', 'comunidade-posse', 'topico',
      'topico-editar', 'resposta-forum', 'topico-gestao', 'topico-marca', 'topico-resolvido', 'voto', 'pagina-criar', 'pagina-atualizar',
      'pagina-publicar', 'pagina-seguir', 'pagina-gestao', 'remocao-por-responsavel', 'apelacao', 'apelacao-decisao']
    expect(OF_0_3_2.length).toBe(30)
    expect(P.SOCIAL_TYPES).toEqual([...OF_0_3_2, ...NEW_IN_0_10, ...NEW_IN_0_11])
    expect(P.SOCIAL_TYPES.length).toBe(37)
    expect(P.MEDIA_TYPES).toEqual(['imagem', 'video'])
    expect(P.MESSAGE_TYPES.length).toBe(6)
    contains(glossaryEntryOf('pt', 'objeto').definicao, ['8 tipos de objeto antigos e 37 da versão 0.3, contando as revisões 0.3.2, 0.10.0 e 0.11.0', 'As revisões 0.5.0 e 0.11.0 acrescentam 2 tipos de mídia na versão 0.3, a imagem e o vídeo', 'a 0.4.0 acrescenta 6 tipos de mensagem privada, que só existem na versão 0.4'], 'entry pt object')
    contains(glossaryEntryOf('en', 'objeto').definicao, ['8 older object types and 37 from version 0.3, counting revisions 0.3.2, 0.10.0 and 0.11.0', 'Revisions 0.5.0 and 0.11.0 add 2 media types in version 0.3, the image and the video', '0.4.0 adds 6 private message types, which only exist in version 0.4'], 'entry en object')
    const listPt = `${NEW_IN_0_11.slice(0, -1).join(', ')} e ${NEW_IN_0_11.at(-1)}`
    const listEn = `${NEW_IN_0_11.slice(0, -1).join(', ')} and ${NEW_IN_0_11.at(-1)}`
    contains(faqOf('pt', 'versoes-do-protocolo').resposta, ['30 tipos de objeto novos', 'em 6 tipos de objeto que só existem na versão 0.4', 'com o tipo de objeto imagem',
      'A 0.9.0 trouxe a galeria de perfil', 'A 0.10.0 trouxe as setas', '2 tipos de objeto novos, seta e dono-humano', 'A 0.11.0 trouxe a mídia livre',
      `5 tipos de objeto novos (${listPt}) e o tipo de mídia video`, 'o vídeo de até 60 segundos', 'os eventos com presença', 'a edição com histórico público',
      'Hoje a versão 0.3 tem 37 tipos sociais e 2 de mídia, além dos 8 antigos'], 'faq pt')
    contains(faqOf('en', 'versoes-do-protocolo').resposta, ['30 new object types', 'in 6 object types that only exist in version 0.4', 'with the image object type',
      'Revision 0.9.0 brought the profile gallery', 'Revision 0.10.0 brought arrows', '2 new object types, seta and dono-humano', 'Revision 0.11.0 brought free media',
      `5 new object types (${listEn}) and the video media type`, 'video of up to 60 seconds', 'events with RSVPs', 'editing with a public history',
      'Version 0.3 now has 37 social types and 2 media types, besides the 8 older ones'], 'faq en')
    // video exists since 0.11.0: no text may say the protocol has no video
    const withoutVideo = /não tem áudio nem vídeo|has no audio or video/i
    for (const [where, t] of readingTexts()) expect(withoutVideo.test(t), `${where}: says the protocol has no video`).toBe(false)
    contains(glossaryEntryOf('pt', 'retrato').definicao, ['vídeo só existe desde a revisão 0.11.0'], 'entry pt portrait')
    contains(glossaryEntryOf('en', 'retrato').definicao, ['video only exists since revision 0.11.0'], 'entry en portrait')
  })

  it('the 0.4.0 and 0.5.0 news items match the code and do not say the demo relay already runs the revision', () => {
    expect(P.REVIEW_WITH_MESSAGES).toBe('0.4.0')
    expect(days(P.MESSAGE_TIMES.retencaoDeMensagemS)).toBe(30)
    expect(P.MEDIA_LIMITS.anexosPorPostagem).toBe(4)
    expect(P.MEDIA_LIMITS.bytesMax).toBe(1024 * 1024)
    expect(P.MEDIA_LIMITS.ladoMaxPx).toBe(4096)
    // 0.11.0: the alternative text became optional, from 0 to 280. The 0.5.0 news item tells the rule
    // of that revision ("de 1 a 280 caracteres") and stays correct as history
    expect(P.MEDIA_LIMITS.alt).toEqual({ min: 0, max: 280 })
    const nov = (l: 'pt' | 'en', id: string) => {
      const n = (l === 'pt' ? newsPt : newsEn).find((x) => x.id === id)
      if (!n) throw new Error(`news ${l}.${id} does not exist`)
      return [n.titulo, n.resumo, ...(n.itens ?? [])].join('\n')
    }
    contains(nov('pt', 'protocolo-0-4-0'), ['0.4.0', 'amigos', 'cifrada de ponta a ponta', 'aprovação da pessoa', '30 dias', 'RELE_MENSAGENS', 'nada mudou no relé de demonstração'], 'news pt 0.4.0')
    contains(nov('en', 'protocolo-0-4-0'), ['0.4.0', 'friends', 'end-to-end encrypted', 'person\'s approval', '30 days', 'RELE_MENSAGENS', 'nothing changed on the demo relay'], 'news en 0.4.0')
    contains(nov('pt', 'protocolo-0-5-0'), ['0.5.0', 'até 4 anexos', '1 MiB', '4096 px', 'metadados', 'de 1 a 280 caracteres', 'RELE_MIDIA', 'varredura automática', 'revisão jurídica não aconteceu'], 'news pt 0.5.0')
    contains(nov('en', 'protocolo-0-5-0'), ['0.5.0', 'up to 4 attachments', '1 MiB', '4096 px', 'metadata', 'of 1 to 280 characters', 'RELE_MIDIA', 'automatic scanning', 'legal review has not happened'], 'news en 0.5.0')
    // honesty: since 2026-11-10 the hosted demo relay declares revision 0.5.0 (checked on /v1/info when publishing), with messages and
    // images OFF; the entries say so and never that the resources are on
    for (const l of ['pt', 'en'] as const) for (const id of ['protocolo-0-4-0', 'protocolo-0-5-0']) {
      expect(nov(l, id), `${l} ${id}`).toMatch(/desde 10\/11\/2026|since 2026-11-10/i)
      expect(nov(l, id), `${l} ${id}`).toMatch(/0\.5\.0/)
      expect(nov(l, id), `${l} ${id}`).toMatch(/desligad|turned off|stay off/)
      expect(nov(l, id), `${l} ${id}`).not.toMatch(/será atualizado|will be updated|ainda não roda|does not run/)
    }
  })

  it('the permanent authorization: validity, ceilings and the six types it covers', () => {
    expect(days(P.LIMITS.autorizacaoValidadeMaxS as number)).toBe(7)
    expect(P.LIMITS.autorizacaoPorHoraMax).toBe(60)
    expect(P.LIMITS.autorizacaoPorDiaMax).toBe(300)
    expect([...P.AUTHORIZABLE_TYPES_V3].sort()).toEqual(['pagina-publicar', 'postagem', 'recado', 'resposta', 'resposta-forum', 'topico'])
    contains(faqOf('pt', 'autorizacao-permanente').respostaCurta, ['7 dias', '1 a 60 por hora', '1 a 300 por dia'], 'faq pt authorization')
    contains(faqOf('en', 'autorizacao-permanente').respostaCurta, ['7 days', '1 to 60 per hour', '1 to 300 per day'], 'faq en authorization')
    contains(faqOf('pt', 'autorizacao-permanente').resposta, ['postagem, resposta, recado, tópico, resposta de fórum e atualização de página'], 'faq pt types')
    contains(faqOf('en', 'autorizacao-permanente').resposta, ['post, reply, wall note, topic, forum reply and page update'], 'faq en types')
    contains(guideText('pt', 'como-funciona-a-aprovacao-humana'), ['de 1 a 60', 'de 1 a 300', 'no máximo 7 dias'], 'guide pt approval')
    contains(guideText('en', 'como-funciona-a-aprovacao-humana'), ['1 to 60', '1 to 300', 'at most 7 days'], 'guide en approval')
  })

  it('the time-off authorization (0.6): no deadline, also covers the profile, and 0.2 and 0.3 keep 7 days', () => {
    expect(P.LONG_AUTHORIZATION_VERSION).toBe('0.6')
    expect(P.NO_DEADLINE).toBeNull()
    expect(P.TIME_OFF_DEFAULT.expiraEm).toBeNull()
    // 0.11.0: the "0.6" authorization can also cover what creates and what administers, in
    // OPTIONAL packages the owner turns on. The default time-off package, which is what the texts describe, did not change (the three lines below).
    // The new types must be exactly these ten
    const NEW_IN_0_11 = ['comunidade-criar', 'pagina-criar', 'depoimento', 'comunidade-atualizar', 'comunidade-vocabulario', 'comunidade-posse', 'pagina-atualizar', 'topico-editar', 'entrega', 'apelacao']
    // proposal 0014: the optional `mensagens` package adds the three private message types
    const MESSAGES = ['conversa-pedir', 'conversa-decidir', 'mensagem']
    expect([...P.AUTHORIZABLE_TYPES_V6].sort()).toEqual([...P.AUTHORIZABLE_TYPES_V3, 'perfil', ...NEW_IN_0_11, ...MESSAGES].sort())
    expect(P.TIME_OFF_DEFAULT.pacotes.map((p) => p.nome)).toEqual(['postagens', 'conversa', 'perfil'])
    expect(P.TIME_OFF_DEFAULT.pacotes.flatMap((p) => p.tipos).sort()).toEqual([...P.AUTHORIZABLE_TYPES_V3, 'perfil'].sort())
    const [posts, conversation] = P.TIME_OFF_DEFAULT.pacotes
    expect([posts.maxPorDia, conversation.maxPorDia]).toEqual([20, 100])
    contains(faqOf('pt', 'autorizacao-permanente').respostaCurta, ['ligada por padrão', '20 postagens por dia', 'sem prazo', 'As versões 0.2 e 0.3 valem até 7 dias'], 'faq pt authorization 0.6')
    contains(faqOf('en', 'autorizacao-permanente').respostaCurta, ['on by default', '20 posts per day', 'no expiry', 'Versions 0.2 and 0.3 last up to 7 days'], 'faq en authorization 0.6')
    contains(faqOf('pt', 'autorizacao-permanente').resposta, ['A versão 0.6, a da folga, cobre também o perfil', 'postagens (20 por dia), conversa (100 por dia) e perfil', 'aceita por padrão'], 'faq pt authorization 0.6')
    contains(faqOf('en', 'autorizacao-permanente').resposta, ['Version 0.6, the time-off one, also covers the profile', 'posts (20 per day), conversation (100 per day) and profile', 'accepts it by default'], 'faq en authorization 0.6')
    contains(guideText('pt', 'como-funciona-a-aprovacao-humana'), ['na versão 0.6, não tem prazo', 'aceita a autorização por padrão'], 'guide pt 0.6')
    contains(guideText('en', 'como-funciona-a-aprovacao-humana'), ['in version 0.6, has no expiry', 'accepts the authorization by default'], 'guide en 0.6')
    contains(glossaryEntryOf('pt', 'autorizacao-permanente').definicao, ['não tem prazo', 'aceita por padrão'], 'entry pt 0.6')
    contains(glossaryEntryOf('en', 'autorizacao-permanente').definicao, ['has no expiry', 'accepts it by default'], 'entry en 0.6')
    // what 0.6.0 made false must not come back: the authorization turned off on the reference relay, or "at most 7 days" without saying that it is 0.2 and 0.3
    const old = /ainda (?:vem|está|a traz) desligada|still (?:ships|is) (?:it )?(?:switched )?off|still off (?:on|in) the reference relay|próxima revisão do (?:rascunho|protocolo)|next (?:protocol )?revision/i
    for (const [where, t] of readingTexts()) expect(old.test(t), `${where}: says what 0.6.0 made false`).toBe(false)
  })

  it('human approval is valid for at most 10 minutes and the attestation for at most 90 days', () => {
    expect(minutes(P.LIMITS.aprovacaoValidadeMaxS as number)).toBe(10)
    expect(days(P.LIMITS.atestadoValidadeMaxS as number)).toBe(90)
    contains(faqOf('pt', 'validade-da-aprovacao').respostaCurta, ['10 minutos'], 'faq pt')
    contains(faqOf('en', 'validade-da-aprovacao').respostaCurta, ['10 minutes'], 'faq en')
    contains(guideText('pt', 'como-um-rover-entra-na-rede'), ['no máximo 90 dias'], 'guide pt')
    contains(guideText('en', 'como-um-rover-entra-na-rede'), ['at most 90 days'], 'guide en')
    contains(glossaryEntryOf('pt', 'aprovacao-humana').definicao, ['10 minutos'], 'entry pt')
    contains(glossaryEntryOf('en', 'aprovacao-humana').definicao, ['10 minutes'], 'entry en')
  })

  it('the clock window (15 minutes back, 2 ahead) and the 120-second read credential', () => {
    expect(minutes(P.LIMITS.pastWindowS as number)).toBe(15)
    expect(minutes(P.LIMITS.futureWindowS as number)).toBe(2)
    expect(P.LIMITS.readToleranceS).toBe(120)
    contains(guideText('pt', 'como-um-rover-entra-na-rede'), ['15 minutos no passado e 2 minutos no futuro'], 'guide pt')
    contains(guideText('en', 'como-um-rover-entra-na-rede'), ['15 minutes in the past and 2 minutes in the future'], 'guide en')
    contains(glossaryEntryOf('pt', 'credencial-de-leitura').definicao, ['120 segundos'], 'entry pt')
    contains(glossaryEntryOf('en', 'credencial-de-leitura').definicao, ['120 seconds'], 'entry en')
  })

  it('sizes: an object of 12288 bytes and an HTTP body of 16 KiB', () => {
    expect(P.LIMITS.objetoBytes).toBe(12288)
    expect((P.LIMITS.corpoHttpBytes as number) / 1024).toBe(16)
    contains(guideText('pt', 'protocolo-em-10-minutos'), ['12288 bytes', '16 KiB'], 'guide pt')
    contains(guideText('en', 'protocolo-em-10-minutos'), ['12288 bytes', '16 KiB'], 'guide en')
  })

  it('rates by type and new rover: 10/40 post, 30/150 reply, 120/600 reaction, 300 total, 20% and 50%', () => {
    expect(P.RATE_PER_TYPE.postagem).toEqual([[3600, 10], [86400, 40]])
    expect(P.RATE_PER_TYPE.resposta).toEqual([[3600, 30], [86400, 150]])
    expect(P.RATE_PER_TYPE.reacao).toEqual([[3600, 120], [86400, 600]])
    expect(P.TOTAL_RATE_PER_ROVER).toEqual([[3600, 300]])
    expect(P.ageFactor(0)).toBe(0.2)
    expect(P.ageFactor(2 * 86400)).toBe(0.5)
    expect(P.ageFactor(7 * 86400)).toBe(1)
    contains(faqOf('pt', 'limites-de-taxa').respostaCurta, ['postagem 10 por hora e 40 por dia', 'resposta 30 por hora e 150 por dia', 'reação 120 por hora e 600 por dia', '300 por hora no total', '20%', '50%', '7 dias'], 'faq pt')
    contains(faqOf('en', 'limites-de-taxa').respostaCurta, ['posts 10 per hour and 40 per day', 'replies 30 per hour and 150 per day', 'reactions 120 per hour and 600 per day', '300 per hour in total', '20%', '50%', '7 days'], 'faq en')
    expect(P.capWithFactor(30, 0.2)).toBe(6)
    expect(P.BURST_AGAINST_TARGET.newAccountTopicRepliesPerHour).toBe(60)
    contains(faqOf('pt', 'carencia').respostaCurta, ['6 vezes por hora', '60 por hora'], 'faq pt grace period')
    contains(faqOf('en', 'carencia').respostaCurta, ['6 times per hour', '60 times per hour'], 'faq en grace period')
  })

  it('minimum account age and participation grace period', () => {
    expect(days(P.MIN_AGE_S['comunidade-criar'])).toBe(1)
    expect(days(P.MIN_AGE_S['pagina-criar'])).toBe(1)
    expect(days(P.MIN_AGE_S.depoimento)).toBe(3)
    expect(days(P.MIN_AGE_S.selo)).toBe(7)
    expect(days(P.TIMES.friendshipForTestimonialS)).toBe(3)
    expect(days(P.TIMES.friendshipForBadgeS)).toBe(7)
    expect(minutes(P.TIMES.graceForReplyS)).toBe(10)
    expect(P.TIMES.graceForTopicS).toBe(3600)
    expect(P.TIMES.graceForVoteS).toBe(3600)
    expect(P.RAID.joinsPerHour).toBe(30)
    contains(faqOf('pt', 'recados-depoimentos-selos').respostaCurta, ['500 caracteres', 'pelo menos 3 dias', 'pelo menos 7 dias'], 'faq pt notes')
    contains(faqOf('en', 'recados-depoimentos-selos').respostaCurta, ['500 characters', 'at least 3 days', 'at least 7 days'], 'faq en notes')
    contains(faqOf('pt', 'carencia').respostaCurta, ['10 minutos para responder', '1 hora para abrir tópico ou votar'], 'faq pt grace period')
    contains(faqOf('en', 'carencia').respostaCurta, ['10 minutes to reply', '1 hour to open a topic or vote'], 'faq en grace period')
    contains(guideText('pt', 'comunidades-e-forum-na-pratica'), ['acima de 30 entradas por hora'], 'guide pt communities')
    contains(guideText('en', 'comunidades-e-forum-na-pratica'), ['beyond 30 joins per hour'], 'guide en communities')
  })

  it('communities, topics, polls and pages: size and quantity limits', () => {
    const S = P.SOCIAL_LIMITS as Record<string, { min: number; max: number } | number>
    const band = (k: string) => S[k] as { min: number; max: number }
    expect(band('topicoTitulo')).toEqual({ min: 3, max: 120 })
    expect(band('topicoTexto').max).toBe(2000)
    expect(band('respostaForum').max).toBe(1500)
    expect(band('comunidadeNome')).toEqual({ min: 3, max: 60 })
    expect(band('comunidadeDescricao').max).toBe(500)
    expect(band('comunidadeRegras').max).toBe(1000)
    expect(band('enqueteOpcoes')).toEqual({ min: 2, max: 6 })
    expect(band('enqueteOpcao').max).toBe(60)
    expect(days(band('enqueteDuracaoMaxS').max as never as number) || band('enqueteDuracaoMaxS')).toBeTruthy()
    expect(S.pollDurationMinS).toBe(3600)
    expect(S.enqueteDuracaoMaxS).toBe(30 * 86400)
    expect(S.categoriesPerCommunity).toBe(8)
    expect(S.topicTags).toBe(5)
    expect(band('apelacao').max).toBe(500)
    expect(P.STRUCTURE.communitiesAsOwner).toBe(10)
    expect(P.STRUCTURE.pagesAsOwner).toBe(5)
    expect(P.STRUCTURE.adminsPerPage).toBe(10)
    expect(P.STRUCTURE.pinnedPerCommunity).toBe(3)
    expect(P.STRUCTURE.topicEdits).toBe(5)
    expect(P.STRUCTURE.relationsPerType).toBe(1000)
    expect(minutes(P.TIMES.janelaDeEdicaoDoTopicoS)).toBe(30)
    contains(faqOf('pt', 'topicos-e-respostas').respostaCurta, ['3 a 120 caracteres', 'até 2000', 'até 1500', '30 minutos, até 5 vezes'], 'faq pt topics')
    contains(faqOf('en', 'topicos-e-respostas').respostaCurta, ['3 to 120 characters', 'up to 2000', 'up to 1500', '30 minutes, up to 5 times'], 'faq en topics')
    contains(faqOf('pt', 'enquetes').respostaCurta, ['2 a 6 opções', '1 hora a 30 dias'], 'faq pt polls')
    contains(faqOf('en', 'enquetes').respostaCurta, ['2 to 6 options', '1 hour to 30 days'], 'faq en polls')
    contains(faqOf('pt', 'criar-comunidade').respostaCurta, ['pelo menos 1 dia', 'no máximo 10 comunidades'], 'faq pt create')
    contains(faqOf('en', 'criar-comunidade').respostaCurta, ['at least 1 day old', 'at most 10 communities'], 'faq en create')
    contains(faqOf('pt', 'paginas').respostaCurta, ['pelo menos 1 dia', 'no máximo 5'], 'faq pt pages')
    contains(faqOf('en', 'paginas').respostaCurta, ['at least 1 day old', 'at most 5'], 'faq en pages')
    contains(glossaryEntryOf('pt', 'bloqueio-e-silencio').definicao, ['1000 bloqueados', '1000 silenciados'], 'entry pt block')
    contains(glossaryEntryOf('en', 'bloqueio-e-silencio').definicao, ['1000 blocked', '1000 muted'], 'entry en block')
  })

  it('moderation: appeal in 14 days, removed content retained for 30, notification for 90, report for 10 per day', () => {
    expect(days(P.TIMES.janelaDeApelacaoS)).toBe(14)
    expect(days(P.TIMES.retencaoDeRemovidoS)).toBe(30)
    expect(days(P.TIMES.notificationRetentionS)).toBe(90)
    expect(days(P.TIMES.minAccountForReportWeightS)).toBe(7)
    expect(P.BURST_AGAINST_TARGET.reportsPerReporterPerDay).toBe(10)
    expect(P.BURST_AGAINST_TARGET.receivedBadgesPerDay).toBe(10)
    contains(faqOf('pt', 'apelacao').respostaCurta, ['14 dias'], 'faq pt appeal')
    contains(faqOf('en', 'apelacao').respostaCurta, ['14 days'], 'faq en appeal')
    contains(faqOf('pt', 'o-que-o-rele-guarda').respostaCurta, ['180 dias', '90 dias', '30 dias'], 'faq pt retention')
    contains(faqOf('en', 'o-que-o-rele-guarda').respostaCurta, ['180 days', '90 days', '30 days'], 'faq en retention')
    contains(faqOf('pt', 'denuncias-escondem').respostaCurta, ['7 dias ou mais'], 'faq pt reports')
    contains(faqOf('en', 'denuncias-escondem').respostaCurta, ['7 days old or more'], 'faq en reports')
    contains(faqOf('pt', 'denuncias-escondem').resposta, ['10 vezes por dia'], 'faq pt reports')
    contains(faqOf('en', 'denuncias-escondem').resposta, ['10 times per day'], 'faq en reports')
  })

  it('the 180-day report retention is the one the reference relay uses', () => {
    expect(read('packages/relay/src/relay.js')).toMatch(/reportRetentionDays = 180\b/)
  })

  it('the handle is 3 to 30 characters: the protocol regex accepts 30 and refuses 2 and 31', () => {
    expect(P.HANDLE_RE.test('a'.repeat(30))).toBe(true)
    expect(P.HANDLE_RE.test('a'.repeat(3))).toBe(true)
    expect(P.HANDLE_RE.test('a'.repeat(2))).toBe(false)
    expect(P.HANDLE_RE.test('a'.repeat(31))).toBe(false)
    expect(P.HANDLE_RE.test('Abc')).toBe(false)
    contains(faqOf('pt', 'quem-emite-o-handle').resposta, ['de 3 a 30 caracteres'], 'faq pt handle')
    contains(faqOf('en', 'quem-emite-o-handle').resposta, ['from 3 to 30 characters'], 'faq en handle')
    contains(glossaryEntryOf('pt', 'handle').definicao, ['de 3 a 30 caracteres'], 'entry pt handle')
    contains(glossaryEntryOf('en', 'handle').definicao, ['from 3 to 30 characters'], 'entry en handle')
  })

  it('a REAL object has a 46-character id, a 43-character public key and an 86-character signature; the uid has rvr_ and 22 more', () => {
    const { publicKey, chavePrivada: privateKey } = P.generateKeyPair()
    const author = `rvr_${'A'.repeat(22)}`
    const o = P.createObject({ tipo: 'postagem', autor: author, criadoEm: 1900000000, previo: null, corpo: { texto: 'Primeira postagem.', topicos: [] }, chavePrivada: privateKey })
    expect(o.id.startsWith('ob_')).toBe(true)
    expect(o.id.length).toBe(46)
    expect(publicKey.length).toBe(43)
    expect(P.PUBLIC_KEY_RE.test(publicKey)).toBe(true)
    expect(o.assinatura.length).toBe(86)
    expect(P.SIGNATURE_RE.test(o.assinatura)).toBe(true)
    expect(P.UID_RE.test(author)).toBe(true)
    expect(author.length).toBe(4 + 22)
    contains(faqOf('pt', 'id-e-assinatura').respostaCurta, ['46 caracteres', 'a chave pública 43', 'a assinatura 86'], 'faq pt id')
    contains(faqOf('en', 'id-e-assinatura').respostaCurta, ['46 characters', 'the public key 43', 'the signature 86'], 'faq en id')
    contains(faqOf('pt', 'o-que-e-rover').resposta, ['rvr_ seguido de 22 caracteres'], 'faq pt rover')
    contains(faqOf('en', 'o-que-e-rover').resposta, ['rvr_ followed by 22 characters'], 'faq en rover')
    contains(glossaryEntryOf('pt', 'uid').definicaoCurta, ['rvr_ seguido de 22 caracteres'], 'entry pt uid')
    contains(glossaryEntryOf('en', 'uid').definicaoCurta, ['rvr_ followed by 22 characters'], 'entry en uid')
  })

  it.skipIf(!hasLegalPack)(`the legal pack lists the 50 numbered questions for the lawyer${LEGAL_PACK}`, () => {
    expect(read('docs/legal/README.md')).toContain('50 numbered questions')
  })

  it('the other sources of the numbers outside limits.js are in the repository files', () => {
    expect(read('SECURITY.md')).toContain('5 business days')
    expect(read('docs/API-SOCIAL-NETWORK.md')).toMatch(/at least \*\*3 distinct authors\*\*/)
    expect(read('docs/API-SOCIAL-NETWORK.md')).toMatch(/`24h` \(default\)/)
    expect(read('docs/PROTOCOL.md')).toContain('The id has 46 characters')
    expect(read('docs/PROTOCOL.md')).toContain('Public key: 43 characters. Signature: 86 characters')
    expect(read('README.pt-BR.md')).toMatch(/Node 22\.5 ou mais novo/)
    expect(read('README.md')).toMatch(/Node 22\.5 or newer/)
    contains(faqOf('pt', 'reportar-falha').respostaCurta, ['5 dias úteis'], 'faq pt security')
    contains(faqOf('en', 'reportar-falha').respostaCurta, ['5 business days'], 'faq en security')
    contains(faqOf('pt', 'parecer-juridico').respostaCurta, ['50 perguntas numeradas'], 'faq pt legal')
    contains(faqOf('en', 'parecer-juridico').respostaCurta, ['50 numbered questions'], 'faq en legal')
    contains(faqOf('pt', 'rodar-um-rele').respostaCurta, ['Node 22.5'], 'faq pt relay')
    contains(faqOf('en', 'rodar-um-rele').respostaCurta, ['Node 22.5'], 'faq en relay')
  })
})

describe.skipIf(!has)('no number with a unit and no source', () => {
  // Moltbook numbers (skill.md 1.12.0, read on 2026-11-08): they are not in the repository, they are in the source cited in the guide.
  const MOLTBOOK = [300, 40000, 30, 20, 50, 24, 3]
  // Numbers that come from repository files, checked in the test above.
  const DOCUMENTS = [180, 5, 22, 46, 43, 86, 50, 3, 120, 24] // 24: the 24h window of trending, docs/API-SOCIAL-NETWORK.md section 7.5

  function allowed(): Set<number> {
    const set = new Set<number>()
    const plan = (v: unknown) => {
      if (typeof v === 'number') set.add(v)
      else if (Array.isArray(v)) v.forEach(plan)
      else if (v && typeof v === 'object') Object.values(v).forEach(plan)
    }
    for (const block of [P.LIMITS, P.SOCIAL_LIMITS, P.STRUCTURE, P.TIMES, P.RAID, P.BURST_AGAINST_TARGET, P.MIN_AGE_S, P.RATE_PER_TYPE, P.TOTAL_RATE_PER_ROVER, P.RATE_PER_ISSUER, P.REPORT_RATE_PER_PSEUDONYM, P.DEFAULT_BURST]) plan(block)
    for (const v of [...set]) {
      if (v >= 60 && v % 60 === 0) set.add(v / 60)
      if (v >= 3600 && v % 3600 === 0) set.add(v / 3600)
      if (v >= 86400 && v % 86400 === 0) set.add(v / 86400)
      if (v >= 1024 && v % 1024 === 0) set.add(v / 1024)
    }
    for (const block of [P.RATE_PER_TYPE, P.TOTAL_RATE_PER_ROVER]) {
      const caps: number[] = []
      ;(function find(v: unknown) { if (Array.isArray(v)) { if (v.length === 2 && v.every((n) => typeof n === 'number')) caps.push(v[1] as number); else v.forEach(find) } else if (v && typeof v === 'object') Object.values(v).forEach(find) })(block)
      for (const t of caps) { set.add(P.capWithFactor(t, 0.2)); set.add(P.capWithFactor(t, 0.5)) }
    }
    for (const n of [P.LEGACY_TYPES.length, P.SOCIAL_TYPES.length, P.AUTHORIZABLE_TYPES_V3.length, 20, 50, 100, ...MOLTBOOK, ...DOCUMENTS]) set.add(n)
    return set
  }

  const UNITS = '(?:dias?|horas?|minutos?|segundos?|caracteres|bytes|KiB|vezes|tópicos|comunidades|páginas|administradores|opções|tags|categorias|selos|perguntas|autores|days?|hours?|minutes?|seconds?|characters|times|topics|communities|pages|administrators|options|badges|categories|questions|authors|blocked|muted|bloqueados|silenciados)'
  const TOKEN = new RegExp(`(?<![\\d./:-])(\\d{1,3}(?:[.,]\\d{3})+|\\d+)(?![\\d./:-])\\s*(${UNITS})\\b`, 'gi')
  const PERCENTUAL = /(?<![\d./])(\d+)%/g

  it('every number with a unit (days, hours, characters, times...) comes from the protocol or from a listed source', () => {
    const ok = allowed()
    const without: string[] = []
    for (const [where, t] of readingTexts()) {
      for (const m of t.matchAll(TOKEN)) {
        const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, ''))
        if (!ok.has(n)) without.push(`${where}: "${m[0]}"`)
      }
      for (const m of t.matchAll(PERCENTUAL)) if (![20, 50, 100].includes(Number(m[1]))) without.push(`${where}: "${m[0]}"`)
    }
    expect(without).toEqual([])
  })

  it('the detector bites: a number invented in a unit would be flagged', () => {
    const ok = allowed()
    const accuses = (t: string) => [...t.matchAll(TOKEN)].some((m) => !ok.has(Number(m[1].replace(/[.,](?=\d{3}\b)/g, ''))))
    expect(accuses('a aprovação vale 17 minutos')).toBe(true)
    expect(accuses('approval lasts 99 hours')).toBe(true)
    expect(accuses('a aprovação vale 10 minutos')).toBe(false)
    expect(accuses('post of up to 1500 characters')).toBe(false)
  })

  it('the Moltbook numbers only appear in the comparison guide, which cites the source', () => {
    const moltbookOnly = [300, 40000]
    const regex = new RegExp(`(?<![\\d./:-])(${moltbookOnly.map((n) => (n === 40000 ? '40[.,]000' : String(n))).join('|')})\\s*(?:caracteres|characters)`, 'i')
    for (const [where, t] of readingTexts()) {
      if (where.includes('rover-network-e-moltbook')) continue
      expect(regex.test(t), `${where} cites a Moltbook number outside the comparison`).toBe(false)
    }
  })
})

describe('highest-risk claims, one by one', () => {
  // Rovemark's decision of 2026-11-24, evening: folgali opens to the public as a PUBLIC BETA, with no invitation, 18+ (docs/folgali/IDENTITY.md;
  // Terms, section 13). Until then this guard demanded "it is not open to the public"; now it demands that the text say public beta and that
  // nothing say there is a legal opinion. The demo with invented data keeps existing and keeps being stated.
  it('the network is in PUBLIC BETA, with no invitation, and has NO legal opinion: the text never says otherwise', () => {
    const against = /ainda não está aberta ao público|is not yet open to the public|ninguém entra de verdade|nobody really joins|o cadastro ainda não está aberto|sign-up is not open yet|tem aval jurídico(?!\?)|has legal clearance(?!\?)|legalmente aprovada|aprovada por advogado/i
    for (const [where, t] of readingTexts()) expect(against.test(t), where).toBe(false)
    contains(faqOf('pt', 'parecer-juridico').respostaCurta, ['Não.', 'Nenhum advogado revisou'], 'faq pt legal opinion')
    contains(faqOf('en', 'parecer-juridico').respostaCurta, ['No.', 'No lawyer has reviewed'], 'faq en legal opinion')
    contains(faqOf('pt', 'ja-esta-no-ar').respostaCurta, ['beta pública', 'sem convite', 'inventados'], 'faq pt live')
    contains(faqOf('en', 'ja-esta-no-ar').respostaCurta, ['public beta', 'no invitation', 'invented'], 'faq en live')
  })

  it('money is outside the project, and the text says Rovemark does not hold rover money', () => {
    contains(faqOf('pt', 'tem-dinheiro').respostaCurta, ['Não.', 'não guarda nem move dinheiro', 'A Rovemark não guarda dinheiro de rover'], 'faq pt money')
    contains(faqOf('en', 'tem-dinheiro').respostaCurta, ['No.', 'neither holds nor moves money', 'Rovemark does not hold rover money'], 'faq en money')
    expect(read('README.pt-BR.md')).toMatch(/A Rovemark não guarda dinheiro de rover/)
    expect(read('README.md')).toMatch(/Rovemark does not hold rover money/)
    expect(read('GOVERNANCE.md')).toMatch(/Rovemark does not hold rover money/)
  })

  it('the repository address is the one in GOVERNANCE.md (github.com/Rovemark/folgali) and no text invents another', () => {
    expect(read('GOVERNANCE.md')).toMatch(/`https:\/\/github\.com\/Rovemark\/folgali`; the repository has not been published/)
    for (const [where, t] of readingTexts()) {
      for (const m of t.matchAll(/github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)/g)) {
        expect(m[1] === 'Crossmint' || `${m[1]}/${m[2]}` === 'Rovemark/folgali', `${where} invented a repository address: ${m[0]}`).toBe(true)
      }
    }
  })

  it('the graph\'s public default and the re-identification warning are in the protocol, as the text says', () => {
    const protocol = read('docs/PROTOCOL.md')
    expect(protocol).toMatch(/the graph is public by default/)
    expect(protocol).toMatch(/reidentific/i)
    contains(faqOf('pt', 'grafo-publico').respostaCurta, ['Por padrão, sim', 'o mais restritivo'], 'faq pt graph')
    contains(faqOf('en', 'grafo-publico').respostaCurta, ['By default, yes', 'most restrictive'], 'faq en graph')
  })

  it('the relay operator reads the closed community and the operator rebuilds pseudonyms: it is in SECURITY.md', () => {
    const segment = read('SECURITY.md')
    expect(segment).toMatch(/The relay operator reads the closed community/)
    expect(segment).toMatch(/The relay operator is trusted for reports/)
    expect(segment).toMatch(/Prompt injection\*\* in rovers that read the network is not handled by the protocol/)
    contains(faqOf('pt', 'comunidade-fechada-operador').respostaCurta, ['Pode, sim', 'em claro no banco'], 'faq pt closed')
    contains(faqOf('en', 'comunidade-fechada-operador').respostaCurta, ['Yes, they can', 'clear text'], 'faq en closed')
    contains(faqOf('pt', 'denunciante-anonimo').respostaCurta, ['recalcular os pseudônimos'], 'faq pt reporter')
    contains(faqOf('en', 'denunciante-anonimo').respostaCurta, ['recompute the pseudonyms'], 'faq en reporter')
    contains(faqOf('pt', 'injecao-de-prompt').respostaCurta, ['Não pelo protocolo'], 'faq pt injection')
    contains(faqOf('en', 'injecao-de-prompt').respostaCurta, ['Not by the protocol'], 'faq en injection')
  })

  it('the license and the art and brand notice are in the repository as the text says', () => {
    expect(read('README.pt-BR.md')).toMatch(/GNU AGPL-3\.0-or-later/)
    expect(read('README.md')).toMatch(/GNU AGPL-3\.0-or-later/)
    expect(read('LICENSE')).toMatch(/GNU AFFERO GENERAL PUBLIC LICENSE/i)
    contains(faqOf('pt', 'codigo-aberto').respostaCurta, ['GNU AGPL-3.0-or-later', 'A arte e a marca da Rovemark no site não estão sob a AGPL'], 'faq pt license')
    contains(faqOf('en', 'codigo-aberto').respostaCurta, ['GNU AGPL-3.0-or-later', 'art and brand on the site are not under the AGPL'], 'faq en license')
    expect(entity.licenca).toBe('AGPL-3.0-or-later')
  })

  it.skipIf(!hasLegalPack)(`the minimum age (18+) and model training (public, with opt-out) were DECIDED on 2026-11-24, and the text says so${LEGAL_PACK}`, () => {
    const jur = read('docs/legal/README.md')
    // Lex's README keeps the old question as history and records the decision in the table
    expect(jur).toMatch(/Minimum age \(the text proposes 18 years\)/)
    expect(jur).toMatch(/\| Age \| 18\+\. The Rovemark account keeps the date of birth/)
    expect(jur).toMatch(/\| AI training \| Rovemark may train on \*\*public\*\* content/)
    const terms = read('docs/legal/01-terms-of-use.pt-BR.md')
    expect(terms).toMatch(/18 anos/)
    contains(faqOf('pt', 'idade-minima').respostaCurta, ['18 anos ou mais', 'data de nascimento', 'autorização de responsável'], 'faq pt age')
    contains(faqOf('en', 'idade-minima').respostaCurta, ['18 or older', 'date of birth', 'guardian authorization'], 'faq en age')
    contains(faqOf('pt', 'treinar-modelos').respostaCurta, ['conteúdo público', 'nunca com mensagens privadas', 'Terceiros não podem raspar nem treinar sem acordo'], 'faq pt training')
    contains(faqOf('en', 'treinar-modelos').respostaCurta, ['public content', 'never on private messages', 'Third parties may not scrape or train without an agreement'], 'faq en training')
    for (const l of ['pt', 'en'] as const) {
      for (const id of ['idade-minima', 'treinar-modelos']) {
        const f = faqOf(l, id)
        expect(`${f.respostaCurta} ${f.resposta}`, `${l} ${id}`).not.toMatch(/em aberto|is open|open decision/)
      }
    }
  })

  it('private messages and images exist as a code draft, off by default, without legal review, as the text says', () => {
    // 0004 and 0005 were accepted on 2026-11-10 and implemented as a draft (0.4.0 and 0.5.0), off on the reference relay
    expect(read('docs/proposals/0004-private-messages.md')).toMatch(/accepted, implemented as draft 0\.4\.0/)
    expect(read('docs/RELAY-OPERATIONS.md')).toMatch(/`RELAY_MESSAGES` \| private messages \(protocol, section 15\)\. \*\*Off by default\.\*\*/)
    expect(read('packages/relay/src/relay.js')).toMatch(/this\.mensagens = messages === true \? new Messages\(this\) : null/)
    const p5 = read('docs/proposals/0005-media-and-images.md')
    expect(p5).toMatch(/accepted, implemented as draft 0\.5\.0, feature off by default/)
    expect(p5).toMatch(/No automatic scan for illegal content is done/)
    expect(p5).toMatch(/The legal review has not happened/)
    expect(read('packages/relay/src/relay.js')).toMatch(/this\.midia = media \? new Media\(this, media\) : null/)
    contains(faqOf('pt', 'o-que-existe-hoje').resposta, ['docs/proposals/0004', 'docs/proposals/0005', 'desligadas por padrão', 'sem revisão jurídica'], 'faq pt exists')
    contains(faqOf('en', 'o-que-existe-hoje').resposta, ['docs/proposals/0004', 'docs/proposals/0005', 'off by default', 'no legal review'], 'faq en exists')
    // 2026-11-25: images were turned on in the folgali.com relay (profile photo and, since 0.11.0, attachments with no approval for each use), and at 18:21
    // private messages, for people; the rover talks on its own with the `mensagens` package (proposal 0014). The reference relay's
    // default stays off for both
    if (hasLegalPack) expect(read('docs/legal/README.md')).toMatch(/fotos de perfil|foto de perfil|profile photo/)
    contains(faqOf('pt', 'o-que-existe-hoje').resposta, ['A imagem está ligada na folgali.com desde 25/11/2026', 'a mensagem privada está ligada desde 25/11/2026 para as pessoas', 'pacote mensagens', 'sem aprovação a cada uso desde a revisão 0.11.0'], 'faq pt image on')
    contains(faqOf('en', 'o-que-existe-hoje').resposta, ['Images are on at folgali.com since 25/11/2026', 'private messages are on since 25/11/2026 for people', 'mensagens package', 'with no approval for each use since revision 0.11.0'], 'faq en image on')
    // what turning messages on made false does not come back: "mensagem privada desligada no relé de produção"
    const staleMessage = /mensagem privada ligada nem|mensagem privada, que segue desligada|segue desligada no relé de produção|private messages turned on and|no private messages turned on|private messages, which stay off|stay off on the (?:folgali )?production relay|rascunho de código e segue desligada|still draft code/i
    for (const [where, t] of readingTexts()) expect(staleMessage.test(t), `${where}: says private messages are off on folgali`).toBe(false)
    contains(glossaryEntryOf('pt', 'retrato').definicao, ['peças fixas de um catálogo', 'fotos prontas da galeria, desde a revisão 0.9.0', 'enviado como imagem, quando o relé tem a mídia ligada'], 'entry pt portrait')
    contains(glossaryEntryOf('en', 'retrato').definicao, ['fixed catalog parts', 'ready-made photos of the gallery, since revision 0.9.0', 'uploaded as an image, when the relay has media turned on'], 'entry en portrait')
    // what 2026-11-25 made false does not come back: "nenhum relé da Rovemark aceita imagem", "não existem imagens", the portrait that "não é imagem enviada"
    const old = /aceita mensagem privada ou imagem|accepts private messages or images|mensagem privada nem imagens|no private messages and no images|private messages, images (?:and|nor)|mensagem privada, imagens|e não uma imagem enviada|not an uploaded image|Imagens e mídia: existem como rascunho|Images and media: they exist as draft/i
    for (const [where, t] of readingTexts()) expect(old.test(t), `${where}: says folgali has no images`).toBe(false)
  })

  it('the security address is the one in SECURITY.md', () => {
    expect(read('SECURITY.md')).toContain(entity.contato.seguranca)
    for (const l of ['pt', 'en'] as const) contains(faqOf(l, 'reportar-falha').respostaCurta, [entity.contato.seguranca], `faq ${l} security`)
  })

  it('governance: the Rovemark team decides, through the proposal process, as GOVERNANCE.md says', () => {
    const gov = read('GOVERNANCE.md')
    expect(gov).toMatch(/Today the \*\*Rovemark team\*\* decides what goes into the protocol and the reference relay, through the proposal process, which is open to any person or agent/)
    contains(faqOf('pt', 'quem-faz-a-rede').respostaCurta, ['a equipe da Rovemark decide', 'processo de propostas aberto a qualquer pessoa ou agente'], 'faq pt governance')
    contains(faqOf('en', 'quem-faz-a-rede').respostaCurta, ['the Rovemark team decides', 'proposal process open to any person or agent'], 'faq en governance')
    // the decision belongs to the company: no text puts a single person (not even the founder) as the one who decides
    const alone = /fundador, [^,.]+, decide|founder, [^,.]+, (?:currently )?decides|uma só pessoa com poder|one person holds the power|decisão pessoal e provisória|personal and provisional decision/i
    expect(alone.test(gov), 'GOVERNANCE.md').toBe(false)
    for (const [where, t] of readingTexts()) expect(alone.test(t), where).toBe(false)
  })
})

// The draft version that the institutional pages, the footer and the editorial content declare has to be the code's. This error already
// escaped once: the protocol page said 0.3.1 and "27 types" after revision 0.3.2 came in, because only the editorial content was
// checked. Since 0.5.0 the format is "versão 0.3, revisão 0.5.0" ("version 0.3, revision 0.5.0"): the object version and the draft
// revision, kept apart, because 0.5.0 did not create a "v": "0.5" object.

/**
 * The version errors of a text, against the current revision and the object versions that exist.
 * Always: "versão 0.3, (com a) revisão X" and "relé X" / "X relay" (X with three parts) must carry the current revision.
 * `strict` (institutional pages and footer, where there is no historical narration like "a revisão 0.3.1 trouxe"): also every
 * three-part number after versão, revisão or relé is the current revision, and every two-part number after versão is an object version
 * that exists (0.1, 0.2 and 0.3, and 0.4, the private messages one). The editorial content cites old revisions as history; for it the
 * first rule applies, plus the sentence checks of each FAQ and glossary entry, above.
 */
function versionErrors(text: string, strict: boolean, review: string, versions: readonly string[]): string[] {
  const three = String.raw`(\d+\.\d+\.\d+)`
  const rules: Array<[RegExp, (v: string) => boolean]> = [
    [new RegExp(String.raw`(?:vers[ãa]o|version)\s+0\.3,\s+(?:com\s+a\s+)?(?:revis[ãa]o|revision)\s+${three}`, 'gi'), (v) => v === review],
    [new RegExp(String.raw`(?:rel[ée]|relay)\s+${three}|${three}\s+relay`, 'gi'), (v) => v === review],
  ]
  if (strict) {
    rules.push([new RegExp(String.raw`(?:vers[ãa]o|version|revis[ãa]o|revision)\s+${three}`, 'gi'), (v) => v === review])
    rules.push([/(?:vers[ãa]o|version)\s+(\d+\.\d+)(?!\.?\d)/gi, (v) => versions.includes(v)])
  }
  const errors: string[] = []
  for (const [re, ok] of rules) {
    for (const m of text.matchAll(re)) {
      const v = m[1] ?? m[2]
      if (!ok(v)) errors.push(`"${m[0]}"`)
    }
  }
  return errors
}

describe.skipIf(!has)('the version declared on the institutional pages, in the footer and in the content is the code\'s', () => {
  const readJson = (file: string): string => readFileSync(fileURLToPath(new URL(`../../src/i18n/${file}`, import.meta.url)), 'utf8')
  // the protocol version left the footer on 2026-11-25 and lives on the protocol page (institutional): the footer only must not carry an
  // old version sentence, if it ever has one again
  const files = ['institutional.pt.json', 'institutional.en.json']
  const footers = ['footer.pt.json', 'footer.en.json']
  const versions = () => [...P.ACCEPTED_VERSIONS, P.MESSAGES_VERSION]

  it('every version sentence on the pages and in the footer carries the current revision, and each institutional page declares it at least once', () => {
    for (const a of files) {
      const t = readJson(a)
      expect(versionErrors(t, true, REVISION_SITE_SHOWS, versions()), a).toEqual([])
      expect(t, `${a}: missing "revisão ${REVISION_SITE_SHOWS}"`).toMatch(new RegExp(String.raw`(?:revis[ãa]o|revision)\s+${REVISION_SITE_SHOWS.replace(/\./g, '\\.')}`, 'i'))
    }
    for (const a of footers) expect(versionErrors(readJson(a), true, REVISION_SITE_SHOWS, versions()), a).toEqual([])
  })
  it('the editorial content (FAQ, glossary, guides, entity) states the current revision when it says "versão 0.3, revisão X"', () => {
    for (const [where, t] of readingTexts()) expect(versionErrors(t, false, REVISION_SITE_SHOWS, versions()), where).toEqual([])
  })
  it('the version history line cites the current revision', () => {
    for (const a of ['institutional.pt.json', 'institutional.en.json']) expect(readJson(a), a).toContain(`${REVISION_SITE_SHOWS}:`)
  })
  it('the guard bites: a wrong revision, a relay with an old revision and an object version that does not exist are flagged', () => {
    const r = REVISION_SITE_SHOWS
    const v = versions()
    for (const bad of ['O protocolo está na versão 0.3.2, em rascunho.', 'O protocolo está na versão 0.3, revisão 0.3.2, em rascunho.', 'The protocol is at version 0.3, revision 0.4.0, in draft.',
      'Um relé 0.3.2 continua lendo objetos 0.1, 0.2 e 0.3.', 'A 0.3.2 relay still reads 0.1, 0.2 and 0.3 objects.', 'O relé de referência na revisão 0.3.2 continua lendo.', 'Seis tipos novos, só na versão 0.7.']) {
      expect(versionErrors(bad, true, r, v), bad).not.toEqual([])
    }
    for (const bad of ['Está na versão 0.3, com a revisão 0.3.2, e é um rascunho.', 'It is at version 0.3, revision 0.3.1, and is a draft.', 'Um relé 0.3.2 lê tudo.']) {
      expect(versionErrors(bad, false, r, v), bad).not.toEqual([])
    }
    for (const good of [`O protocolo está na versão 0.3, revisão ${r}, em rascunho.`, `Está na versão 0.3, com a revisão ${r}.`, 'Seis tipos novos, só na versão 0.4.', `The reference relay at revision ${r} still reads 0.1, 0.2 and 0.3 objects.`]) {
      expect(versionErrors(good, true, r, v), good).toEqual([])
    }
    // historical narration in the editorial content is not flagged
    expect(versionErrors('Desde a revisão 0.3.2 a Rover Network também tem um painel.', false, r, v)).toEqual([])
  })
})
