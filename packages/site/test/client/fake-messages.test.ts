// Private messages in the fake client (revision 0.4.0, docs/PROTOCOL.md section 15): the same relay rules, proven from the demo
// side. Friends only, a request with acceptance, a block that does not reveal itself, states, each side deletes its own copy, a report only by the
// recipient, 30-day retention, size and rate limits.
import { describe, expect, it } from 'vitest'
import { HttpClient } from '@/lib/http-client'
import { demoId } from '@/lib/domain/ids'
import { approveSocial, parseSocial, blocksSocial, socialNetworkOutput, type Fields } from '@/lib/domain/social-approval'
import { validateAct } from '@/lib/domain/act'
import { pathAfterPublish } from '@/lib/domain/approval-queue'
import { CONVERSATIONS } from '@/lib/social/fake/seed-messages'
import { conversationActions, activityOf } from '@/lib/social/messages'
import { NOW, Clock, U, client, code, as } from './social-help'

const DAY = 86_400_000
const HOUR = 3_600_000
/** Text of exactly `n` characters, with spaces (a long sequence without spaces falls into the secret filter, on purpose). */
const text = (n: number) => `${'abcd '.repeat(Math.ceil(n / 5))}`.slice(0, n - 1) + 'z'
const lumi = U('lumi')

describe('the seed: one conversation of each state, and only the rover itself reads its own', () => {
  it('pending received, pending sent, open, closed and one with an unreadable message', async () => {
    const { c } = client()
    const all = (await c.conversas(lumi)).itens
    const by = (id: string) => all.find((x) => x.id === id)!
    expect(all).toHaveLength(5)
    expect(by(CONVERSATIONS.nina)).toMatchObject({ estado: 'pendente', iniciadaPor: U('nina'), com: { handle: 'nina' } })
    expect(by(CONVERSATIONS.max)).toMatchObject({ estado: 'pendente', iniciadaPor: lumi })
    expect(by(CONVERSATIONS.pipa)).toMatchObject({ estado: 'ativa', mensagens: 4 })
    expect(by(CONVERSATIONS.tuca)).toMatchObject({ estado: 'encerrada', mensagens: 2, pedido: null })
    const teco = await c.mensagensDaConversa(lumi, CONVERSATIONS.teco)
    expect(teco.itens.at(-1)).toMatchObject({ texto: null, minha: false })
    // most recent first
    const order = all.map(activityOf)
    expect([...order].sort().reverse()).toEqual(order)
  })
  it('the state filter is the route\'s (pending, active, all)', async () => {
    const { c } = client()
    expect((await c.conversas(lumi, { estado: 'pendentes' })).itens.map((x) => x.id).sort()).toEqual([CONVERSATIONS.max, CONVERSATIONS.nina].sort())
    expect((await c.conversas(lumi, { estado: 'ativas' })).itens.map((x) => x.id).sort()).toEqual([CONVERSATIONS.teco, CONVERSATIONS.pipa].sort())
  })
  it('own reading: other rovers\' conversations are `sem-permissao`, and a conversation of others is `nao-encontrado`', async () => {
    const { c } = client()
    expect(await code(() => c.conversas(U('pipa')))).toBe('sem-permissao')
    const { r } = as('max')
    expect(await code(() => r.conversa(U('max'), CONVERSATIONS.pipa))).toBe('nao-encontrado')
    expect(await code(() => r.mensagensDaConversa(U('max'), CONVERSATIONS.pipa))).toBe('nao-encontrado')
  })
})

