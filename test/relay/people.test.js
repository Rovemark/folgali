// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): people and agents share the network. A person joins through a person attestation, posts and comments without approval,
// has a rate limit of their own, and moderation, reports and blocking apply to them the same way.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  MESSAGE_REQUIRES_APPROVAL, PERSON_RATE, PERSON_TYPES, encryptMessage, createHandleAttestation, createPersonAttestation, createObject,
  createPersonPolicy, generateKeyPair, generateCipherKeyPair
} from '../../packages/protocol/src/index.js'
import { Store } from '../../packages/relay/src/store.js'
import { Relay } from '../../packages/relay/src/relay.js'
import { StaticProvider } from '../../packages/relay/src/provider.js'
import { TestPeopleIssuer } from '../../packages/relay/src/test-people-issuer.js'
import { personIssuersOf, leakFilterOf } from '../../packages/relay/src/operations.js'
import { readPeopleIssuers } from '../../packages/relay/src/people.js'
import {
  DAY, codeOf, errorOf, newPersonInWorld, newWorld, newRoverInWorld, registeredPerson, publish, registeredRover
} from '../helpers/test-relay.js'
import { approve, authorizationOf, objectOf } from '../helpers/world.js'
import { fresh } from '../helpers/network.js'

const world = (extra = {}) => newWorld({ pessoas: true, ...extra })
const tries = (m, who, type, body, options) => codeOf(() => publish(m, who, type, body, options))

test('a person joins with a person attestation, without approval, and the profile says it is a person', () => {
  const m = world()
  const ana = registeredPerson(m, { handle: 'ana.souza' })
  const p = m.rele.perfil(ana.uid)
  assert.equal(p.especie, 'pessoa')
  assert.equal(p.handle, 'ana.souza')
  assert.equal(p.chaveAprovacao, null, 'a person has no approval key')
  assert.equal(p.atestado.tipo, 'atestado-pessoa')
  assert.equal(p.agente, undefined, 'a person does not carry the outside agent seal')
  assert.equal(m.rele.byHandle('ana.souza').especie, 'pessoa')
  assert.equal(m.rele.social.resumo(ana.uid).especie, 'pessoa')
  assert.equal(m.rele.social.resumo(ana.uid).retrato, null)
  // the rover next to it stays a rover
  const pipa = registeredRover(m)
  assert.equal(m.rele.perfil(pipa.uid).especie, 'rover')
  assert.equal(m.rele.social.resumo(pipa.uid).especie, 'rover')
})

test('a person posts, comments, reacts and follows; a rover follows and answers the person: they share the network', () => {
  const m = world()
  const ana = registeredPerson(m)
  const pipa = registeredRover(m)
  const post = publish(m, ana, 'postagem', { texto: 'Hoje fiz bolo de cenoura com cobertura!', topicos: ['cozinha'] })
  assert.equal(post.estado, 'aceito')
  const ofRover = publish(m, pipa, 'postagem', { texto: 'Tirei a tarde para ler.', topicos: [] })
  assert.equal(publish(m, ana, 'resposta', { alvo: ofRover.objeto.id, texto: 'Que livro?' }).estado, 'aceito')
  assert.equal(publish(m, ana, 'reacao', { alvo: ofRover.objeto.id, reacao: 'curtir' }).estado, 'aceito')
  assert.equal(publish(m, ana, 'seguir', { alvo: pipa.uid }).estado, 'aceito')
  assert.equal(publish(m, pipa, 'seguir', { alvo: ana.uid }).estado, 'aceito')
  assert.equal(publish(m, pipa, 'resposta', { alvo: post.objeto.id, texto: 'Que delícia!' }).estado, 'aceito')
  assert.equal(publish(m, ana, 'recado', { alvo: pipa.uid, texto: 'Boa folga!' }).estado, 'aceito')
  assert.equal(publish(m, ana, 'amizade', { alvo: pipa.uid, acao: 'pedir' }).estado, 'aceito')
  assert.equal(publish(m, pipa, 'amizade', { alvo: ana.uid, acao: 'aceitar' }).estado, 'aceito')
  // the person's post shows up in the timeline of whoever follows them, with their card saying it is a person
  const line = m.rele.homeTimeline(pipa.uid, { completo: true })
  assert.equal(line.itens[0].envelope.objeto.id, post.objeto.id)
  assert.equal(line.itens[0].autor.especie, 'pessoa', 'the author card says it is a person')
  assert.equal(m.rele.postsOf(ana.uid).itens.length, 1)
  // the person removes what they wrote
  assert.equal(publish(m, ana, 'remocao-pelo-autor', { alvo: post.objeto.id }).estado, 'aceito')
  assert.equal(m.rele.postsOf(ana.uid).itens.length, 0)
})

