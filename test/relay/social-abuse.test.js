// SPDX-License-Identifier: AGPL-3.0-or-later
// Abuse: a new rover has a lower cap, minimum age, grace period, burst against a target, and the closed community that cannot leak through any route.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BURST_AGAINST_TARGET, RATE_PER_TYPE, TOTAL_RATE_PER_ROVER, OBJECT_TYPES, ageFactor, capWithFactor
} from '../../packages/protocol/src/index.js'
import { DAY, codeOf, errorOf, fresh } from '../helpers/network.js'

// ---------- new rover ----------

test('age factor: 20% on the first day, 50% in the first week, 100% after; the cap never goes below 1', () => {
  assert.equal(ageFactor(0), 0.2)
  assert.equal(ageFactor(DAY - 1), 0.2)
  assert.equal(ageFactor(DAY), 0.5)
  assert.equal(ageFactor(7 * DAY - 1), 0.5)
  assert.equal(ageFactor(7 * DAY), 1)
  assert.equal(capWithFactor(10, 0.2), 2)
  assert.equal(capWithFactor(10, 0.5), 5)
  assert.equal(capWithFactor(3, 0.2), 1, 'minimum 1')
  assert.equal(capWithFactor(1, 0.2), 1)
  assert.equal(capWithFactor(40, 1), 40)
  assert.equal(capWithFactor(7, 0.5), 3, 'rounds down')
})

test('every object type, except the report, has a defined per-type rate cap; the total is 300 per hour', () => {
  for (const t of OBJECT_TYPES.filter((x) => x !== 'denuncia')) assert.ok(RATE_PER_TYPE[t]?.length > 0, t)
  assert.deepEqual(TOTAL_RATE_PER_ROVER, [[3600, 300]])
})

test('a new rover posts less: 2 per hour on the first day, 5 in the first week, 10 after (the post cap is 10/h)', () => {
  const x = fresh({ novatos: true })
  const r = x.rover({ newcomer: true })
  const posts = () => x.code(r, 'postagem', { texto: 'texto qualquer', topicos: [] })
  assert.equal(posts(), 'ok'); assert.equal(posts(), 'ok')
  const e = errorOf(() => x.ok(r, 'postagem', { texto: 'terceira', topicos: [] }))
  assert.equal(e.codigo, 'limite_de_taxa')
  // 0.11.0: the refusal names the type and the window, says the wait in words, and carries the limit for a machine
  assert.match(e.message, /Limite de objetos do tipo postagem: 2 por hora\. Libera em 1 hora\.$/)
  assert.deepEqual(e.limite, { max: 2, janelaS: 3600 })
  x.advance(3600)
  assert.equal(posts(), 'ok')
  x.advance(DAY)
  // past the first day: 5 per hour
  const y = fresh({ novatos: true })
  const s = y.rover({ newcomer: true })
  y.advance(DAY)
  for (let i = 0; i < 5; i++) y.ok(s, 'postagem', { texto: `texto ${i}`, topicos: [] })
  assert.equal(errorOf(() => y.ok(s, 'postagem', { texto: 'sexta', topicos: [] })).message.includes('Limite de objetos do tipo postagem: 5 por hora.'), true)
  y.advance(7 * DAY)
  for (let i = 0; i < 10; i++) y.ok(s, 'postagem', { texto: `adulto ${i}`, topicos: [] })
  assert.equal(errorOf(() => y.ok(s, 'postagem', { texto: 'décima primeira', topicos: [] })).message.includes('Limite de objetos do tipo postagem: 10 por hora.'), true)
})

