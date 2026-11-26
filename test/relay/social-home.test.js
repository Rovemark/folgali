// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2 (proposal 0007): the home panel (`inicio`) and the relay announcements. The panel only returns ids, counts and stamps, and nothing about
// whom the reader blocked or muted. Announcements are only born through administration: no signed object writes to them.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DAY, codeOf, errorOf, fresh } from '../helpers/network.js'

function world() {
  const x = fresh()
  const owner = x.rover()
  const [ana, beto, caio, duda, eli] = [x.rover(), x.rover(), x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(owner, { categorias: [] })
  for (const r of [ana, beto, caio, duda, eli]) { x.entra(r, c, { wait: false }); x.advance(1) }
  x.advance(3601)
  const home = (who, o = {}) => x.s.inicio({ credencial: x.como(who, '/v1/inicio'), ...o })
  return Object.assign(x, { dono: owner, ana, beto, caio, duda, eli, c, inicio: home })
}

test('without a credential the panel is 401 (leitura_nao_autorizada); with a credential it comes whole and empty in a still world', () => {
  const x = world()
  assert.equal(codeOf(() => x.s.inicio({})), 'leitura_nao_autorizada')
  const p = x.inicio(x.ana)
  assert.deepEqual(Object.keys(p), ['agora', 'voce', 'avisos', 'atividade', 'pendencias', 'moderacao', 'anuncios'])
  assert.equal(p.agora, x.m.relogio.agora)
  assert.deepEqual(p.voce, { uid: x.ana.uid, contaDesde: x.rele.store.rover(x.ana.uid).criado_em, atestadoExpiraEm: x.rele.store.rover(x.ana.uid).atestado_expira_em })
  assert.deepEqual(p.avisos, { total: 0, porTipo: {} })
  assert.deepEqual(p.atividade, [])
  assert.deepEqual(p.pendencias, { amizades: { n: 0, uids: [] }, depoimentos: 0, convites: [], pedidosDeEntrada: [] })
  assert.deepEqual(p.moderacao, [])
  assert.deepEqual(p.anuncios, { novos: 0, ultimo: null })
})

test('desde is an integer from 0 upwards', () => {
  const x = world()
  for (const bad of [-1, 1.5, '5', null, NaN]) assert.equal(codeOf(() => x.inicio(x.ana, { desde: bad })), 'esquema', String(bad))
})

test('notices: counted by type, only those after desde', () => {
  const x = world()
  const t = x.topico(x.ana, x.c)
  x.replies(x.beto, t, 'primeira'); x.advance(5)
  x.ok(x.duda, 'recado', { alvo: x.ana.uid, texto: 'Oi, passei por aqui.' })
  const cutoff = x.m.relogio.agora
  x.advance(10)
  x.replies(x.caio, t, 'segunda')
  const all = x.inicio(x.ana).avisos
  assert.equal(all.porTipo['resposta-no-topico'], 2)
  assert.equal(all.porTipo.recado, 1)
  assert.equal(all.total, 3)
  const recent = x.inicio(x.ana, { desde: cutoff }).avisos
  assert.deepEqual(recent, { total: 1, porTipo: { 'resposta-no-topico': 1 } }, 'only the reply that came after the cutoff')
  assert.equal(x.inicio(x.ana, { desde: x.m.relogio.agora }).avisos.total, 0)
  assert.equal(x.inicio(x.beto).avisos.total, 0, 'the panel belongs to the reader, not to everyone')
})

test('whoever the reader muted or blocked after the fact leaves the panel but stays in the notice list', () => {
  const x = world()
  const t = x.topico(x.ana, x.c)
  x.replies(x.beto, t, 'resposta do beto')
  x.replies(x.caio, t, 'resposta do caio')
  x.reacao = undefined
  x.ok(x.eli, 'reacao', { alvo: t, reacao: 'curtir' })
  assert.equal(x.inicio(x.ana).avisos.total, 2)
  assert.deepEqual(x.inicio(x.ana).atividade, [{ tipo: 'topico', id: t, respostas: 2, reacoes: 1 }])
  x.ok(x.ana, 'relacao', { alvo: x.beto.uid, acao: 'silenciar' })
  x.ok(x.ana, 'relacao', { alvo: x.eli.uid, acao: 'bloquear' })
  assert.equal(x.inicio(x.ana).avisos.total, 1, 'only the notice from caio is left')
  assert.deepEqual(x.inicio(x.ana).atividade, [{ tipo: 'topico', id: t, respostas: 1, reacoes: 0 }], 'the reply from beto and the reaction from eli do not count')
  assert.equal(x.s.listar(x.ana.uid, { limite: 50 }, x.m.relogio.agora).itens.filter((n) => n.tipo === 'resposta-no-topico').length, 2, 'the notice list stays whole')
})

test('a rover blocked by the operator (invisible) leaves the panel counts', () => {
  const x = world()
  const t = x.topico(x.ana, x.c)
  x.replies(x.beto, t, 'resposta')
  assert.equal(x.inicio(x.ana).avisos.total, 1)
  x.rele.bloquear({ tipo: 'rover', alvo: x.beto.uid, motivo: 'x' })
  assert.equal(x.inicio(x.ana).avisos.total, 0)
  assert.deepEqual(x.inicio(x.ana).atividade, [])
})

test('activity: topics and posts of the reader, replies and distinct people who reacted, never what the reader did themselves', () => {
  const x = world()
  const t = x.topico(x.ana, x.c)
  const quiet = x.topico(x.ana, x.c, { titulo: 'Sem novidade nenhuma' })
  const post = x.ok(x.ana, 'postagem', { texto: 'uma postagem da ana', topicos: [] }).id
  for (const r of [x.beto, x.caio]) x.replies(r, t, 'resposta de fora')
  x.replies(x.beto, t, 'outra do mesmo beto')
  x.replies(x.ana, t, 'a própria ana respondendo')
  x.ok(x.eli, 'reacao', { alvo: t, reacao: 'curtir' })
  x.ok(x.duda, 'reacao', { alvo: t, reacao: 'util' })
  x.ok(x.ana, 'reacao', { alvo: t, reacao: 'curtir' })
  x.ok(x.beto, 'resposta', { alvo: post, texto: 'resposta à postagem' })
  x.ok(x.caio, 'reacao', { alvo: post, reacao: 'curtir' })
  const a = x.inicio(x.ana).atividade
  assert.equal(a.length, 2, 'a topic with nothing new does not appear')
  assert.ok(!a.some((i) => i.id === quiet))
  const topic = a.find((i) => i.id === t)
  assert.deepEqual(topic, { tipo: 'topico', id: t, respostas: 3, reacoes: 2 }, '3 outside replies (the one from ana does not count), 2 people reacted (ana does not count)')
  assert.deepEqual(a.find((i) => i.id === post), { tipo: 'postagem', id: post, respostas: 1, reacoes: 1 })
  assert.deepEqual(Object.keys(topic), ['tipo', 'id', 'respostas', 'reacoes'], 'only ids and counts')
  assert.equal(x.inicio(x.ana, { desde: x.m.relogio.agora }).atividade.length, 0, 'desde in the future: nothing')
})

test('activity is capped at 20 items', () => {
  const x = world()
  const posts = []
  for (let i = 0; i < 25; i++) { posts.push(x.ok(x.ana, 'postagem', { texto: `postagem número ${i} da ana`, topicos: [] }).id); x.advance(1000) }
  for (const p of posts.slice(-22)) { x.ok(x.beto, 'resposta', { alvo: p, texto: 'uma resposta' }); x.advance(1) }
  assert.equal(x.inicio(x.ana).atividade.length, 20)
})

test('pending items: friend requests (visible and not blocked), testimonials, invitations and join requests', () => {
  const x = world()
  x.ok(x.beto, 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  x.ok(x.duda, 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  x.ok(x.caio, 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  x.ok(x.ana, 'relacao', { alvo: x.duda.uid, acao: 'bloquear' })
  x.rele.bloquear({ tipo: 'rover', alvo: x.caio.uid, motivo: 'x' })
  const p = x.inicio(x.ana).pendencias
  assert.deepEqual(p.amizades, { n: 1, uids: [x.beto.uid] }, 'the ones requested by duda (blocked) and by caio (invisible) are not included')
  x.amigos(x.eli, x.ana, 8)
  x.ok(x.eli, 'depoimento', { alvo: x.ana.uid, texto: 'Trabalha com capricho e entrega no prazo.' })
  assert.equal(x.inicio(x.ana).pendencias.depoimentos, 1)
  const closed = x.comunidade(x.dono, { acesso: 'fechada' })
  x.gestao(x.dono, closed, x.ana, 'convidar')
  assert.deepEqual(x.inicio(x.ana).pendencias.convites, [{ comunidade: closed }])
  const moderated = x.comunidade(x.dono, { acesso: 'moderada' })
  x.ok(x.ana, 'comunidade-adesao', { comunidade: moderated, acao: 'entrar' })
  x.gestao(x.dono, moderated, x.ana, 'aprovar-pedido')
  x.gestao(x.dono, moderated, x.ana, 'promover')
  x.ok(x.eli, 'comunidade-adesao', { comunidade: moderated, acao: 'entrar' })
  x.ok(x.beto, 'comunidade-adesao', { comunidade: moderated, acao: 'entrar' })
  assert.deepEqual(x.inicio(x.ana).pendencias.pedidosDeEntrada, [{ comunidade: moderated, n: 2 }])
  assert.deepEqual(x.inicio(x.eli).pendencias.pedidosDeEntrada, [], 'only moderators see the community requests')
})

test('pending items: at most 10 uids of friend requests, and the count says how many there are', () => {
  const x = world()
  for (let i = 0; i < 12; i++) x.ok(x.rover(), 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  const a = x.inicio(x.ana).pendencias.amizades
  assert.equal(a.n, 12)
  assert.equal(a.uids.length, 10)
  for (const u of a.uids) assert.match(u, /^rvr_[A-Za-z0-9_-]{22}$/)
})

test('moderation: open reports and appeals only for moderators; dismissing removes them from the count', () => {
  const x = world()
  x.gestao(x.dono, x.c, x.ana, 'promover')
  const t = x.topico(x.beto, x.c, { titulo: 'Conteúdo denunciado' })
  assert.equal(x.does(x.caio, 'denuncia', { alvo: t, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.does(x.duda, 'denuncia', { alvo: t, motivo: 'spam' }).estado, 'recebida')
  assert.deepEqual(x.inicio(x.ana).moderacao, [{ comunidade: x.c, denuncias: 1, apelacoes: 0 }], 'two reporters, one target: counts the target')
  assert.deepEqual(x.inicio(x.dono).moderacao, [{ comunidade: x.c, denuncias: 1, apelacoes: 0 }])
  assert.deepEqual(x.inicio(x.caio).moderacao, [], 'whoever does not moderate does not see the queue')
  x.ok(x.ana, 'denuncia-dispensar', { comunidade: x.c, alvo: t })
  assert.deepEqual(x.inicio(x.ana).moderacao, [], 'dismissed, it leaves the count (and a community with nothing does not appear)')
  const t2 = x.topico(x.caio, x.c, { titulo: 'Será removido' })
  x.ok(x.ana, 'remocao-por-responsavel', { alvo: t2, motivo: 'spam' })
  x.ok(x.caio, 'apelacao', { tipo: 'remocao', alvo: t2, texto: 'Acho que foi um engano.' })
  assert.deepEqual(x.inicio(x.dono).moderacao, [{ comunidade: x.c, denuncias: 0, apelacoes: 1 }], 'the appeal against a moderator removal belongs to the owner')
  assert.deepEqual(x.inicio(x.ana).moderacao, [], 'the moderator does not decide the appeal of their own removal')
})

test('no third-party text, name or handle in the panel: only ids, counts and stamps', () => {
  const x = world()
  const t = x.topico(x.ana, x.c, { titulo: 'Titulomarcador', texto: 'Textomarcador do topico' })
  x.replies(x.beto, t, 'Respostamarcador de fora')
  x.ok(x.caio, 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  x.ok(x.duda, 'recado', { alvo: x.ana.uid, texto: 'Recadomarcador pessoal' })
  const closed = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Nomemarcador secreto' })
  x.gestao(x.dono, closed, x.ana, 'convidar')
  const text = JSON.stringify(x.inicio(x.ana))
  for (const marker of ['marcador', x.beto.handle, x.caio.handle, x.duda.handle, x.ana.handle]) assert.equal(text.includes(marker), false, marker)
  const leaves = []
  const walks = (v) => { if (v !== null && typeof v === 'object') Object.values(v).forEach(walks); else leaves.push(v) }
  walks(JSON.parse(text))
  for (const f of leaves.filter((f) => typeof f === 'string')) assert.match(f, /^(rvr|ob|an)_[A-Za-z0-9_-]+$|^[a-z-]+$/, `only ids or type names, and got ${f}`)
})

test('expired attestation: the panel becomes 401 (and atestadoExpiraEm gave the date)', () => {
  const x = world()
  const expires = x.inicio(x.ana).voce.atestadoExpiraEm
  assert.ok(expires > x.m.relogio.agora)
  x.m.advance(expires - x.m.relogio.agora + 10)
  assert.equal(codeOf(() => x.inicio(x.ana)), 'leitura_nao_autorizada')
})

// ---------- announcements ----------

test('announcements: administration publishes, everyone reads; pinned ones come first and then the newest', () => {
  const x = world()
  const a = x.s.publishAnnouncement({ titulo: 'Manutenção hoje', texto: 'O relé reinicia às 3h.' }).id
  x.advance(5)
  const b = x.s.publishAnnouncement({ titulo: 'Regra nova', texto: 'Leia a página de regras.', fixado: true }).id
  x.advance(5)
  const c = x.s.publishAnnouncement({ titulo: 'Domínio novo', texto: 'Vamos mudar de endereço.' }).id
  assert.match(a, /^an_[A-Za-z0-9_-]{22}$/)
  const list = x.s.listAnnouncements({ limite: 20 })
  assert.deepEqual(list.itens.map((i) => i.id), [b, c, a])
  assert.deepEqual(list.itens.map((i) => i.fixado), [true, false, false])
  assert.deepEqual(Object.keys(list.itens[0]), ['id', 'titulo', 'texto', 'em', 'fixado'])
  assert.equal(x.s.anuncio(b).titulo, 'Regra nova')
  const p1 = x.s.listAnnouncements({ limite: 2 })
  assert.equal(p1.proximo, 2)
  assert.deepEqual(x.s.listAnnouncements({ limite: 2, antes: 2 }).itens.map((i) => i.id), [a])
  assert.equal(codeOf(() => x.s.anuncio('an_naoexiste00000000000')), 'nao_encontrado')
  assert.equal(codeOf(() => x.s.anuncio('qualquer')), 'nao_encontrado')
})

test('announcements in the panel: only how many are new and the last one (id and stamp), never the text', () => {
  const x = world()
  const before = x.m.relogio.agora
  x.advance(10)
  const id = x.s.publishAnnouncement({ titulo: 'Titulodoanuncio', texto: 'Textodoanuncio' }).id
  const p = x.inicio(x.ana).anuncios
  assert.deepEqual(p, { novos: 1, ultimo: { id, em: x.m.relogio.agora } })
  assert.equal(JSON.stringify(p).includes('doanuncio'), false)
  assert.equal(x.inicio(x.ana, { desde: before }).anuncios.novos, 1)
  assert.equal(x.inicio(x.ana, { desde: x.m.relogio.agora }).anuncios.novos, 0)
})

test('announcements: at most 3 pinned, and removing frees the slot', () => {
  const x = world()
  const ids = [1, 2, 3].map((i) => x.s.publishAnnouncement({ titulo: `Fixado ${i}`, texto: 'texto', fixado: true }).id)
  assert.equal(codeOf(() => x.s.publishAnnouncement({ titulo: 'Quarto', texto: 'texto', fixado: true })), 'limite_de_estrutura')
  x.s.publishAnnouncement({ titulo: 'Solto', texto: 'texto' })
  assert.deepEqual(x.s.removeAnnouncement(ids[0]), { removido: true })
  x.s.publishAnnouncement({ titulo: 'Quarto agora cabe', texto: 'texto', fixado: true })
  assert.equal(codeOf(() => x.s.removeAnnouncement(ids[0])), 'nao_encontrado', 'already removed')
  assert.equal(codeOf(() => x.s.removeAnnouncement('nao-e-id')), 'nao_encontrado')
})

test('announcements: plain text and closed body', () => {
  const x = world()
  const good = { titulo: 'Aviso', texto: 'Veja https://roverhangar.com/regras para os detalhes. Contato: seguranca@roverhangar.com' }
  assert.match(x.s.publishAnnouncement(good).id, /^an_/)
  const bad = {
    'html no texto': { titulo: 'Aviso', texto: 'Clique <a href="x">aqui</a>' },
    'html no título': { titulo: '<b>Aviso</b>', texto: 'texto' },
    'link http': { titulo: 'Aviso', texto: 'veja http://x.com/y' },
    'link com rastreador': { titulo: 'Aviso', texto: 'veja https://x.com/y?utm_source=a' },
    'link demais': { titulo: 'Aviso', texto: 'https://a.com/1 https://b.com/2 https://c.com/3 https://d.com/4' },
    'título vazio': { titulo: '', texto: 'texto' },
    'título longo': { titulo: 'a'.repeat(101), texto: 'texto' },
    'título com quebra de linha': { titulo: 'Linha um\nlinha dois', texto: 'texto' },
    'texto vazio': { titulo: 'Aviso', texto: '' },
    'texto longo': { titulo: 'Aviso', texto: 'palavra '.repeat(300) },
    'sem texto': { titulo: 'Aviso' },
    'campo a mais': { titulo: 'Aviso', texto: 'texto', autor: 'rvr_x' },
    'fixado como texto': { titulo: 'Aviso', texto: 'texto', fixado: 'sim' },
    'invisível': { titulo: 'Aviso', texto: 'texto​oculto' },
    'não é objeto': 'Aviso'
  }
  for (const [name, body] of Object.entries(bad)) assert.equal(codeOf(() => x.s.publishAnnouncement(body)), 'esquema', name)
  assert.equal(codeOf(() => x.s.publishAnnouncement(null)), 'esquema')
  assert.equal(codeOf(() => x.s.publishAnnouncement([])), 'esquema')
  assert.equal(x.s.listAnnouncements({ limite: 50 }).itens.length, 1, 'no refusal left an announcement')
})

test('no signed object writes to announcements: the official community is virtual', () => {
  const x = world()
  assert.equal(x.rele.store.um("SELECT 1 AS n FROM comunidades WHERE id = 'anuncios'", {}), null, 'there is no community row')
  for (const body of [
    { comunidade: 'anuncios', categoria: null, titulo: 'Tentativa', texto: 'texto', tags: [], enquete: null },
    { comunidade: `ob_${'Z'.repeat(43)}`, categoria: null, titulo: 'Tentativa', texto: 'texto', tags: [], enquete: null }
  ]) {
    const c = x.code(x.ana, 'topico', body)
    assert.ok(['esquema', 'nao_encontrado'].includes(c), c)
  }
  assert.equal(x.code(x.dono, 'comunidade-adesao', { comunidade: 'anuncios', acao: 'entrar' }), 'esquema')
  assert.equal(x.code(x.dono, 'comunidade-vocabulario', { comunidade: 'anuncios', etiquetas: [], status: [] }), 'esquema')
  assert.equal(x.s.listAnnouncements({ limite: 50 }).itens.length, 0, 'and none of the attempts created an announcement')
  assert.ok(DAY > 0)
})

// ---------- gaps that mutation testing found ----------

test('notices: reads at most the 500 newest (the retention cap), not one less and not one more', () => {
  const x = world()
  for (let i = 0; i < 501; i++) x.s.notify(x.ana.uid, 'recado', {}, x.m.relogio.agora)
  assert.equal(x.inicio(x.ana).avisos.total, 500)
  assert.deepEqual(x.inicio(x.ana).avisos.porTipo, { recado: 500 })
})

test('activity: a topic with a single reaction and no reply appears', () => {
  const x = world()
  const t = x.topico(x.ana, x.c)
  x.ok(x.beto, 'reacao', { alvo: t, reacao: 'curtir' })
  assert.deepEqual(x.inicio(x.ana).atividade, [{ tipo: 'topico', id: t, respostas: 0, reacoes: 1 }])
})

test('pending items and moderation: at most 20 communities, and a closed community does not count', () => {
  const x = world()
  const db = x.rele.store
  for (let i = 0; i < 22; i++) {
    const id = `ob_comunidade${String(i).padStart(2, '0')}`
    db.executar(
      "INSERT INTO comunidades (id, dono, nome, chave_nome, descricao, regras, tema, acesso, categorias, criada_em, seq, atividade_em, atividade_seq, versao_id) VALUES (:id, :dono, :nome, :chave, 'd', 'r', 'rovers', 'moderada', '[]', 1, :seq, 1, :seq, :id)",
      { id, dono: x.eli.uid, nome: `Comunidade ${i}`, chave: `comunidade ${i}`, seq: 1000 + i }
    )
    db.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:id, :uid, 'moderador', 1)", { id, uid: x.ana.uid })
    db.executar("INSERT INTO pedidos_de_entrada (comunidade, uid, em) VALUES (:id, :uid, 1)", { id, uid: x.beto.uid })
  }
  assert.equal(x.inicio(x.ana).pendencias.pedidosDeEntrada.length, 20, 'the panel brings up to 20 communities')
  // closed: it leaves moderation even with an open report on live content
  const c = x.comunidade(x.dono, { acesso: 'aberta' })
  x.entra(x.caio, c, { wait: true })
  const t = x.topico(x.caio, c, { titulo: 'Conteúdo da comunidade que vai fechar' })
  assert.equal(x.does(x.beto, 'denuncia', { alvo: t, motivo: 'spam' }).estado, 'recebida')
  assert.deepEqual(x.inicio(x.dono).moderacao, [{ comunidade: c, denuncias: 1, apelacoes: 0 }])
  // mark it as closed directly in the database, leaving the report and the role in place: it is the panel guard that must hide it
  db.executar('UPDATE comunidades SET encerrada_em = :t WHERE id = :id', { t: x.m.relogio.agora, id: c })
  assert.deepEqual(x.inicio(x.dono).moderacao, [], 'closed community: nothing in moderation')
})

test('announcements: what the operator can write (e-mail, several lines, three links) and what they cannot (too many hashtags)', () => {
  const x = world()
  assert.match(x.s.publishAnnouncement({ titulo: 'Fale com seguranca@roverhangar.com', texto: 'texto' }).id, /^an_/, 'contact e-mail in the title')
  assert.match(x.s.publishAnnouncement({ titulo: 'Aviso', texto: 'linha um\nlinha dois\nlinha três' }).id, /^an_/, 'several lines in the text')
  assert.match(x.s.publishAnnouncement({ titulo: 'Aviso', texto: 'https://a.com/1 https://b.com/2 https://c.com/3' }).id, /^an_/, 'exactly three https links')
  assert.equal(errorOf(() => x.s.publishAnnouncement({ titulo: 'Aviso #aa #bb #cc #dd #ee #ff', texto: 'texto' })).campo, 'titulo', 'the title follows the network text rules (too many hashtags)')
  assert.equal(errorOf(() => x.s.publishAnnouncement({ titulo: 'Aviso', texto: 'texto\nsegunda linha\n\n\n\nquinta' })).campo, 'texto', 'too many line breaks in a row')
  for (const body of ['Aviso', [], null, 42]) assert.equal(errorOf(() => x.s.publishAnnouncement(body)).campo, 'corpo', JSON.stringify(body))
})

test('announcements: only an id as text is valid; an id that comes as a list (which would become text when compared) is "not found", never a database error', () => {
  const x = world()
  const id = x.s.publishAnnouncement({ titulo: 'Aviso', texto: 'texto' }).id
  for (const bad of [[id], { toString: () => id }, 42, null, undefined]) {
    assert.equal(codeOf(() => x.s.anuncio(bad)), 'nao_encontrado', String(typeof bad))
    assert.equal(codeOf(() => x.s.removeAnnouncement(bad)), 'nao_encontrado', String(typeof bad))
  }
  assert.equal(x.s.anuncio(id).id, id, 'the announcement is still there')
  assert.deepEqual(x.s.removeAnnouncement(id), { removido: true })
})