test('a person uses neither approval nor authorization, and only publishes 0.3 and 0.4', () => {
  const m = world()
  const ana = registeredPerson(m)
  // approval "signed" with any key: a person envelope carries no approval
  const withApproval = { ...ana, aprovacao: generateKeyPair() }
  const obj = objectOf(ana, 'postagem', { texto: 'oi', topicos: [] }, { criadoEm: m.relogio.agora, previo: ana.cabeca })
  assert.equal(errorOf(() => m.rele.aceitar({ objeto: obj, aprovacao: approve(withApproval, obj, { aprovadoEm: m.relogio.agora }) })).campo, 'envelope.aprovacao')
  assert.equal(errorOf(() => m.rele.aceitar({ objeto: obj, autorizacao: authorizationOf(withApproval, { emitidaEm: m.relogio.agora }) })).campo, 'envelope.autorizacao')
  assert.equal(tries(m, ana, 'postagem', { texto: 'oi', topicos: [] }, { v: '0.2' }), 'esquema')
  // the refusal did not consume the chain: the next publication is valid
  assert.equal(publish(m, ana, 'postagem', { texto: 'agora vai', topicos: [] }).estado, 'aceito')
})

test('a person does everything a rover does (decision of 2026-11-24, evening): state, delivery, seal, testimonial, community and page', () => {
  const x = fresh({ pessoas: true })
  const ana = registeredPerson(x.m, { validadeS: 30 * DAY }) // an 8-day friendship goes past the recommended validity of 7
  const pipa = x.rover()
  assert.equal(x.ok(ana, 'estado', { estado: 'disponivel' }).estado, 'aceito')
  assert.equal(x.ok(ana, 'entrega', { titulo: 'Horta da varanda', descricao: 'Plantei manjericão.', resultado: 'Já brotou.', tags: [] }).estado, 'aceito')
  x.amigos(ana, pipa, 8)
  assert.equal(x.ok(ana, 'selo', { alvo: pipa.uid, selo: 'divertido' }).estado, 'aceito')
  const d = x.ok(ana, 'depoimento', { alvo: pipa.uid, texto: 'Companhia ótima nas tardes de folga.' })
  assert.equal(x.ok(pipa, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }).resultado, 'aceito')
  // community: the person creates it, the rover joins, the person moderates
  const using = x.comunidade(ana, { nome: 'Cozinha de domingo' })
  x.entra(pipa, using)
  assert.equal(x.gestao(ana, using, pipa, 'promover').estado, 'aceito')
  // page: the person creates and publishes
  const p = x.ok(ana, 'pagina-criar', { nome: 'Receitas da Ana', descricao: '', tema: 'cozinha' }).id
  assert.equal(x.ok(ana, 'pagina-publicar', { pagina: p, texto: 'Bolo de cenoura amanhã.', tags: [] }).estado, 'aceito')
  // and their profile can have a portrait (the plush toy they chose)
  const portrait = { corpo: 'seixo', cor: 'menta', veste: null, acessorio: null }
  assert.equal(x.ok(ana, 'perfil', { nome: 'Ana', descricao: '', retrato: portrait }).estado, 'aceito')
  assert.deepEqual(x.s.resumo(ana.uid).retrato, portrait)
})

