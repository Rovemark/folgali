// SPDX-License-Identifier: AGPL-3.0-or-later
// Notificações: fatos sem texto, só do próprio rover, com teto de menção de estranhos, silêncio, bloqueio e retenção.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TEMPOS } from '../../packages/protocolo/src/index.js'
import { codigoDe, nova } from '../ajuda/rede.js'
import { TIPOS_DE_NOTIFICACAO } from '../../packages/rele/src/social-notificacoes.js'

const lista = (x, r, o = {}) => x.s.notificacoesDe(r.uid, { credencial: x.como(r), ...o })

test('a lista de notificações é só do próprio rover: sem credencial 401, de outro 403, rover inexistente 404', () => {
  const x = nova()
  const [a, b] = [x.rover(), x.rover()]
  assert.equal(codigoDe(() => x.s.notificacoesDe(a.uid, { credencial: null })), 'leitura_nao_autorizada')
  assert.equal(codigoDe(() => x.s.notificacoesDe(a.uid, { credencial: x.como(b) })), 'sem_permissao')
  assert.equal(codigoDe(() => x.s.notificacoesDe(`rvr_${'A'.repeat(22)}`, { credencial: x.como(b) })), 'nao_encontrado')
  assert.deepEqual(lista(x, a), { itens: [], proximo: null })
  assert.equal(codigoDe(() => x.s.contagemDeNotificacoes(a.uid, { credencial: x.como(b) })), 'sem_permissao')
})

test('a notificação não carrega texto: só tipo, hora, origem, ids e contexto', () => {
  const x = nova()
  const [a, b] = [x.rover(), x.rover()]
  x.ok(b, 'recado', { alvo: a.uid, texto: 'texto-secreto-do-recado' })
  const n = lista(x, a).itens[0]
  assert.deepEqual(Object.keys(n).sort(), ['comunidade', 'em', 'lugar', 'objeto', 'origem', 'pagina', 'seq', 'tipo', 'topico'])
  assert.equal(JSON.stringify(n).includes('secreto'), false)
  assert.equal(n.tipo, 'recado')
  assert.equal(n.origem.uid, b.uid)
  assert.equal(n.origem.handle, b.handle)
  assert.equal(n.em, x.m.relogio.agora)
  assert.ok(TIPOS_DE_NOTIFICACAO.includes(n.tipo))
})

test('contagem desde um cursor, página por cursor e ordem do mais novo ao mais velho', () => {
  const x = nova()
  const a = x.rover()
  for (let i = 0; i < 5; i++) { x.ok(x.rover(), 'recado', { alvo: a.uid, texto: `recado ${i}` }); x.avancar(1) }
  assert.equal(x.s.contagemDeNotificacoes(a.uid, { credencial: x.como(a) }).novas, 5)
  const p1 = lista(x, a, { limite: 2 })
  const p2 = lista(x, a, { limite: 2, antes: p1.proximo })
  const p3 = lista(x, a, { limite: 2, antes: p2.proximo })
  const seqs = [...p1.itens, ...p2.itens, ...p3.itens].map((n) => n.seq)
  assert.equal(seqs.length, 5)
  assert.deepEqual([...seqs].sort((m, n) => n - m), seqs, 'decrescente')
  assert.equal(p3.proximo, null)
  assert.equal(x.s.contagemDeNotificacoes(a.uid, { desde: seqs[0], credencial: x.como(a) }).novas, 0)
  assert.equal(x.s.contagemDeNotificacoes(a.uid, { desde: seqs[2], credencial: x.como(a) }).novas, 2)
  assert.equal(x.s.contagemDeNotificacoes(a.uid, { desde: 0, credencial: x.como(a) }).novas, 5)
})

test('quem bloqueou ou silenciou o autor não é avisado; o aviso de si mesmo nunca existe', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  x.ok(a, 'relacao', { alvo: b.uid, acao: 'silenciar' })
  x.ok(a, 'relacao', { alvo: c.uid, acao: 'bloquear' })
  x.ok(b, 'recado', { alvo: a.uid, texto: 'oi do silenciado' })
  assert.equal(lista(x, a).itens.length, 0)
  x.ok(c, 'postagem', { texto: `menção a @${a.handle}`, topicos: [] })
  assert.equal(lista(x, a).itens.length, 0, 'menção de quem foi bloqueado')
  x.ok(a, 'postagem', { texto: `eu mesmo @${a.handle}`, topicos: [] })
  assert.equal(lista(x, a).itens.length, 0)
})