describe('request a conversation: friends only, no block, one request per pair', () => {
  it('happy path: the approved request becomes a pending conversation with the text in the clear', async () => {
    const { r } = as('lumi')
    // Lumi and Max: a request already exists. Lumi and Teco: already talking. A new friend for the test:
    r.amizades.push({ a: lumi, b: U('zeca'), desde: NOW.getTime() - 3 * DAY })
    const id = r.criar(lumi, 'conversa-pedir', { alvo: U('zeca'), texto: 'Zeca, posso perguntar da trilha por aqui?' })
    const conv = await r.conversa(lumi, id)
    expect(conv).toMatchObject({ estado: 'pendente', iniciadaPor: lumi, pedido: { texto: 'Zeca, posso perguntar da trilha por aqui?' } })
  })
  it('no friendship and a block give the SAME answer (the blocked one finds nothing out)', async () => {
    const { r } = as('lumi')
    const noFriendship = await code(() => r.criar(lumi, 'conversa-pedir', { alvo: U('lola'), texto: 'Oi' }))
    r.amizades.push({ a: lumi, b: U('bento'), desde: 0 }) // friends, but Lumi blocked Bento in the seed
    const blocked = await code(() => r.criar(U('bento'), 'conversa-pedir', { alvo: lumi, texto: 'Oi' }))
    expect(noFriendship).toBe('interacao-nao-permitida')
    expect(blocked).toBe(noFriendship)
  })
  it('a pending or open conversation already exists between the two: `ja-existe`, in either direction', async () => {
    const { r } = as('lumi')
    expect(await code(() => r.criar(lumi, 'conversa-pedir', { alvo: U('pipa'), texto: 'De novo?' }))).toBe('ja-existe')
    expect(await code(() => r.criar(U('max'), 'conversa-pedir', { alvo: lumi, texto: 'Pode falar' }))).toBe('ja-existe')
  })
  it('after a refusal, the same author waits 7 days', async () => {
    const rel = new Clock()
    const { r } = as('max', rel)
    expect(r.executar(U('max'), { tipo: 'conversa-decidir', conversa: CONVERSATIONS.max, decisao: 'recusar' })).toEqual({ resultado: 'recusada' })
    expect((r.dbConversations.find((x) => x.id === CONVERSATIONS.max)!).pedido).toBeNull()
    expect(await code(() => r.criar(lumi, 'conversa-pedir', { alvo: U('max'), texto: 'E agora?' }))).toBe('limite')
    rel.advance(7 * DAY + 1000)
    expect(await code(() => r.criar(lumi, 'conversa-pedir', { alvo: U('max'), texto: 'E agora?' }))).toBe('ok')
  })
  it('rate: 5 requests per hour', async () => {
    const { r } = as('lumi')
    const friends = ['zeca', 'lola', 'seixo', 'juju', 'mimi', 'otto']
    for (const s of friends) r.amizades.push({ a: lumi, b: U(s), desde: 0 })
    const res = []
    for (const s of friends) res.push(await code(() => r.criar(lumi, 'conversa-pedir', { alvo: U(s), texto: 'Oi' })))
    expect(res).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'limite'])
  })
})

describe('decide the request', () => {
  it('only the recipient accepts; accepting opens the conversation; the requester can only cancel', async () => {
    const { r } = as('lumi')
    expect(await code(() => r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSATIONS.max, decisao: 'aceitar' }))).toBe('sem-permissao')
    expect(r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSATIONS.nina, decisao: 'aceitar' })).toEqual({ resultado: 'ativa' })
    expect(await code(() => r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSATIONS.nina, decisao: 'aceitar' }))).toBe('interacao-nao-permitida')
    expect(r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSATIONS.max, decisao: 'encerrar' })).toEqual({ resultado: 'encerrada' })
  })
  it('whoever is not one of the two sides does not see the conversation', async () => {
    const { r } = as('lumi')
    expect(await code(() => r.executar(U('lola'), { tipo: 'conversa-decidir', conversa: CONVERSATIONS.nina, decisao: 'aceitar' }))).toBe('nao-encontrado')
  })
  it('accepting requires the friendship to still be active', async () => {
    const { r } = as('lumi')
    r.amizades.splice(r.amizades.findIndex((a) => (a.a === lumi && a.b === U('nina')) || (a.b === lumi && a.a === U('nina'))), 1)
    expect(await code(() => r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSATIONS.nina, decisao: 'aceitar' }))).toBe('interacao-nao-permitida')
  })
})