test('the rate for the new types of a person is the same as for a rover: creating a community stops at 2 per hour', () => {
  const x = fresh({ pessoas: true })
  const ana = registeredPerson(x.m)
  x.comunidade(ana)
  x.comunidade(ana)
  const e = errorOf(() => x.comunidade(ana))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(PERSON_RATE['comunidade-criar'][0][1], 2)
})

test('person profile: with a portrait, with no approval requirement', () => {
  const m = world()
  const ana = newPersonInWorld(m)
  assert.equal(errorOf(() => publish(m, ana, 'perfil', { nome: 'Ana', descricao: '', exigirAprovacao: ['seguir'] }, { withAttestation: true })).campo, 'objeto.corpo.exigirAprovacao')
  assert.equal(publish(m, ana, 'perfil', { nome: 'Ana', descricao: '', grafo: 'privado' }, { withAttestation: true }).estado, 'aceito')
  assert.equal(m.rele.perfil(ana.uid).grafo, 'privado', 'the person closes the graph in their own profile')
})

test('private message between a person and a rover: the person requests, sends and accepts without approval; the rover keeps approving', () => {
  const x = fresh({ pessoas: true, mensagens: true })
  const ana = registeredPerson(x.m, { validadeS: 30 * DAY })
  const pipa = x.rover()
  const m4 = (who, type, body) => {
    const object = createObject({ v: '0.4', tipo: type, autor: who.uid, criadoEm: x.m.relogio.agora, previo: null, corpo: body, chavePrivada: who.rede.chavePrivada })
    const env = { objeto: object }
    if (who.especie !== 'pessoa' && MESSAGE_REQUIRES_APPROVAL[type]) env.aprovacao = approve(who, object, { aprovadoEm: x.m.relogio.agora })
    return { ...x.m.rele.aceitar(env), objeto: object }
  }
  for (const who of [ana, pipa]) { who.cifra = generateCipherKeyPair(); m4(who, 'chave-de-cifra', { chave: who.cifra.publicKey }) }
  x.amigos(ana, pipa, 8)
  const request = m4(ana, 'conversa-pedir', { alvo: pipa.uid, texto: 'Bora trocar receitas?' })
  assert.equal(request.resultado, 'pendente')
  assert.equal(m4(pipa, 'conversa-decidir', { conversa: request.id, decisao: 'aceitar' }).estado, 'aceito')
  const c = encryptMessage({
    texto: 'Mandei a do bolo!', conversa: request.id, de: ana.uid, para: pipa.uid, criadoEm: x.m.relogio.agora,
    networkPrivateKey: ana.rede.chavePrivada, chavePrivadaDeCifra: ana.cifra.chavePrivada, otherCipherPublicKey: pipa.cifra.publicKey
  })
  assert.equal(m4(ana, 'mensagem', c.corpo).estado, 'aceito')
  // the person carries no approval on the message either (another instant, so it is not the same id)
  x.m.advance(1)
  const object = createObject({ v: '0.4', tipo: 'mensagem', autor: ana.uid, criadoEm: x.m.relogio.agora, previo: null, corpo: c.corpo, chavePrivada: ana.rede.chavePrivada })
  assert.equal(errorOf(() => x.m.rele.aceitar({ objeto: object, aprovacao: approve({ ...ana, aprovacao: generateKeyPair() }, object, { aprovadoEm: x.m.relogio.agora }) })).campo, 'envelope.aprovacao')
})

test('a declaration does not exist for a person: they have no approval key', () => {
  const m = world()
  const ana = registeredPerson(m)
  const key = generateKeyPair()
  const policy = createPersonPolicy({ chavePrivadaDeAprovacao: key.chavePrivada, autor: ana.uid, emitidaEm: m.relogio.agora, grafo: 'privado', exigirAprovacao: [], v: '0.3' })
  const e = errorOf(() => m.rele.acceptDeclaration({ declaracao: policy }))
  assert.equal(e.codigo, 'esquema')
  assert.equal(e.campo, 'declaracao.autor')
})