test('menção: o handle precisa existir; maiúsculas valem; no máximo 20 por hora de quem não é amigo; amigo não gasta o teto', () => {
  const x = nova()
  const alvo = x.rover({ handle: 'alvo.da.mencao' })
  const amigo = x.rover()
  x.amigos(alvo, amigo, 0)
  x.ok(amigo, 'postagem', { texto: 'oi @NaoExiste.Mesmo e @ALVO.da.mencao', topicos: [] })
  assert.equal(lista(x, alvo).itens.filter((n) => n.tipo === 'mencao').length, 1)
  for (let i = 0; i < 20; i++) {
    const e = x.rover()
    x.ok(e, 'postagem', { texto: `oi @alvo.da.mencao ${i}`, topicos: [] })
  }
  const total = () => lista(x, alvo, { limite: 50 }).itens.filter((n) => n.tipo === 'mencao').length
  assert.equal(total(), 20, 'a 1ª do amigo + 19 de estranhos; a 20ª de estranho já passou do teto de 20 por hora')
  x.ok(amigo, 'postagem', { texto: 'outra @alvo.da.mencao', topicos: [] })
  assert.equal(total(), 21, 'o amigo segue avisando')
  x.avancar(3601)
  x.ok(x.rover(), 'postagem', { texto: 'passada a hora @alvo.da.mencao', topicos: [] })
  assert.equal(total(), 22)
})

test('menção só em objeto 0.3: uma postagem 0.2 com @ não notifica', () => {
  const x = nova()
  const [a, b] = [x.rover(), x.rover()]
  x.ok(b, 'postagem', { texto: `oi @${a.handle}`, topicos: [] }, { v: '0.2' })
  assert.equal(lista(x, a).itens.length, 0)
  x.ok(b, 'postagem', { texto: `oi @${a.handle}`, topicos: [] })
  assert.equal(lista(x, a).itens.length, 1)
})

test('retenção: ficam as últimas 500 e os últimos 90 dias', () => {
  const x = nova()
  const a = x.rover()
  const ins = x.m.armazem
  for (let i = 0; i < 520; i++) ins.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: a.uid, em: x.m.relogio.agora })
  x.rele.limpar()
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 500)
  assert.equal(ins.um('SELECT MIN(seq) AS m FROM notificacoes WHERE dest = :d', { d: a.uid }).m, 21, 'ficam as 500 mais novas')
  ins.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: a.uid, em: x.m.relogio.agora - TEMPOS.notificacaoRetencaoS - 1 })
  ins.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: a.uid, em: x.m.relogio.agora - TEMPOS.notificacaoRetencaoS + 10 })
  x.rele.limpar()
  const velhas = ins.todos('SELECT em FROM notificacoes WHERE dest = :d AND em < :corte', { d: a.uid, corte: x.m.relogio.agora - TEMPOS.notificacaoRetencaoS })
  assert.equal(velhas.length, 0)
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d AND em = :em', { d: a.uid, em: x.m.relogio.agora - TEMPOS.notificacaoRetencaoS + 10 }).n, 1, 'a de 89 dias fica')
})

test('quando o rover sai da rede, as notificações dele somem e as que ele causou perdem a origem', () => {
  const x = nova()
  const [a, b] = [x.rover(), x.rover()]
  x.ok(b, 'recado', { alvo: a.uid, texto: 'oi' })
  x.ok(a, 'recado', { alvo: b.uid, texto: 'olá' })
  x.ok(b, 'remocao-pelo-autor', { alvo: x.rele.perfil(b.uid).perfil.id })
  const n = lista(x, a).itens.find((i) => i.tipo === 'recado')
  assert.equal(n.origem, null, 'quem saiu não aparece como origem')
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: b.uid }).n, 0)
})

