// @vitest-environment node
// The browser library of private messages (src/lib/person/messages.ts) against a stand-in for this site's API and the relay, built with
// the protocol package: Ana activates (her cipher key is created NOT extractable and only the public half is published), sends a message
// Bia's protocol client decrypts, and reads Bia's message. Everything that reaches "the server" (every fetch body) is recorded and
// searched: no clear text and no private key ever leaves the browser. A forged or moved message reads as unreadable.
import { webcrypto } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const protocolPath = fileURLToPath(new URL('../../../protocol/src/index.js', import.meta.url))

/** A minimal IndexedDB: one database, one store, values kept by reference (CryptoKey objects stay CryptoKey objects). */
function fakeIndexedDb() {
  const stores = new Map<string, Map<string, unknown>>()
  const request = <T>(run: () => T) => {
    const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {}
    queueMicrotask(() => {
      try {
        r.result = run()
        r.onsuccess?.()
      } catch (e) {
        r.error = e
        r.onerror?.()
      }
    })
    return r
  }
  const db = {
    createObjectStore: (name: string) => stores.set(name, stores.get(name) ?? new Map()),
    transaction: (name: string) => ({
      objectStore: () => {
        const s = stores.get(name)!
        return { get: (k: string) => request(() => s.get(k)), put: (v: unknown, k: string) => request(() => s.set(k, v)) }
      },
    }),
    close: () => {},
  }
  return {
    stores,
    open: () => {
      const r: { result?: typeof db; onupgradeneeded?: () => void; onsuccess?: () => void } = {}
      queueMicrotask(() => {
        r.result = db
        if (!stores.has('device')) r.onupgradeneeded?.()
        r.onsuccess?.()
      })
      return r
    },
    databases: async () => [{ name: 'folgali' }],
  }
}

const ANA = 'rvr_' + 'A'.repeat(22)
const BIA = 'rvr_' + 'B'.repeat(22)