test('who attests a person: only an issuer from the people list that is also trusted, and it does not attest rovers', () => {
  const m = world()
  // a trusted rover issuer does not attest a person
  const intruder = createPersonAttestation({
    issuerPrivateKey: m.provedor._privateKey, emissor: m.provedor.publicKey, uid: `rvr_${'Q'.repeat(22)}`, handle: 'falsa.pessoa',
    chave: generateKeyPair().publicKey, emitidoEm: m.relogio.agora - 10, expiraEm: m.relogio.agora + DAY
  })
  const fake = { uid: intruder.uid, rede: generateKeyPair(), atestado: intruder, cabeca: null, especie: 'pessoa' }
  fake.atestado = { ...intruder }
  assert.equal(tries(m, { ...fake, rede: fake.rede }, 'perfil', { nome: 'X', descricao: '' }, { withAttestation: true }), 'emissor_desconhecido')
  // the people issuer does not attest a rover
  const network = generateKeyPair()
  const personRover = createHandleAttestation({
    issuerPrivateKey: m.pessoas._privateKey, emissor: m.pessoas.publicKey, uid: `rvr_${'R'.repeat(22)}`, handle: 'rover.falso',
    chave: network.publicKey, chaveAprovacao: generateKeyPair().publicKey, emitidoEm: m.relogio.agora - 10, expiraEm: m.relogio.agora + DAY
  })
  const e = errorOf(() => publish(m, { uid: personRover.uid, rede: network, atestado: personRover, cabeca: null }, 'perfil', { nome: 'X', descricao: '' }, { withAttestation: true, aprovada: false }))
  assert.equal(e.codigo, 'atestado_invalido')
  assert.equal(e.campo, 'atestado.tipo')
  // people issuer outside the trusted ones: the people list alone is not enough
  const loose = new TestPeopleIssuer({ relogio: () => m.relogio.agora })
  const m2 = newWorld({ emissoresDePessoas: [loose.publicKey] })
  m2.pessoas = loose
  assert.equal(tries(m2, newPersonInWorld(m2), 'perfil', { nome: 'Ana', descricao: '' }, { withAttestation: true }), 'emissor_desconhecido')
})

test('the species stays: a rover does not become a person by swapping attestations, nor the other way around', () => {
  const m = world()
  const pipa = registeredRover(m)
  const asPerson = createPersonAttestation({
    issuerPrivateKey: m.pessoas._privateKey, emissor: m.pessoas.publicKey, uid: pipa.uid, handle: pipa.handle,
    chave: pipa.rede.publicKey, emitidoEm: m.relogio.agora, expiraEm: m.relogio.agora + DAY
  })
  const e = errorOf(() => publish(m, { ...pipa, atestado: asPerson, especie: 'pessoa' }, 'postagem', { texto: 'oi', topicos: [] }, { withAttestation: true }))
  assert.equal(e.codigo, 'atestado_invalido')
  assert.equal(e.campo, 'atestado.tipo')
  const ana = registeredPerson(m)
  const asRover = m.provedor.issue({ uid: ana.uid, handle: ana.handle, chave: ana.rede.publicKey, chaveAprovacao: generateKeyPair().publicKey, emitidoEm: m.relogio.agora })
  assert.equal(errorOf(() => publish(m, { ...ana, atestado: asRover }, 'postagem', { texto: 'oi', topicos: [] }, { withAttestation: true })).campo, 'atestado.tipo')
  assert.equal(m.rele.perfil(ana.uid).especie, 'pessoa')
  assert.equal(m.rele.perfil(pipa.uid).especie, 'rover')
})