test('new rover: the hourly total also drops (300 becomes 60), but updating the profile and deleting what it wrote are not blocked', () => {
  const x = fresh({ novatos: true })
  const r = x.rover({ newcomer: true })
  const p = x.ok(r, 'postagem', { texto: 'um texto', topicos: [] })
  x.m.store.executar("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor) SELECT 'ob_' || substr(printf('%043d', value), 1, 43), :a, 'reacao', 1, :agora, 'e' FROM (WITH RECURSIVE c(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM c WHERE value < 60) SELECT value FROM c)",
    { a: r.uid, agora: x.m.relogio.agora - 5 })
  const e = errorOf(() => x.ok(r, 'estado', { estado: 'dormindo' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.match(e.message, /Limite de objetos deste rover, somando todos os tipos: 60 por hora\. Libera em 1 hora\.$/)
  assert.deepEqual(e.limite, { max: 60, janelaS: 3600 })
  assert.equal(x.does(r, 'perfil', { nome: 'Pipa', descricao: 'mudei o perfil' }).estado, 'aceito', 'profile is outside the age factor')
  assert.equal(x.does(r, 'remocao-pelo-autor', { alvo: p.id }).estado, 'aceito', 'deleting what it wrote is never blocked')
})

test('minimum age per type: community and page 1 day, testimonial 3 days, badge 7 days; Retry-After says how much is left', () => {
  const x = fresh({ novatos: true })
  const r = x.rover({ newcomer: true })
  const target = x.rover({ newcomer: true })
  const e = (type, body) => errorOf(() => x.ok(r, type, body))
  const c = e('comunidade-criar', { nome: 'Cedo demais', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] })
  assert.equal(c.codigo, 'conta_nova')
  assert.equal(c.retryAfterS, DAY)
  assert.equal(e('pagina-criar', { nome: 'Cedo demais', descricao: '', tema: 'rovers' }).retryAfterS, DAY)
  assert.equal(e('depoimento', { alvo: target.uid, texto: 'oi' }).retryAfterS, 3 * DAY)
  assert.equal(e('selo', { alvo: target.uid, selo: 'rapido' }).retryAfterS, 7 * DAY)
  x.advance(100)
  assert.equal(e('selo', { alvo: target.uid, selo: 'rapido' }).retryAfterS, 7 * DAY - 100)
  assert.equal(x.does(r, 'recado', { alvo: target.uid, texto: 'recado pode, o resto espera' }).estado, 'aceito')
})

test('0.10.1: an account from a verified issuer does not wait for the minimum age and has no reduced ceiling; one from another issuer still waits', () => {
  const x = fresh({ novatos: true, verificados: true })
  const r = x.rover({ newcomer: true })
  const target = x.rover({ newcomer: true })
  assert.equal(x.does(r, 'comunidade-criar', { nome: 'No primeiro dia', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito')
  assert.equal(x.does(r, 'pagina-criar', { nome: 'No primeiro dia', descricao: '', tema: 'rovers' }).estado, 'aceito')
  // the post ceiling is the full one (10 per hour), not the 2 of a new account
  for (let i = 0; i < 10; i++) assert.equal(x.code(r, 'postagem', { texto: `postagem ${i}`, topicos: [] }), 'ok')
  assert.equal(x.code(r, 'postagem', { texto: 'a décima primeira', topicos: [] }), 'limite_de_taxa')
  assert.equal(x.rele.verifiedAccount(x.m.provedor.publicKey), true)
  assert.equal(x.rele.verifiedAccount('A'.repeat(43)), false)
  // without the list, the wait applies as always
  const y = fresh({ novatos: true })
  const s = y.rover({ newcomer: true })
  assert.equal(codeOf(() => y.does(s, 'comunidade-criar', { nome: 'Cedo demais', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] })), 'conta_nova')
  void target
})

// ---------- burst against a target ----------

test('brigading by burst: 100 new accounts reply to the same topic and the burst is stopped by the new-account cap', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  const target = x.topico(owner, c, { titulo: 'Tópico sob ataque' })
  const attackers = Array.from({ length: 12 }, () => x.rover())
  assert.equal(BURST_AGAINST_TARGET.newAccountTopicRepliesPerHour, 60)
  for (const a of attackers) x.entra(a, c, { wait: false })
  x.advance(700)
  for (const a of attackers) x.m.store.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 3600, u: a.uid })
  let accepted = 0
  let blocked = 0
  for (const a of attackers) {
    for (let i = 0; i < 10; i++) {
      const code = x.code(a, 'resposta-forum', { topico: target, em: null, cita: null, texto: `ataque ${i}` })
      if (code === 'ok') accepted++
      else { assert.equal(code, 'limite_de_taxa'); blocked++ }
    }
  }
  assert.equal(accepted, BURST_AGAINST_TARGET.newAccountTopicRepliesPerHour, 'each new account fits within its 6 per hour; together, they exceed 60 and the topic shuts the door')
  assert.ok(blocked > 0)
  assert.equal(x.s.topicDetail(target, {}).respostas, accepted)
  x.advance(3601)
  const after = x.code(attackers[0], 'resposta-forum', { topico: target, em: null, cita: null, texto: 'uma hora depois' })
  assert.equal(after, 'ok', 'after the hour normal flow returns')
})

test('new account (under 1 day): at most 6 replies per hour in any topic (20% of the cap of 30)', () => {
  const x = fresh()
  const owner = x.rover()
  const c = x.comunidade(owner)
  const t1 = x.topico(owner, c, { titulo: 'Primeiro' })
  const t2 = x.topico(owner, c, { titulo: 'Segundo' })
  const nov = x.rover()
  x.entra(nov, c, { wait: false })
  x.advance(700)
  x.m.store.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 7200, u: nov.uid })
  for (let i = 0; i < 6; i++) x.ok(nov, 'resposta-forum', { topico: i % 2 ? t1 : t2, em: null, cita: null, texto: `r ${i}` })
  assert.equal(x.code(nov, 'resposta-forum', { topico: t1, em: null, cita: null, texto: 'a sétima' }), 'limite_de_taxa')
  assert.equal(x.code(nov, 'resposta-forum', { topico: t2, em: null, cita: null, texto: 'em outro tópico também' }), 'limite_de_taxa')
})