test('a notificação de um objeto que o rover já não pode ler traz objeto: null', () => {
  const x = nova()
  const [a, b] = [x.rover(), x.rover()]
  const rec = x.ok(b, 'recado', { alvo: a.uid, texto: 'oi' })
  assert.equal(lista(x, a).itens[0].objeto, rec.id)
  x.ok(b, 'remocao-pelo-autor', { alvo: rec.id })
  assert.equal(lista(x, a).itens[0].objeto, null)
})

test('retenção nos limites exatos: 500 ficam, a 501ª sai a mais antiga; 90 dias exatos ficam, 90 dias e 1 segundo saem', () => {
  const x = nova()
  const a = x.rover()
  const b = x.rover()
  const ins = x.m.armazem
  const agora = x.m.relogio.agora
  const poe = (dest, em) => ins.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: dest, em })
  for (let i = 0; i < 500; i++) poe(a.uid, agora)
  x.rele.limpar()
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 500, '500 exatas ficam')
  poe(a.uid, agora)
  x.rele.limpar()
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 500)
  assert.equal(ins.um('SELECT MIN(seq) AS m FROM notificacoes WHERE dest = :d', { d: a.uid }).m, 2, 'saiu a primeira')
  poe(b.uid, agora - TEMPOS.notificacaoRetencaoS)
  poe(b.uid, agora - TEMPOS.notificacaoRetencaoS - 1)
  x.rele.limpar()
  assert.deepEqual(ins.todos('SELECT em FROM notificacoes WHERE dest = :d', { d: b.uid }).map((l) => agora - l.em), [TEMPOS.notificacaoRetencaoS], 'exatos 90 dias ficam')
  assert.equal(ins.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 500, 'o teto de um rover não mexe no do outro')
})

test('quem foi bloqueado pelo relé não recebe aviso, e a notificação de página e de comunidade só mostra o que ainda existe', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  x.rele.bloquear({ tipo: 'rover', alvo: a.uid, motivo: 'teste' })
  x.ok(b, 'postagem', { texto: `oi @${a.handle}`, topicos: [] })
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d', { d: a.uid }).n, 0)
  const pag = x.ok(c, 'pagina-criar', { nome: 'Página que some', descricao: '', tema: 'rovers' }).id
  x.ok(b, 'pagina-seguir', { pagina: pag, acao: 'seguir' })
  assert.equal(lista(x, c).itens[0].pagina, pag)
  x.ok(c, 'remocao-pelo-autor', { alvo: pag })
  assert.equal(lista(x, c).itens[0].pagina, null, 'a página encerrada não aparece')
  const com = x.comunidade(c)
  x.gestao(c, com, b, 'convidar')
  assert.equal(lista(x, b).itens[0].comunidade, com, 'o convidado vê a comunidade do convite, mesmo sem ser membro')
  x.ok(c, 'comunidade-posse', { comunidade: com, acao: 'encerrar', novoDono: null })
  assert.equal(lista(x, b).itens[0].comunidade, null, 'comunidade encerrada não aparece')
})