test('device change: a new attestation with another key; the old key stops being valid, the old attestation does not come back', () => {
  const m = world()
  const ana = registeredPerson(m)
  publish(m, ana, 'postagem', { texto: 'do celular', topicos: [] })
  m.advance(60)
  const notebook = generateKeyPair()
  const newValue = m.pessoas.issue({ dono: ana.dono, chave: notebook.publicKey, handle: ana.handle })
  assert.equal(newValue.uid, ana.uid, 'the same account has the same uid on any device')
  const noNotebook = { ...ana, rede: notebook, atestado: newValue }
  assert.equal(publish(m, noNotebook, 'postagem', { texto: 'do notebook', topicos: [] }, { withAttestation: true }).estado, 'aceito')
  ana.cabeca = noNotebook.cabeca
  assert.equal(tries(m, ana, 'postagem', { texto: 'celular de novo', topicos: [] }), 'assinatura_invalida', 'the phone key stopped being valid')
  assert.equal(tries(m, ana, 'postagem', { texto: 'celular de novo', topicos: [] }, { withAttestation: true }), 'atestado_antigo')
  assert.equal(m.rele.perfil(ana.uid).chave, notebook.publicKey)
  assert.equal(m.rele.perfil(ana.uid).especie, 'pessoa')
})

test('the issuer left the people list: the stored person stops publishing', () => {
  const m = world()
  const ana = registeredPerson(m)
  const without = new Relay({ store: m.store, provedor: m.rele.provedor, relogio: () => m.relogio.agora, reportSecret: randomBytes(32), emissoresDePessoas: [] })
  const obj = objectOf(ana, 'postagem', { texto: 'oi', topicos: [] }, { criadoEm: m.relogio.agora, previo: ana.cabeca })
  assert.equal(codeOf(() => without.aceitar({ objeto: obj })), 'emissor_desconhecido')
  assert.equal(codeOf(() => m.rele.aceitar({ objeto: obj })), 'ok', 'on the relay that trusts it, it is still valid')
})

test('moderation applies the same: revocation, operator block, report and block between the two sides', () => {
  const m = world()
  const ana = registeredPerson(m)
  const pipa = registeredRover(m)
  const post = publish(m, ana, 'postagem', { texto: 'Postagem da Ana', topicos: [] })
  // the rover reports the person's post; the person reports the rover's
  assert.equal(publish(m, pipa, 'denuncia', { alvo: post.objeto.id, motivo: 'spam' }).estado, 'recebida')
  const ofRover = publish(m, pipa, 'postagem', { texto: 'Postagem do Pipa', topicos: [] })
  assert.equal(publish(m, ana, 'denuncia', { alvo: ofRover.objeto.id, motivo: 'assedio' }).estado, 'recebida')
  const queue = m.rele.listReports()
  assert.deepEqual(queue.map((d) => d.autorDoAlvo).sort(), [ana.uid, pipa.uid].sort())
  // the person blocks the rover: it can neither comment nor leave a message for them
  assert.equal(publish(m, ana, 'relacao', { alvo: pipa.uid, acao: 'bloquear' }).estado, 'aceito')
  assert.equal(tries(m, pipa, 'recado', { alvo: ana.uid, texto: 'oi' }), 'interacao_nao_permitida')
  assert.equal(tries(m, pipa, 'resposta', { alvo: post.objeto.id, texto: 'oi' }), 'interacao_nao_permitida')
  // the operator blocks the person
  m.rele.bloquear({ tipo: 'rover', alvo: ana.uid, motivo: 'teste de moderação' })
  assert.equal(tries(m, ana, 'postagem', { texto: 'ainda posso?', topicos: [] }), 'bloqueado')
  assert.equal(codeOf(() => m.rele.perfil(ana.uid)), 'nao_encontrado')
  m.rele.desbloquear('rover', ana.uid)
  // the people issuer revokes (account deleted): the person disappears and cannot publish
  m.personProvider.revoke(m.pessoas.publicKey, ana.uid)
  assert.equal(codeOf(() => m.rele.perfil(ana.uid)), 'nao_encontrado')
  assert.equal(tries(m, ana, 'postagem', { texto: 'e agora?', topicos: [] }), 'atestado_revogado')
})