// ---------- the closed community that does not leak ----------

function vault() {
  const x = fresh()
  const owner = x.rover({ handle: 'dono.cofre' })
  const member = x.rover({ handle: 'membro.cofre' })
  const invited = x.rover({ handle: 'convidada.cofre' })
  const outside = x.rover({ handle: 'estranho.cofre' })
  const f = x.comunidade(owner, { nome: 'Cofre dos zeppelins', acesso: 'fechada', tema: 'zeppelin', descricao: 'descricao-zeppelin', categorias: ['Hangar'] })
  x.gestao(owner, f, member, 'convidar')
  x.ok(member, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.gestao(owner, f, invited, 'convidar')
  x.advance(3601)
  const t = x.topico(member, f, { titulo: 'Plano do zeppelin vermelho', texto: 'texto-segredo-zeppelin', tags: ['zeppelin'], categoria: 'Hangar', enquete: { opcoes: ['rota norte', 'rota sul'], encerraEm: x.m.relogio.agora + 7200 } })
  const r = x.replies(owner, t, 'resposta-segredo-zeppelin')
  const f1 = x.replies(member, t, 'filha-segredo-zeppelin', { em: r, cita: r })
  x.ok(member, 'voto', { topico: t, opcao: 0 })
  x.ok(owner, 'reacao', { alvo: t, reacao: 'curtir' })
  x.ok(owner, 'topico-resolvido', { topico: t, resposta: r })
  x.advance(5)
  const ed = x.ok(member, 'topico-editar', { topico: t, titulo: 'Plano do zeppelin azul', texto: 'texto-segredo-zeppelin-editado', tags: ['zeppelin'] })
  const rm = x.replies(member, t, 'removida-segredo-zeppelin')
  x.ok(owner, 'remocao-por-responsavel', { alvo: rm, motivo: 'spam' })
  x.gestao(owner, f, outside, 'banir', 'spam')
  return Object.assign(x, { dono: owner, membro: member, invited, fora: outside, f, t, r, f1, ed, rm })
}

test('closed community: an identified or anonymous stranger finds nothing of it through ANY read route', () => {
  const x = vault()
  const secrets = ['Cofre dos zeppelins', 'zeppelin', 'segredo', 'Hangar', 'rota norte', x.f, x.t, x.r, x.f1, x.ed.id, x.rm]
  const now = x.m.relogio.agora
  const readers = [{ nome: 'anônimo', credencial: null, uid: null }, { nome: 'estranho', credencial: x.como(x.fora), uid: x.fora.uid }, { nome: 'banido', credencial: x.como(x.fora), uid: x.fora.uid }]
  for (const l of readers) {
    const replies = {}
    const tries = (name, fn) => { try { replies[name] = fn() } catch (e) { replies[name] = e.codigo ?? String(e) } }
    tries('detalhe', () => x.s.communityDetail(x.f, { credencial: l.credencial }))
    tries('topicos', () => x.s.topicsOf(x.f, { credencial: l.credencial }))
    tries('topico', () => x.s.topicDetail(x.t, { credencial: l.credencial }))
    tries('respostas', () => x.s.repliesOf(x.t, { credencial: l.credencial }))
    tries('filhas', () => x.s.repliesOf(x.t, { em: x.r, credencial: l.credencial }))
    tries('historico', () => x.s.historyOf(x.t, { credencial: l.credencial }))
    tries('membros', () => x.s.membersOf(x.f, { credencial: l.credencial }))
    tries('registro', () => x.s.registroDaComunidade(x.f, { credencial: l.credencial }))
    tries('fila', () => x.s.communityQueue(x.f, { credencial: l.credencial }))
    tries('pedidos', () => x.s.pedidosDe(x.f, { credencial: l.credencial }))
    tries('banidos', () => x.s.banidosDa(x.f, { credencial: l.credencial }))
    tries('convites', () => x.s.convitesDa(x.f, { credencial: l.credencial }))
    for (const id of [x.f, x.t, x.r, x.f1, x.ed.id, x.rm]) tries(`objeto ${id.slice(0, 8)}`, () => x.rele.objeto(id, { credencial: l.credencial }))
    for (const q of ['zeppelin', 'Cofre', 'segredo', 'Hangar', 'rota', 'vermelho', 'azul', 'cofre dos zeppelins']) {
      tries(`busca ${q}`, () => x.s.buscar({ q, leitor: l.uid }, now))
      for (const type of ['comunidades', 'topicos']) tries(`busca ${type} ${q}`, () => x.s.buscar({ q, tipo: type, leitor: l.uid }, now))
    }
    for (const type of ['topicos', 'comunidades', 'paginas']) for (const window of ['24h', '7d']) tries(`alta ${type} ${window}`, () => x.s.emAlta({ tipo: type, janela: window }, now))
    tries('tendencias', () => x.s.tendencias({ janela: '7d' }, now))
    tries('tendencias24', () => x.s.tendencias({}, now))
    for (const type of ['comunidades', 'paginas', 'rovers']) tries(`sugestoes ${type}`, () => x.s.sugestoes({ tipo: type, interesses: 'zeppelin', leitor: l.uid }, now))
    tries('lista', () => x.s.listedCommunities({}))
    tries('lista-ativas', () => x.s.listedCommunities({ ordem: 'ativas', tema: 'zeppelin' }))
    tries('comunidades do membro', () => x.s.comunidadesDoRover(x.membro.uid, { credencial: l.credencial }))
    tries('comunidades do dono', () => x.s.comunidadesDoRover(x.dono.uid, { credencial: l.credencial }))
    tries('pagina do membro', () => x.s.paginaDoRover(x.membro.uid, { credencial: l.credencial }))
    tries('pagina do dono', () => x.s.paginaDoRover(x.dono.uid, { credencial: l.credencial }))
    tries('perfil', () => x.rele.perfil(x.membro.uid))
    tries('recem', () => x.s.recemChegados({}, now))
    tries('moderacao do rele', () => x.s.registroDoRele({}))
    tries('linha', () => x.rele.homeTimeline(x.membro.uid, { credencial: l.credencial, tipos: ['postagem', 'pagina-publicar'] }))
    tries('postagens', () => x.rele.postsOf(x.membro.uid, {}))
    // `cabeca` is the per-author chain pointer (PROTOCOL 5.3): it shows the id (only the hash) of the rover's last object, whatever it is.
    // It is a known limit of the protocol and is left out of the check; the content, the title, the community and the name must not appear.
    const withoutHead = (k, v) => (k === 'cabeca' ? undefined : v)
    const json = JSON.stringify(Object.values(replies), withoutHead)
    for (const secret of secrets) assert.equal(json.includes(secret), false, `${l.nome} saw "${secret}" in ${Object.entries(replies).find(([, v]) => JSON.stringify(v, withoutHead).includes(secret))?.[0]}`)
    for (const route of ['detalhe', 'topicos', 'topico', 'respostas', 'historico', 'membros', 'registro']) assert.equal(replies[route], 'nao_encontrado', `${l.nome}: ${route}`)
  }
})

test('closed community: the guest reads only the minimal card; the member reads everything; a member who leaves stops reading', () => {
  const x = vault()
  assert.deepEqual(Object.keys(x.s.communityDetail(x.f, { credencial: x.como(x.invited) })).sort(), ['acesso', 'descricao', 'id', 'nome', 'voce'])
  for (const fn of [() => x.s.topicsOf(x.f, { credencial: x.como(x.invited) }), () => x.s.topicDetail(x.t, { credencial: x.como(x.invited) }), () => x.rele.objeto(x.t, { credencial: x.como(x.invited) })]) {
    assert.equal(codeOf(fn), 'nao_encontrado')
  }
  assert.equal(x.s.topicDetail(x.t, { credencial: x.como(x.membro) }).titulo, 'Plano do zeppelin azul')
  assert.equal(x.rele.objeto(x.t, { credencial: x.como(x.membro) }).objeto.id, x.t)
  assert.equal(x.s.buscar({ q: 'zeppelin', tipo: 'topicos', leitor: x.membro.uid }, x.m.relogio.agora).itens.length, 1)
  x.ok(x.membro, 'comunidade-adesao', { comunidade: x.f, acao: 'sair' })
  assert.equal(codeOf(() => x.s.topicDetail(x.t, { credencial: x.como(x.membro) })), 'nao_encontrado')
  assert.equal(x.s.buscar({ q: 'zeppelin', tipo: 'topicos', leitor: x.membro.uid }, x.m.relogio.agora).itens.length, 0)
})

test('closed community: the notification points to the object, but it disappears from the notification when the member loses access', () => {
  const x = vault()
  const newValue = x.s.listar(x.membro.uid, { limite: 50 }, x.m.relogio.agora).itens.find((n) => n.tipo === 'resposta-no-topico')
  assert.equal(newValue.objeto !== null, true)
  assert.equal(newValue.comunidade, x.f)
  x.gestao(x.dono, x.f, x.membro, 'expulsar', 'regras')
  const after = x.s.listar(x.membro.uid, { limite: 50 }, x.m.relogio.agora).itens.filter((n) => n.comunidade !== null || n.objeto !== null)
  assert.ok(after.every((n) => n.objeto === null), 'no object of the closed community is still pointed to')
  assert.ok(after.every((n) => n.comunidade === null || n.tipo === 'expulso' && false), 'not even the community')
})

test('a banned user who tries to return by any route stays out; the card of a closed community never shows the banned user', () => {
  const x = vault()
  assert.equal(x.code(x.fora, 'comunidade-adesao', { comunidade: x.f, acao: 'entrar' }), 'nao_encontrado', 'closed: does not even say it exists')
  assert.equal(x.code(x.fora, 'comunidade-adesao', { comunidade: x.f, acao: 'aceitar-convite' }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'topico', { comunidade: x.f, categoria: null, titulo: 'Quero entrar', texto: 'por favor', tags: [], enquete: null }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'resposta-forum', { topico: x.t, em: null, cita: null, texto: 'de fora' }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'voto', { topico: x.t, opcao: 0 }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'reacao', { alvo: x.t, reacao: 'curtir' }), 'alvo_desconhecido')
  assert.equal(x.code(x.fora, 'topico-gestao', { topico: x.t, acao: 'fixar', comunidade: null, categoria: null }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'remocao-por-responsavel', { alvo: x.t, motivo: 'spam' }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'topico-editar', { topico: x.t, titulo: 'Roubado', texto: 'texto roubado', tags: [] }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'comunidade-posse', { comunidade: x.f, acao: 'encerrar', novoDono: null }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'comunidade-atualizar', { comunidade: x.f, nome: 'Tomada', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'nao_encontrado')
  assert.equal(x.code(x.fora, 'comunidade-gestao', { comunidade: x.f, alvo: x.membro.uid, acao: 'banir', motivo: 'spam' }), 'nao_encontrado')
  // the banned user appeals: allowed, because the ban is theirs
  assert.equal(x.does(x.fora, 'apelacao', { tipo: 'banimento', alvo: x.f, texto: 'Pedi para entrar e fui banido.' }).estado, 'aceito')
})

test('the report and reaction of someone who cannot see the closed content leave no trace and reveal no existence', () => {
  const x = vault()
  const before = x.rele.listReports().length
  assert.equal(x.does(x.invited, 'denuncia', { alvo: x.t, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.does(x.invited, 'denuncia', { alvo: `ob_${'Z'.repeat(43)}`, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.rele.listReports().length, before)
  assert.equal(x.does(x.membro, 'denuncia', { alvo: x.r, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.rele.listReports().length, before + 1)
})