describe.skipIf(!existsSync(protocolPath))('messages in the browser, end to end against the protocol', async () => {
  const P = await import(/* @vite-ignore */ protocolPath)
  const issuer = P.generateKeyPair()
  const bia = { net: P.generateKeyPair(), cipher: P.generateCipherKeyPair() }
  const now = () => Math.floor(Date.now() / 1000)
  const attest = (uid: string, handle: string, key: string) =>
    P.createPersonAttestation({ issuerPrivateKey: issuer.chavePrivada, emissor: issuer.publicKey, uid, handle, chave: key, emitidoEm: now() - 5, expiraEm: now() + 6 * 86400 })
  const biaAttestation = attest(BIA, 'bia.teste', bia.net.publicKey)
  const biaKeyObject = P.createObject({ v: '0.4', tipo: 'chave-de-cifra', autor: BIA, criadoEm: now() - 60, previo: null, corpo: { chave: bia.cipher.publicKey }, chavePrivada: bia.net.chavePrivada })

  let sent: { url: string; body: string }[]
  let relay: { anaAttestation: unknown; anaKey: unknown; messages: unknown[]; conversation: Record<string, unknown> }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  beforeEach(() => {
    vi.stubGlobal('indexedDB', fakeIndexedDb())
    if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto)
    sent = []
    const conversation = `ob_${'C'.repeat(43)}`
    relay = {
      anaAttestation: null,
      anaKey: null,
      messages: [],
      conversation: { id: conversation, com: { uid: BIA, handle: 'bia.teste', nome: 'Bia', retrato: null, especie: 'pessoa' }, estado: 'ativa', iniciadaPor: BIA, criadaEm: now() - 100, atualizadaEm: now() - 50, ultimaMensagemEm: null, mensagens: 0, pedido: null },
    }
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const body = typeof init.body === 'string' ? init.body : ''
      sent.push({ url: String(url), body })
      const b = body ? JSON.parse(body) : {}
      if (url === '/api/person/attestation') {
        relay.anaAttestation = attest(ANA, 'ana.teste', b.key)
        return json({ attestation: relay.anaAttestation })
      }
      if (url === '/api/person/publish') {
        const o = b.objeto
        // the relay's own checks on form and signature, as it would do them
        expect(P.validateObject(o).ok).toBe(true)
        expect(P.objectSignatureMatches(o, (relay.anaAttestation as { chave: string }).chave)).toBe(true)
        expect(P.checkPersonObject(o)).toBeNull()
        if (o.tipo === 'chave-de-cifra') relay.anaKey = o
        if (o.tipo === 'mensagem') {
          if (o.corpo.chaveDe !== (relay.anaKey as { corpo: { chave: string } }).corpo.chave || o.corpo.chavePara !== bia.cipher.publicKey) return json({ erro: { codigo: 'chave_de_cifra_desatualizada' } }, 409)
          relay.messages.unshift({ objeto: o })
        }
        return json({ estado: 'aceito', id: o.id }, 201)
      }
      if (url === '/api/person/read') {
        const p = String(b.path)
        expect(b.auth).toMatch(new RegExp(`^Rover-Assinatura uid=${ANA}, `))
        if (p === `/v1/rovers/${BIA}`) return json({ uid: BIA, atestado: biaAttestation })
        if (p === `/v1/rovers/${ANA}`) return json({ uid: ANA, atestado: relay.anaAttestation })
        if (p === `/v1/rovers/${BIA}/chave-de-cifra`) return json({ objeto: biaKeyObject })
        if (p === `/v1/rovers/${ANA}/chave-de-cifra`) return relay.anaKey ? json({ objeto: relay.anaKey }) : json({ erro: { codigo: 'nao_encontrado' } }, 404)
        if (p.startsWith(`/v1/rovers/${ANA}/conversas/${conversation}/mensagens`)) return json({ itens: relay.messages, proximo: null })
        if (p === `/v1/rovers/${ANA}/conversas/${conversation}`) return json(relay.conversation)
      }
      return json({ erro: { codigo: 'nao_encontrado' } }, 404)
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('activate, send, read: the server sees only public keys, signatures and cipher text', async () => {
    const M = await import('@/lib/person/messages')
    const issuers = [issuer.publicKey]
    expect(await M.cipherStatus(ANA, issuers)).toEqual({ local: null, current: null })
    const status = await M.activateMessages(ANA)
    expect(M.isActive(status)).toBe(true)
    expect(await M.cipherStatus(ANA, issuers)).toEqual(status)
    const stored = (await M.localCipherKey(ANA))!
    expect(stored.privateKey.extractable).toBe(false)
    expect(stored.privateKey.algorithm.name).toBe('X25519')

    const c = await M.getConversation(ANA, relay.conversation.id as string)
    const text = 'Encontro às 18h na praça, combinado? Leva o guarda-chuva.'
    const prepared = M.prepareText(text, 2000, 2)
    expect(prepared.ok).toBe(true)
    const mine = await M.sendMessage(ANA, c, text, issuers)
    expect(mine).toMatchObject({ mine: true, legible: true, texto: text })

    // Bia's protocol client decrypts what the browser sent
    const object = (relay.messages[0] as { objeto: Record<string, unknown> }).objeto
    const atBia = P.decryptMessage(object, { chavePrivadaDeCifra: bia.cipher.chavePrivada, senderNetworkPublicKey: (relay.anaAttestation as { chave: string }).chave })
    expect(atBia).toMatchObject({ ok: true, texto: text, withinRules: true })

    // Bia answers, with the protocol, to Ana's published key
    const reply = 'Combinado! Até já.'
    const r = P.encryptMessage({ texto: reply, conversa: c.id, de: BIA, para: ANA, criadoEm: now(), networkPrivateKey: bia.net.chavePrivada, chavePrivadaDeCifra: bia.cipher.chavePrivada, otherCipherPublicKey: stored.publicKey })
    relay.messages.unshift({ objeto: P.createObject({ v: '0.4', tipo: 'mensagem', autor: BIA, criadoEm: now(), previo: null, corpo: r.corpo, chavePrivada: bia.net.chavePrivada }) })
    // and a forgery: Bia's cipher text moved under a new object signed by someone else
    const eve = P.generateKeyPair()
    relay.messages.unshift({ objeto: P.createObject({ v: '0.4', tipo: 'mensagem', autor: BIA, criadoEm: now(), previo: null, corpo: r.corpo, chavePrivada: eve.chavePrivada }) })

    const page = await M.readMessages(ANA, c, issuers)
    expect(page.items.map((m) => [m.mine, m.legible, m.texto])).toEqual([
      [false, false, null],
      [false, true, reply],
      [true, true, text],
    ])

    // what the site server received: never the clear texts, never a private key
    const everything = sent.map((s) => s.body).join('\n')
    expect(everything).not.toContain(text)
    expect(everything).not.toContain('praça')
    expect(everything).not.toContain(reply)
    expect(everything).not.toMatch(/"(?:d|privateKey|pkcs8|jwk)"/)
    const published = sent.filter((s) => s.url === '/api/person/publish').map((s) => JSON.parse(s.body).objeto.tipo)
    expect(published).toEqual(['chave-de-cifra', 'mensagem'])
  })

  it('a report reveals the received text and its letter signature, which the relay check accepts', async () => {
    const M = await import('@/lib/person/messages')
    const issuers = [issuer.publicKey]
    await M.activateMessages(ANA)
    const stored = (await M.localCipherKey(ANA))!
    const c = await M.getConversation(ANA, relay.conversation.id as string)
    const text = 'mensagem que vai ser denunciada'
    const r = P.encryptMessage({ texto: text, conversa: c.id, de: BIA, para: ANA, criadoEm: now(), networkPrivateKey: bia.net.chavePrivada, chavePrivadaDeCifra: bia.cipher.chavePrivada, otherCipherPublicKey: stored.publicKey })
    const msg = P.createObject({ v: '0.4', tipo: 'mensagem', autor: BIA, criadoEm: now(), previo: null, corpo: r.corpo, chavePrivada: bia.net.chavePrivada })
    relay.messages.unshift({ objeto: msg })
    const [item] = (await M.readMessages(ANA, c, issuers)).items
    expect(() => M.reportMessage({ ...item, mine: true }, 'spam')).toThrow()
    await M.reportMessage(item, 'assedio')
    const report = JSON.parse(sent.filter((s) => s.url === '/api/person/publish').at(-1)!.body).objeto
    expect(report).toMatchObject({ v: '0.4', tipo: 'mensagem-denuncia', previo: null, corpo: { mensagem: msg.id, motivo: 'assedio', texto: text } })
    expect(P.letterMatches({ conversa: c.id, criadoEm: msg.criadoEm, de: BIA, iv: msg.corpo.iv, para: ANA, texto: text }, report.corpo.assinatura, bia.net.publicKey)).toBe(true)
  })

  it('the text rules refuse what the protocol refuses, before anything is encrypted', async () => {
    const M = await import('@/lib/person/messages')
    const refuse = (t: string, max = 2000, links = 2) => M.prepareText(t, max, links)
    for (const [t, problem] of [
      ['', 'empty'],
      ['   \n  ', 'empty'],
      ['a'.repeat(2001), 'long'],
      ['<b>oi</b>', 'html'],
      ['javascript:alert(1)', 'link'],
      ['veja http://exemplo.com', 'link'],
      ['https://a.com https://b.com https://c.com', 'links'],
      ['https://bit.ly/x', 'link'],
      ['https://exemplo.com/?utm_source=x', 'link'],
      ['https://192.168.0.1/', 'link'],
      ['meu email é ana@exemplo.com', 'leak'],
      ['sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD', 'leak'],
    ] as const) {
      expect(refuse(t), t).toEqual({ ok: false, problem })
    }
    expect(refuse('https://exemplo.com', 280, 0)).toEqual({ ok: false, problem: 'links' })
    // what passes here passes the protocol's own rules for a message
    for (const t of ['Oi! Tudo bem?', '  com espaço em volta  ', 'linha 1\n\n\n\nlinha 2', 'veja https://folgali.com/pt/linha', 'olá 🙂 até amanhã', 'é acento combinado']) {
      const p = refuse(t)
      expect(p.ok, t).toBe(true)
      if (p.ok) expect(P.validateText(p.text, P.MESSAGE_TEXT_RULES), t).toBeNull()
    }
  })
})