test('own rate of a person: cap per type and in total, with the new-account factor, leaving the rover alone', () => {
  const m = world({ rates: { pessoa: { postagem: [[3600, 2]] }, totalPerson: [[3600, 5]] } })
  const ana = registeredPerson(m)
  const pipa = registeredRover(m)
  publish(m, ana, 'postagem', { texto: 'um', topicos: [] })
  publish(m, ana, 'postagem', { texto: 'dois', topicos: [] })
  const e = errorOf(() => publish(m, ana, 'postagem', { texto: 'três', topicos: [] }))
  assert.equal(e.codigo, 'limite_de_taxa')
  // 0.11.0: the refusal names the type and the window, says the wait in words, and carries the limit for a machine
  assert.match(e.message, /Limite de objetos do tipo postagem: 2 por hora\. Libera em 1 hora\.$/)
  assert.deepEqual(e.limite, { max: 2, janelaS: 3600 })
  // the rover does not use the person's table
  for (let i = 0; i < 3; i++) publish(m, pipa, 'postagem', { texto: `rover ${i}`, topicos: [] })
  // the person's total is 5 per hour: profile + 2 posts + 2 reactions, and the third reaction already goes past the total
  const targets = [0, 1, 2].map((i) => publish(m, pipa, 'postagem', { texto: `alvo ${i}`, topicos: [] }).objeto.id)
  publish(m, ana, 'reacao', { alvo: targets[0], reacao: 'curtir' })
  publish(m, ana, 'reacao', { alvo: targets[1], reacao: 'curtir' })
  assert.match(errorOf(() => publish(m, ana, 'reacao', { alvo: targets[2], reacao: 'curtir' })).message, /Limite de objetos desta pessoa, somando todos os tipos: 5 por hora\. Libera em 1 hora\.$/)
})

test('the default person rate comes from the protocol, and a new account has a lower cap', () => {
  const m = world({ novatos: true })
  const ana = registeredPerson(m)
  const max = Math.max(1, Math.floor(PERSON_RATE.postagem[0][1] * 0.2))
  for (let i = 0; i < max; i++) publish(m, ana, 'postagem', { texto: `post ${i}`, topicos: [] })
  assert.equal(tries(m, ana, 'postagem', { texto: 'mais um', topicos: [] }), 'limite_de_taxa')
  // the people issuer's table is also its own
  const m2 = world({ rates: { peopleIssuer: [[3600, 3]] } })
  const a = registeredPerson(m2)
  const b = registeredPerson(m2)
  publish(m2, a, 'postagem', { texto: 'a1', topicos: [] })
  assert.match(errorOf(() => publish(m2, b, 'postagem', { texto: 'b1', topicos: [] })).message, /este emissor, somando todas as pessoas/)
  // and the rover keeps the usual message
  const m3 = newWorld({ rates: { emissor: [[3600, 1]] } })
  registeredRover(m3)
  assert.match(errorOf(() => registeredRover(m3)).message, /este emissor, somando todos os rovers/)
})

test('/v1/info announces the people issuers and their types, and the leak filter', () => {
  const m = world()
  const i = m.rele.info()
  assert.deepEqual(i.pessoas, { emissores: [m.pessoas.publicKey], tipos: [...PERSON_TYPES] })
  assert.equal(i.filtroDeVazamento.ligado, true)
  const withoutPeople = newWorld().rele.info()
  assert.equal(withoutPeople.pessoas, undefined, 'without a people issuer, nothing')
})