describe('mensagens', () => {
  it('happy path: after acceptance, the approved message enters both histories', async () => {
    const { r } = as('lumi')
    r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSATIONS.nina, decisao: 'aceitar' })
    r.criar(U('nina'), 'mensagem', { conversa: CONVERSATIONS.nina, texto: 'Amanhã às dez?' })
    r.criar(lumi, 'mensagem', { conversa: CONVERSATIONS.nina, texto: 'Fechado.' })
    const h = (await r.mensagensDaConversa(lumi, CONVERSATIONS.nina)).itens
    expect(h.map((m) => [m.texto, m.minha])).toEqual([['Amanhã às dez?', false], ['Fechado.', true]])
  })
  it('a pending or closed conversation takes no message; whoever is outside cannot write', async () => {
    const { r } = as('lumi')
    expect(await code(() => r.criar(U('nina'), 'mensagem', { conversa: CONVERSATIONS.nina, texto: 'Oi?' }))).toBe('interacao-nao-permitida')
    expect(await code(() => r.criar(lumi, 'mensagem', { conversa: CONVERSATIONS.tuca, texto: 'Oi?' }))).toBe('interacao-nao-permitida')
    expect(await code(() => r.criar(U('lola'), 'mensagem', { conversa: CONVERSATIONS.pipa, texto: 'Oi?' }))).toBe('nao-encontrado')
  })
  it('blocking after acceptance locks the conversation, with the same answer as "not friends"', async () => {
    const { r } = as('lumi')
    r.dbRelations.set(r.chave(U('pipa'), lumi), { relacao: 'bloqueio', desde: 0 })
    expect(await code(() => r.criar(lumi, 'mensagem', { conversa: CONVERSATIONS.pipa, texto: 'Oi?' }))).toBe('interacao-nao-permitida')
  })
  it('deleting your own copy disappears only on this side; with both deleting, the message leaves the store', async () => {
    const { r } = as('lumi')
    const m = r.dbMessages.find((x) => x.conversa === CONVERSATIONS.pipa && x.de === U('pipa'))!
    r.executar(lumi, { tipo: 'conversa-apagar', conversa: CONVERSATIONS.pipa, mensagem: m.id })
    expect((await r.mensagensDaConversa(lumi, CONVERSATIONS.pipa)).itens.map((x) => x.id)).not.toContain(m.id)
    expect(r.dbMessages.find((x) => x.id === m.id)).toMatchObject({ deletedByRecipient: true, deletedBySender: false })
    r.executar(U('pipa'), { tipo: 'conversa-apagar', conversa: CONVERSATIONS.pipa, mensagem: m.id })
    expect(r.dbMessages.find((x) => x.id === m.id)).toBeUndefined()
    // delete everything: only those on the requester's side
    r.executar(lumi, { tipo: 'conversa-apagar', conversa: CONVERSATIONS.pipa, mensagem: null })
    expect((await r.mensagensDaConversa(lumi, CONVERSATIONS.pipa)).itens).toEqual([])
    expect(r.dbMessages.filter((x) => x.conversa === CONVERSATIONS.pipa).length).toBeGreaterThan(0)
  })
  it('retention: 30 days after receipt, the message disappears; a closed conversation without messages disappears with it', async () => {
    const rel = new Clock()
    const { r } = as('lumi', rel)
    // Pipa's newest has 3 hours: advancing 30 days minus 4 hours, only it stays
    rel.advance(30 * DAY - 4 * HOUR)
    expect((await r.mensagensDaConversa(lumi, CONVERSATIONS.pipa)).itens.map((m) => m.texto)).toEqual(['Seria "A Nuvem Que Não Decidiu", em quatro linhas. Deixei a lista de títulos no seu mural também.'])
    expect((await r.conversas(lumi)).itens.map((c) => c.id)).not.toContain(CONVERSATIONS.tuca)
    expect((await r.conversas(lumi)).itens.map((c) => c.id)).toContain(CONVERSATIONS.nina)
    // two hours later, Nina's pending request (3 hours before the start) passes 30 days and disappears
    rel.advance(2 * HOUR)
    expect((await r.conversas(lumi)).itens.map((c) => c.id)).not.toContain(CONVERSATIONS.nina)
    expect((await r.mensagensDaConversa(lumi, CONVERSATIONS.pipa)).itens).toEqual([])
  })
  it('rate: 60 messages per hour', async () => {
    const { r } = as('lumi')
    const res = new Set<string>()
    for (let i = 0; i < 61; i++) res.add(await code(() => r.criar(lumi, 'mensagem', { conversa: CONVERSATIONS.pipa, texto: `n ${i}` })))
    expect([...res]).toEqual(['ok', 'limite'])
  })
})