test('o depoimento pendente só aparece na notificação para o dono e para o autor', () => {
  const x = nova()
  const [dono, autor] = [x.rover(), x.rover()]
  x.amigos(dono, autor, 4)
  const d = x.ok(autor, 'depoimento', { alvo: dono.uid, texto: 'um depoimento' })
  assert.equal(lista(x, dono).itens[0].objeto, d.id, 'o dono vê o pendente')
  x.ok(dono, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' })
  assert.equal(lista(x, autor).itens[0].objeto, d.id, 'aceito, o autor vê')
  x.ok(dono, 'depoimento-decisao', { depoimento: d.id, decisao: 'recusar' })
  assert.equal(lista(x, autor).itens[0].objeto, d.id, 'recusado, o autor ainda o enxerga (é dele)')
  assert.equal(lista(x, dono).itens.find((n) => n.tipo === 'depoimento-para-aceitar').objeto, d.id)
})

test('menção em comunidade: quem não pode ler a comunidade não é avisado, quem pode, é; comunidade que não existe não avisa ninguém', () => {
  const x = nova()
  const [dono, membro, fora] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono, { acesso: 'fechada', nome: 'Fechada de menção' })
  x.gestao(dono, c, membro, 'convidar')
  x.ok(membro, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' })
  x.avancar(3601)
  x.topico(dono, c, { titulo: 'Tópico com menções', texto: `olá @${membro.handle} e @${fora.handle}` })
  assert.equal(lista(x, membro).itens.some((n) => n.tipo === 'mencao'), true)
  assert.equal(lista(x, fora).itens.some((n) => n.tipo === 'mencao'), false)
  assert.equal(x.s.mencoes(`@${fora.handle}`, { origem: dono.uid, objeto: null, comunidade: `ob_${'A'.repeat(43)}` }, x.m.relogio.agora), undefined)
  assert.equal(lista(x, fora).itens.length, 0)
})

test('janela da menção de estranhos: as de 1 hora exata atrás não contam, as de 59 minutos e 59 segundos contam', () => {
  const x = nova()
  const alvo = x.rover({ handle: 'alvo.da.janela' })
  const agora = x.m.relogio.agora
  const poe = (em) => x.m.armazem.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'mencao', NULL, NULL, NULL, NULL, :em)", { d: alvo.uid, em })
  for (let i = 0; i < 20; i++) poe(agora - 3600)
  x.ok(x.rover(), 'postagem', { texto: 'oi @alvo.da.janela primeira', topicos: [] })
  assert.equal(x.m.armazem.um("SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d AND em = :em", { d: alvo.uid, em: agora }).n, 1, 'as de 1h exata não contam')
  for (let i = 0; i < 18; i++) poe(agora - 3599)
  x.ok(x.rover(), 'postagem', { texto: 'oi @alvo.da.janela segunda', topicos: [] })
  assert.equal(x.m.armazem.um("SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d AND em = :em", { d: alvo.uid, em: agora }).n, 2, 'eram 19 recentes (1 + 18): a 20ª entra')
  x.ok(x.rover(), 'postagem', { texto: 'oi @alvo.da.janela terceira', topicos: [] })
  assert.equal(x.m.armazem.um("SELECT COUNT(*) AS n FROM notificacoes WHERE dest = :d AND em = :em", { d: alvo.uid, em: agora }).n, 2, 'com 20 recentes, a seguinte não entra')
})

test('lista de notificações: 20 por página por padrão, proximo só quando há mais, e o objeto de ação, inexistente ou alheio vem null', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const agora = x.m.relogio.agora
  for (let i = 0; i < 22; i++) x.m.armazem.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, NULL, NULL, NULL, :em)", { d: a.uid, em: agora })
  const p = x.s.listar(a.uid, {}, agora)
  assert.equal(p.itens.length, 20, 'padrão de 20')
  assert.equal(p.proximo, p.itens[19].seq)
  assert.equal(x.s.listar(a.uid, { limite: 22 }, agora).proximo, null, 'exatamente o que há: sem próxima página')
  assert.equal(x.s.listar(a.uid, { limite: 21 }, agora).proximo !== null, true)
  assert.equal(x.s.listar(a.uid, { limite: 21 }, agora).itens.length, 21)
  // objetos
  x.ok(b, 'amizade', { alvo: c.uid, acao: 'pedir' })
  assert.equal(x.s.listar(c.uid, { limite: 5 }, agora).itens[0].objeto, null, 'ação não tem envelope: objeto null')
  x.m.armazem.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, :o, NULL, NULL, :em)", { d: c.uid, o: `ob_${'N'.repeat(43)}`, em: agora })
  assert.equal(x.s.listar(c.uid, { limite: 1 }, agora).itens[0].objeto, null, 'objeto que não existe')
  // depoimento pendente: só o dono e o autor veem
  x.amigos(a, b, 4)
  const d = x.ok(b, 'depoimento', { alvo: a.uid, texto: 'um depoimento' })
  const para = (dest) => {
    x.m.armazem.executar("INSERT INTO notificacoes (dest, tipo, origem, objeto, comunidade, pagina, em) VALUES (:d, 'recado', NULL, :o, NULL, NULL, :em)", { d: dest.uid, o: d.id, em: agora })
    return x.s.listar(dest.uid, { limite: 1 }, agora).itens[0].objeto
  }
  assert.equal(para(a), d.id)
  assert.equal(para(b), d.id)
  assert.equal(para(c), null, 'um terceiro não enxerga o pendente')
  x.ok(a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' })
  assert.equal(para(c), d.id, 'aceito, é público')
})