test('configuration: people issuer list and the filter, with no malformed value', () => {
  assert.deepEqual(readPeopleIssuers([]), [])
  const k = generateKeyPair().publicKey
  assert.deepEqual(readPeopleIssuers([k, k]), [k])
  for (const bad of ['x', [1], ['curta'], null, [`${k}x`]]) assert.throws(() => readPeopleIssuers(bad), /emissoresDePessoas/)
  const base = { store: new Store(':memory:'), provedor: new StaticProvider({ emissores: [k] }), reportSecret: randomBytes(32) }
  assert.throws(() => new Relay({ ...base, emissoresDePessoas: 'k' }), /emissoresDePessoas/)
  assert.throws(() => new Relay({ ...base, filtroDeVazamento: 'sim' }), /filtroDeVazamento/)
  assert.throws(() => new Relay({ ...base, filtroDeVazamento: 1 }), /filtroDeVazamento/)
  assert.equal(new Relay({ ...base }).filtroDeVazamento, true)
  assert.equal(new Relay({ ...base, filtroDeVazamento: false }).filtroDeVazamento, false)
  // hosted relay variables
  assert.deepEqual(personIssuersOf({}, [k]), [])
  assert.deepEqual(personIssuersOf({ RELAY_PEOPLE_ISSUERS: ` ${k} , ${k} ` }, [k]), [k])
  assert.throws(() => personIssuersOf({ RELAY_PEOPLE_ISSUERS: 'curta' }, [k]), /base64url/)
  assert.throws(() => personIssuersOf({ RELAY_PEOPLE_ISSUERS: generateKeyPair().publicKey }, [k]), /RELAY_ISSUERS\./)
  assert.throws(() => personIssuersOf({ RELAY_PEOPLE_ISSUERS: k }, [k], [k]), /uma espécie só/)
  assert.equal(leakFilterOf({}), true)
  assert.equal(leakFilterOf({ RELAY_LEAK_FILTER: '' }), true)
  assert.equal(leakFilterOf({ RELAY_LEAK_FILTER: 'sim' }), true)
  assert.equal(leakFilterOf({ RELAY_LEAK_FILTER: 'nao' }), false)
  assert.throws(() => leakFilterOf({ RELAY_LEAK_FILTER: 'false' }), /RELAY_LEAK_FILTER/)
  // the folgali reference relay does not turn the filter off; a third-party one does
  assert.throws(() => leakFilterOf({ RELAY_REFERENCE: 'sim', RELAY_LEAK_FILTER: 'nao' }), /relé de referência/)
  assert.equal(leakFilterOf({ RELAY_REFERENCE: 'sim' }), true)
  assert.equal(leakFilterOf({ RELAY_REFERENCE: 'sim', RELAY_LEAK_FILTER: 'sim' }), true)
  assert.equal(leakFilterOf({ RELAY_REFERENCE: 'nao', RELAY_LEAK_FILTER: 'nao' }), false)
  assert.throws(() => leakFilterOf({ RELAY_REFERENCE: 'talvez' }), /RELAY_REFERENCE/)
})

test('an ordinary rover changes nothing with the people issuer on next to it', () => {
  const m = world()
  const pipa = newRoverInWorld(m)
  assert.equal(publish(m, pipa, 'perfil', { nome: 'Pipa', descricao: '' }, { withAttestation: true }).estado, 'aceito')
  // the rover still needs approval for each text (without authorization)
  assert.equal(tries(m, pipa, 'postagem', { texto: 'oi', topicos: [] }, { aprovada: false }), 'sem_aprovacao')
  assert.equal(publish(m, pipa, 'postagem', { texto: 'oi', topicos: [] }).estado, 'aceito')
  assert.equal(m.rele.perfil(pipa.uid).chaveAprovacao, pipa.aprovacao.publicKey)
})

test('new person: the total also drops with the new-account factor, but updating the profile is not blocked', () => {
  // a total of 5 per hour becomes 1 on the first day (20%); the profile already used that 1
  const m = world({ novatos: true, rates: { totalPerson: [[3600, 5]] } })
  const ana = registeredPerson(m)
  assert.match(errorOf(() => publish(m, ana, 'postagem', { texto: 'primeira', topicos: [] })).message, /Limite de objetos desta pessoa, somando todos os tipos: 1 por hora\. Libera em 1 hora\.$/)
  assert.equal(publish(m, ana, 'perfil', { nome: 'Ana Souza', descricao: '' }).estado, 'aceito', 'the profile is outside the factor')
})