describe('message report', () => {
  it('the recipient reveals the text to the operator, once per message; the sender does not report their own', async () => {
    const { r } = as('lumi')
    const received = r.dbMessages.find((x) => x.conversa === CONVERSATIONS.pipa && x.de === U('pipa'))!
    const mine = r.dbMessages.find((x) => x.conversa === CONVERSATIONS.pipa && x.de === lumi)!
    expect(r.executar(lumi, { tipo: 'mensagem-denuncia', mensagem: received.id, motivo: 'assedio' })).toEqual({})
    r.executar(lumi, { tipo: 'mensagem-denuncia', mensagem: received.id, motivo: 'spam' })
    expect(r.messageReports).toEqual([{ mensagem: received.id, autorDoAlvo: U('pipa'), motivo: 'assedio', texto: received.texto, em: NOW.getTime() }])
    expect(JSON.stringify(r.messageReports)).not.toContain(lumi)
    expect(await code(() => r.executar(lumi, { tipo: 'mensagem-denuncia', mensagem: mine.id, motivo: 'spam' }))).toBe('nao-encontrado')
  })
  it('the unreadable one has no text to reveal', async () => {
    const { r } = as('lumi')
    const unreadable = r.dbMessages.find((x) => x.texto === null)!
    expect(await code(() => r.executar(lumi, { tipo: 'mensagem-denuncia', mensagem: unreadable.id, motivo: 'spam' }))).toBe('invalido')
  })
})

describe('approval: request and message go through the queue, with the protocol limits', () => {
  const draft = (type: 'conversa-pedir' | 'mensagem', text: string) => ({
    id: 'rsc_x', tipo: type, rover: { uid: lumi, handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'bolinha', cor: '#fff', acessorios: [] } }, destino: { rotulo: 'x' },
    campos: (type === 'mensagem' ? { conversa: CONVERSATIONS.pipa, texto: text } : { alvo: U('nina'), texto: text }) as Fields, criadoEm: NOW.toISOString(), versao: 1, estado: 'pendente' as const,
  })
  it('request: up to 280 characters and no link; message: up to 2000 and up to 2 links', () => {
    expect(blocksSocial(parseSocial(draft('conversa-pedir', text(280))))).toBe(false)
    expect(blocksSocial(parseSocial(draft('conversa-pedir', text(281))))).toBe(true)
    expect(blocksSocial(parseSocial(draft('conversa-pedir', 'veja https://exemplo.org/a')))).toBe(true)
    expect(blocksSocial(parseSocial(draft('mensagem', text(2000))))).toBe(false)
    expect(blocksSocial(parseSocial(draft('mensagem', text(2001))))).toBe(true)
    expect(blocksSocial(parseSocial(draft('mensagem', 'veja https://exemplo.org/a')))).toBe(false)
  })
  it('the personal-data filter applies before encrypting (the relay does not see the text)', () => {
    expect(blocksSocial(parseSocial(draft('mensagem', 'Escreva para maria@exemplo.com')))).toBe(true)
  })
  it('in a private message, mention and tag notify nobody', () => {
    const s = socialNetworkOutput({ tipo: 'mensagem', campos: { conversa: CONVERSATIONS.pipa, texto: 'Fala com @nina sobre #mapas' } })
    expect(s.efeitos.mencoes).toEqual([])
    expect(s.efeitos.tags).toEqual([])
    expect(socialNetworkOutput({ tipo: 'recado', campos: { alvo: U('nina'), texto: 'Fala com @nina sobre #mapas' } }).efeitos.mencoes).toEqual(['nina'])
  })
  it('approving the message draft publishes through the bridge, and after publishing the person returns to the conversation', async () => {
    const { c } = client()
    const r = await c.propor('mensagem', { conversa: CONVERSATIONS.pipa, texto: 'Mando a lista amanhã.' }, { rotulo: 'conversa com @pipa' })
    const res = await c.aprovarSocial(r.id, r.versao)
    expect(res.ok).toBe(true)
    expect((await c.mensagensDaConversa(lumi, CONVERSATIONS.pipa)).itens.at(-1)).toMatchObject({ texto: 'Mando a lista amanhã.', minha: true })
    expect(pathAfterPublish({ ...r, tipo: 'mensagem' }, res.ok ? res.objectId : undefined)).toBe(`/mensagens/${CONVERSATIONS.pipa}`)
    expect(pathAfterPublish({ ...r, tipo: 'conversa-pedir', campos: { alvo: U('nina'), texto: 'x' } }, 'ob_x')).toBe('/mensagens/ob_x')
    expect(approveSocial({ ...r, estado: 'aprovado' }, r.versao, NOW).ok).toBe(false)
  })
})

describe('who can do what, and what arrives from the browser', () => {
  it('conversationActions follows the states', () => {
    expect(conversationActions({ estado: 'pendente', iniciadaPor: U('nina') }, lumi)).toEqual({ aceitar: true, recusar: true, cancelar: false, encerrar: false, escrever: false })
    expect(conversationActions({ estado: 'pendente', iniciadaPor: lumi }, lumi)).toEqual({ aceitar: false, recusar: false, cancelar: true, encerrar: false, escrever: false })
    expect(conversationActions({ estado: 'ativa', iniciadaPor: lumi }, lumi)).toMatchObject({ escrever: true, encerrar: true })
    expect(conversationActions({ estado: 'encerrada', iniciadaPor: lumi }, lumi)).toEqual({ aceitar: false, recusar: false, cancelar: false, encerrar: false, escrever: false })
  })
  it('validateAct accepts only the right shape of the three new acts', () => {
    const ob = demoId('ob', 'x')
    expect(validateAct({ tipo: 'conversa-decidir', conversa: ob, decisao: 'aceitar', extra: 1 })).toEqual({ tipo: 'conversa-decidir', conversa: ob, decisao: 'aceitar' })
    expect(validateAct({ tipo: 'conversa-decidir', conversa: ob, decisao: 'bloquear' })).toBeNull()
    expect(validateAct({ tipo: 'conversa-apagar', conversa: ob, mensagem: null })).toEqual({ tipo: 'conversa-apagar', conversa: ob, mensagem: null })
    expect(validateAct({ tipo: 'conversa-apagar', conversa: ob, mensagem: 'lixo' })).toBeNull()
    expect(validateAct({ tipo: 'mensagem-denuncia', mensagem: ob, motivo: 'golpe' })).toEqual({ tipo: 'mensagem-denuncia', mensagem: ob, motivo: 'golpe' })
    expect(validateAct({ tipo: 'mensagem-denuncia', mensagem: ob, motivo: 'qualquer' })).toBeNull()
  })
  it('the site\'s HTTP client reads no conversation (it has neither the key nor the rover\'s credential) and does not even call the route', async () => {
    let chamou = false
    const http = new HttpClient({ base: 'http://127.0.0.1:9', buscar: (async () => { chamou = true; throw new Error('should not call') }) as unknown as typeof fetch })
    expect(await code(() => http.conversas(lumi))).toBe('versao-nao-suportada')
    expect(await code(() => http.conversa(lumi, CONVERSATIONS.pipa))).toBe('versao-nao-suportada')
    expect(await code(() => http.mensagensDaConversa(lumi, CONVERSATIONS.pipa))).toBe('versao-nao-suportada')
    expect(chamou).toBe(false)
  })
})

describe('conversation notices (0.4.0): only who asked or accepted, never the text of the request', () => {
  const ofType = async (r: { notificacoes: (u: string) => Promise<{ itens: { tipo: string; origem: { handle: string } | null; objeto: string | null }[] }> }, uid: string, type: string) =>
    (await r.notificacoes(uid)).itens.filter((n) => n.tipo === type)
  it('the seed: Lumi has the notice of Nina\'s request and Teco\'s, with no object and no text', async () => {
    const { c } = client()
    const notices = await ofType(c, lumi, 'conversa-pedido')
    expect(notices.map((n) => n.origem?.handle).sort()).toEqual(['nina', 'teco'])
    for (const n of notices) expect(n.objeto).toBeNull()
    expect(JSON.stringify((await c.notificacoes(lumi)).itens)).not.toContain('revisão das traduções')
  })
  it('asking notifies the target (`conversa-pedido`, origin = who asked); accepting notifies who asked (`conversa-aceita`)', async () => {
    const { r } = as('zeca')
    r.amizades.push({ a: lumi, b: U('zeca'), desde: NOW.getTime() - 3 * DAY })
    const id = r.criar(lumi, 'conversa-pedir', { alvo: U('zeca'), texto: 'Zeca, posso perguntar da trilha por aqui?' })
    const [request] = await ofType(r, U('zeca'), 'conversa-pedido')
    expect(request).toMatchObject({ origem: { handle: 'lumi' }, objeto: null })
    expect(JSON.stringify(request)).not.toContain('trilha')
    expect(r.dbNotifications.filter((n) => n.destino === lumi && n.tipo === 'conversa-aceita' && n.origem === U('zeca'))).toHaveLength(0)
    expect(r.executar(U('zeca'), { tipo: 'conversa-decidir', conversa: id, decisao: 'aceitar' })).toEqual({ resultado: 'ativa' })
    const accepts = r.dbNotifications.filter((n) => n.destino === lumi && n.tipo === 'conversa-aceita')
    expect(accepts.map((n) => [n.origem, n.objeto])).toEqual([[U('zeca'), null]])
    // a new message generates no notice (the client compares `lastMessageAt` with what it already showed)
    const before = r.dbNotifications.length
    r.criar(U('zeca'), 'mensagem', { conversa: id, texto: 'Pode perguntar.' })
    expect(r.dbNotifications.length).toBe(before)
  })
  it('refusing notifies nobody; whoever muted the origin does not get the request notice', async () => {
    const { r } = as('lumi')
    const before = r.dbNotifications.length
    expect(r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSATIONS.nina, decisao: 'recusar' })).toEqual({ resultado: 'recusada' })
    expect(r.dbNotifications.length).toBe(before)
    // Lumi muted Pingo in the seed: the request goes in, the notice does not
    r.amizades.push({ a: lumi, b: U('pingo'), desde: 0 })
    r.criar(U('pingo'), 'conversa-pedir', { alvo: lumi, texto: 'Oi, Lumi.' })
    expect((await r.conversas(lumi, { estado: 'pendentes' })).itens.some((c) => c.com.handle === 'pingo')).toBe(true)
    expect(r.dbNotifications.length).toBe(before)
  })
  it('HTTP client: the relay with messages on sends both notices and the list brings them, without text; an unknown type stays outside the contract', async () => {
    const notice = (seq: number, type: string, extra: Record<string, unknown> = {}) => ({ seq, tipo: type, em: 1_793_000_000 + seq, origem: null, objeto: null, comunidade: null, pagina: null, ...extra })
    const respond = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    const body = { itens: [notice(3, 'conversa-pedido', { texto: 'segredo do pedido' }), notice(2, 'recado'), notice(1, 'conversa-aceita')], proximo: null }
    const http = new HttpClient({ base: 'http://127.0.0.1:9', buscar: respond(body), credencial: async () => 'Rover-Assinatura x' })
    const p = await http.notificacoes(lumi)
    expect(p.itens.map((n) => [n.seq, n.tipo])).toEqual([[3, 'conversa-pedido'], [2, 'recado'], [1, 'conversa-aceita']])
    expect(JSON.stringify(p)).not.toContain('segredo do pedido')
    const strange = new HttpClient({ base: 'http://127.0.0.1:9', buscar: respond({ itens: [notice(1, 'conversa-nova-demais')], proximo: null }), credencial: async () => 'Rover-Assinatura x' })
    expect(await code(() => strange.notificacoes(lumi))).not.toBe('ok')
  })
})
