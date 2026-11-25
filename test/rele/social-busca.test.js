// SPDX-License-Identifier: AGPL-3.0-or-later
// Busca e descoberta: texto, em alta, recém-chegados, sugestões por interesse declarado e tendências. E o que NUNCA vaza.
import test from 'node:test'
import assert from 'node:assert/strict'
import { montarConsulta } from '../../packages/rele/src/social-busca.js'
import { DIA, codigoDe, nova } from '../ajuda/rede.js'

const busca = (x, q, o = {}) => x.s.buscar({ q, ...o }, x.m.relogio.agora)

// ---------- a expressão de busca ----------

test('a consulta vira palavras entre aspas, a última por prefixo; nada de operador do FTS passa', () => {
  assert.equal(montarConsulta('planilha de custos'), '"planilha" "de" "custos"*')
  assert.equal(montarConsulta('AÇÃO rápida'), '"ação" "rápida"*')
  assert.equal(montarConsulta('a* OR b NOT c'), '"a" "or" "b" "not" "c"*')
  assert.equal(montarConsulta('"; DROP TABLE x; --'), '"drop" "table" "x"*')
  assert.equal(montarConsulta('col:valor NEAR(a b)'), '"col" "valor" "near" "a" "b"*')
  assert.equal(montarConsulta('um dois três quatro cinco seis sete oito nove dez').split(' ').length, 8, 'no máximo 8 palavras')
  assert.equal(montarConsulta(`${'a'.repeat(40)} b`), `"${'a'.repeat(30)}" "b"*`, 'palavras de até 30 caracteres')
  for (const ruim of [undefined, null, '', 'a', 'x'.repeat(101), '!!!', '   ', 5]) {
    let erro
    try { montarConsulta(ruim) } catch (e) { erro = e }
    assert.equal(erro?.codigo, 'esquema', String(ruim))
    assert.equal(erro?.campo, 'q')
  }
  assert.doesNotThrow(() => montarConsulta('x'.repeat(100)))
  assert.doesNotThrow(() => montarConsulta('ab'))
})

// ---------- busca por tipo ----------

test('buscar rovers por handle, nome, habilidade e sobre; ignora acento e maiúscula; rover não listado não aparece', () => {
  const x = nova()
  const ana = x.rover({ handle: 'ana.planilhas', perfil: { sobre: 'Cuido de custos e prazos.', habilidades: ['contabilidade'] } })
  x.ok(ana, 'perfil', { nome: 'Ana Ação', descricao: 'Organizo a casa', sobre: 'Cuido de custos e prazos.', habilidades: ['contabilidade'] })
  const oculto = x.rover({ handle: 'oculto.planilhas', perfil: { listado: false } })
  const outro = x.rover({ handle: 'beto.jardim', perfil: { habilidades: ['jardinagem'] } })
  const uids = (q) => busca(x, q, { tipo: 'rovers' }).itens.map((i) => i.uid)
  assert.deepEqual(uids('planilhas'), [ana.uid], 'handle')
  assert.deepEqual(uids('acao'), [ana.uid], 'nome sem acento')
  assert.deepEqual(uids('ANA'), [ana.uid])
  assert.deepEqual(uids('contabilidade'), [ana.uid], 'habilidade')
  assert.deepEqual(uids('custos prazos'), [ana.uid], 'sobre, duas palavras')
  assert.deepEqual(uids('jardinagem'), [outro.uid])
  assert.deepEqual(uids('conta'), [ana.uid], 'prefixo na última palavra')
  assert.deepEqual(uids('naoexiste'), [])
  assert.equal(uids('oculto').length, 0, 'listado: false fica fora')
  assert.equal(x.rele.perfil(oculto.uid).handle, 'oculto.planilhas', 'mas o perfil direto continua acessível')
  assert.equal(busca(x, 'ana', { tipo: 'rovers' }).itens[0].descricao, 'Organizo a casa')
})

test('rover que sai da rede, que é bloqueado pelo relé ou volta a ser não listado sai da busca na hora', () => {
  const x = nova()
  const a = x.rover({ handle: 'saindo.aqui' })
  const b = x.rover({ handle: 'bloqueado.aqui' })
  const c = x.rover({ handle: 'discreto.aqui' })
  assert.equal(busca(x, 'aqui', { tipo: 'rovers' }).itens.length, 3)
  x.ok(a, 'remocao-pelo-autor', { alvo: x.rele.perfil(a.uid).perfil.id })
  x.rele.bloquear({ tipo: 'rover', alvo: b.uid, motivo: 'teste' })
  x.ok(c, 'perfil', { nome: 'Pipa', descricao: 'agora discreto', listado: false })
  assert.equal(busca(x, 'aqui', { tipo: 'rovers' }).itens.length, 0)
})

test('buscar comunidades: só as listadas; a fechada não aparece nem pelo nome, nem para o próprio membro', () => {
  const x = nova()
  const dono = x.rover()
  const aberta = x.comunidade(dono, { nome: 'Clube da jardinagem', descricao: 'Plantas e vasos', tema: 'jardim' })
  x.comunidade(dono, { nome: 'Clube secreto da jardinagem', acesso: 'fechada' })
  x.avancar(3601)
  assert.deepEqual(busca(x, 'jardinagem', { tipo: 'comunidades' }).itens.map((c) => c.id), [aberta])
  assert.deepEqual(busca(x, 'jardinagem', { tipo: 'comunidades', leitor: dono.uid }).itens.map((c) => c.id), [aberta], 'nem o dono acha a fechada pela busca')
  assert.deepEqual(busca(x, 'vasos', { tipo: 'comunidades' }).itens.map((c) => c.id), [aberta], 'descrição')
  assert.deepEqual(busca(x, 'secreto').comunidades, [])
})

test('buscar tópicos: título, texto e tags; achar tópico de comunidade fechada só como membro e nunca a comunidade', () => {
  const x = nova()
  const dono = x.rover()
  const membro = x.rover()
  const aberta = x.comunidade(dono, { nome: 'Aberta de busca' })
  const fechada = x.comunidade(dono, { nome: 'Fechada de busca', acesso: 'fechada' })
  x.entra(membro, aberta, { esperar: false })
  x.gestao(dono, fechada, membro, 'convidar')
  x.ok(membro, 'comunidade-adesao', { comunidade: fechada, acao: 'aceitar-convite' })
  x.avancar(3601)
  const ta = x.topico(dono, aberta, { titulo: 'Bolo de laranja', texto: 'A receita do bolo com casca.', tags: ['receita'] })
  const tf = x.topico(dono, fechada, { titulo: 'Bolo secreto de laranja', texto: 'Só para a gente.' })
  const ids = (q, leitor) => busca(x, q, { tipo: 'topicos', leitor }).itens.map((t) => t.id).sort()
  assert.deepEqual(ids('bolo'), [ta])
  assert.deepEqual(ids('bolo', x.rover().uid), [ta], 'um estranho identificado também não')
  assert.deepEqual(ids('bolo', membro.uid), [ta, tf].sort(), 'o membro acha o da fechada')
  assert.deepEqual(ids('receita'), [ta], 'tag e texto')
  assert.deepEqual(ids('casca'), [ta])
  assert.deepEqual(ids('segredo'), [], 'palavra só do conteúdo fechado')
  assert.deepEqual(ids('segredo', membro.uid), [])
  assert.equal(busca(x, 'bolo', { tipo: 'topicos' }).itens[0].comunidadeNome, 'Aberta de busca')
  // o membro sai: deixa de achar
  x.ok(membro, 'comunidade-adesao', { comunidade: fechada, acao: 'sair' })
  assert.deepEqual(ids('bolo', membro.uid), [ta])
  // mover o tópico da aberta para a fechada tira da busca pública
  x.avancar(3601)
  x.ok(dono, 'topico-gestao', { topico: ta, acao: 'mover', comunidade: fechada, categoria: null })
  assert.deepEqual(ids('bolo'), [], 'movido para a fechada: some para quem não é membro')
  assert.deepEqual(ids('bolo', dono.uid), [ta, tf].sort(), 'o dono é membro da fechada')
})

test('buscar páginas por nome e descrição; busca "todos" traz até 5 de cada tipo e não pagina; tipo inválido é "esquema"', () => {
  const x = nova()
  x.rover({ handle: 'cafe.dono' })
  for (let i = 0; i < 7; i++) x.ok(x.rover(), 'pagina-criar', { nome: `Página do café ${i}`, descricao: 'Grãos e moagem', tema: 'cafe' })
  const todos = busca(x, 'café')
  assert.deepEqual(Object.keys(todos).sort(), ['comunidades', 'paginas', 'rovers', 'topicos'])
  assert.equal(todos.paginas.length, 5)
  assert.equal(busca(x, 'cafe', { tipo: 'paginas', limite: 3 }).itens.length, 3)
  assert.equal(busca(x, 'moagem', { tipo: 'paginas', limite: 20 }).itens.length, 7)
  assert.equal(codigoDe(() => busca(x, 'cafe', { tipo: 'imagens' })), 'esquema')
  assert.equal(todos.rovers.length, 1)
})

test('a busca pagina com deslocamento opaco sem repetir nem pular', () => {
  const x = nova()
  for (let i = 0; i < 5; i++) x.ok(x.rover(), 'pagina-criar', { nome: `Pagina laranja ${i}`, descricao: '', tema: 'rovers' })
  const todas = busca(x, 'laranja', { tipo: 'paginas', limite: 50 }).itens.map((p) => p.id)
  const p1 = busca(x, 'laranja', { tipo: 'paginas', limite: 2 })
  const p2 = busca(x, 'laranja', { tipo: 'paginas', limite: 2, antes: p1.proximo })
  const p3 = busca(x, 'laranja', { tipo: 'paginas', limite: 2, antes: p2.proximo })
  assert.deepEqual([...p1.itens, ...p2.itens, ...p3.itens].map((p) => p.id), todas)
  assert.equal(p3.proximo, null)
})

// ---------- em alta ----------

/** Uma comunidade com dono e cinco membros que já passaram da carência. */
function movimentada() {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  const membros = Array.from({ length: 5 }, () => x.rover())
  for (const m of membros) x.entra(m, c, { esperar: false })
  x.avancar(3601)
  return Object.assign(x, { dono, c, membros })
}
const alta = (x, o = {}) => x.s.emAlta({ tipo: 'topicos', janela: '24h', ...o }, x.m.relogio.agora).itens.map((t) => t.id)

test('em alta (tópicos): pontua pessoas distintas, não volume: 3 por respondente e 1 por reator, mínimo 2; reação sozinha não basta', () => {
  const x = movimentada()
  const quente = x.topico(x.dono, x.c, { titulo: 'Tópico quente' })
  const dois = x.topico(x.dono, x.c, { titulo: 'Dois respondentes' })
  const um = x.topico(x.dono, x.c, { titulo: 'Um respondente que fala muito' })
  const frio = x.topico(x.dono, x.c, { titulo: 'Só uma reação' })
  for (const m of x.membros.slice(0, 3)) x.responde(m, quente, 'também acho')
  x.ok(x.membros[3], 'reacao', { alvo: quente, reacao: 'curtir' })
  for (const m of x.membros.slice(0, 2)) x.responde(m, dois, 'concordo')
  for (let i = 0; i < 12; i++) x.responde(x.membros[4], um, `mais um comentário ${i}`)
  x.ok(x.membros[0], 'reacao', { alvo: frio, reacao: 'curtir' })
  assert.deepEqual(alta(x), [quente, dois, um])
  const itens = x.s.emAlta({ tipo: 'topicos' }, x.m.relogio.agora).itens
  assert.equal(itens[0].comunidadeNome, x.s.comunidade(x.c).nome)
  assert.equal(itens[0].respostas, 3)
})

test('em alta: conta com menos de 1 dia não pontua (fazenda de contas novas não leva um tópico ao topo)', () => {
  const x = movimentada()
  const t = x.topico(x.dono, x.c, { titulo: 'Alvo de contas novas' })
  for (const m of x.membros) x.m.armazem.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 3600, u: m.uid })
  for (const m of x.membros) x.responde(m, t, 'resposta de conta nova')
  assert.deepEqual(alta(x), [])
  x.m.armazem.executar('UPDATE rovers SET criado_em = :n WHERE uid IN (:a, :b)', { n: x.m.relogio.agora - 2 * DIA, a: x.membros[0].uid, b: x.membros[1].uid })
  assert.deepEqual(alta(x), [t], 'duas contas com mais de 1 dia bastam para o mínimo')
})

test('em alta: janelas de 24h e 7d; conteúdo apagado, escondido ou de comunidade fechada não entra', () => {
  const x = movimentada()
  const t = x.topico(x.dono, x.c, { titulo: 'Atividade antiga' })
  for (const m of x.membros.slice(0, 2)) x.responde(m, t, 'oi')
  assert.deepEqual(alta(x), [t])
  x.avancar(2 * DIA)
  assert.deepEqual(alta(x, { janela: '24h' }), [])
  assert.deepEqual(alta(x, { janela: '7d' }), [t])
  x.ok(x.dono, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' })
  assert.deepEqual(alta(x, { janela: '7d' }), [])
  // fechada
  const f = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechada em alta' })
  for (const m of x.membros.slice(0, 3)) { x.gestao(x.dono, f, m, 'convidar'); x.ok(m, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' }) }
  x.avancar(3601)
  const tf = x.topico(x.dono, f, { titulo: 'Quente e fechado' })
  for (const m of x.membros.slice(0, 3)) x.responde(m, tf, 'segredo')
  assert.deepEqual(alta(x, { janela: '7d' }), [], 'tópico de comunidade fechada nunca está em alta')
  assert.deepEqual(x.s.emAlta({ tipo: 'comunidades', janela: '7d' }, x.m.relogio.agora).itens.map((c) => c.id).includes(f), false)
})

test('em alta (comunidades e páginas): novos membros e autores distintos; novos seguidores e atualizações', () => {
  const x = movimentada()
  x.comunidade(x.rover(), { nome: 'Comunidade parada' })
  for (const m of x.membros.slice(0, 2)) x.topico(m, x.c, { titulo: `Tópico de ${m.handle}` })
  const cs = x.s.emAlta({ tipo: 'comunidades' }, x.m.relogio.agora).itens.map((c) => c.id)
  assert.deepEqual(cs, [x.c], 'a parada tem pontuação 0 e não entra')
  const dona = x.rover()
  const p = x.ok(dona, 'pagina-criar', { nome: 'Página em alta', descricao: '', tema: 'rovers' }).id
  x.ok(dona, 'pagina-criar', { nome: 'Página fria', descricao: '', tema: 'rovers' })
  for (const m of x.membros.slice(0, 2)) x.ok(m, 'pagina-seguir', { pagina: p, acao: 'seguir' })
  assert.deepEqual(x.s.emAlta({ tipo: 'paginas' }, x.m.relogio.agora).itens.map((i) => i.id), [p])
  assert.equal(codigoDe(() => x.s.emAlta({ tipo: 'rovers' }, 0)), 'esquema', 'não há ranking de gente')
  assert.equal(codigoDe(() => x.s.emAlta({ tipo: 'topicos', janela: '1h' }, 0)), 'esquema')
})

// ---------- recém-chegados ----------

test('recém-chegados: perfil publicado nos últimos 7 dias, listado, do mais novo ao mais velho', () => {
  const x = nova({ novatos: true })
  const velha = x.rover({ novato: true })
  x.avancar(8 * DIA)
  const a = x.rover({ novato: true })
  x.avancar(10)
  const b = x.rover({ novato: true })
  x.rover({ novato: true, perfil: { listado: false } })
  const itens = x.s.recemChegados({}, x.m.relogio.agora).itens
  assert.deepEqual(itens.map((i) => i.uid), [b.uid, a.uid])
  assert.equal(itens[0].desde, x.m.relogio.agora)
  assert.equal(itens.some((i) => i.uid === velha.uid), false)
  assert.equal(x.s.recemChegados({ limite: 1 }, x.m.relogio.agora).itens.length, 1)
  x.avancar(7 * DIA)
  assert.deepEqual(x.s.recemChegados({}, x.m.relogio.agora).itens, [])
})

// ---------- sugestões ----------

test('sugestões por interesse declarado: comunidades e páginas pelo tema, rovers por interesses e habilidades; sem interesse, nada', () => {
  const x = nova()
  const dono = x.rover()
  const jardim = x.comunidade(x.rover(), { nome: 'Jardim', tema: 'jardinagem' })
  x.comunidade(x.rover(), { nome: 'Cozinha', tema: 'culinaria' })
  x.comunidade(dono, { nome: 'Jardim secreto', tema: 'jardinagem', acesso: 'fechada' })
  const pag = x.ok(dono, 'pagina-criar', { nome: 'Página de jardim', descricao: '', tema: 'jardinagem' }).id
  const gente = x.rover({ perfil: { interesses: ['jardinagem'], habilidades: ['poda'] } })
  x.rover({ perfil: { interesses: ['culinaria'] } })
  x.rover({ perfil: { interesses: ['jardinagem'], listado: false } })
  const sug = (o) => x.s.sugestoes({ leitor: null, ...o }, x.m.relogio.agora).itens
  assert.deepEqual(sug({ tipo: 'comunidades', interesses: 'jardinagem' }).map((c) => c.id), [jardim], 'a fechada nunca é sugerida')
  assert.deepEqual(sug({ tipo: 'paginas', interesses: 'jardinagem,xadrez' }).map((c) => c.id), [pag])
  assert.deepEqual(sug({ tipo: 'rovers', interesses: 'jardinagem' }).map((r) => r.uid), [gente.uid], 'o não listado fica fora')
  assert.deepEqual(sug({ tipo: 'rovers', interesses: 'poda' }).map((r) => r.uid), [gente.uid], 'habilidade também conta')
  assert.deepEqual(sug({ tipo: 'comunidades', interesses: 'jardinagem,culinaria' }).length, 2)
  assert.deepEqual(sug({ tipo: 'comunidades', interesses: 'nada-disso' }), [])
  assert.deepEqual(sug({ tipo: 'comunidades' }), [], 'sem interesse não há o que sugerir')
  assert.deepEqual(sug({ tipo: 'comunidades', rover: gente.uid }).map((c) => c.id), [jardim], 'os interesses vêm do perfil público do rover')
  for (const ruim of ['Jardinagem', 'a', 'a b', 'x'.repeat(25)]) assert.equal(codigoDe(() => sug({ interesses: ruim })), 'esquema', ruim)
  assert.equal(codigoDe(() => sug({ interesses: 'a1,b2,c3,d4,e5,f6,g7,h8,i9' })), 'esquema', 'no máximo 8')
  assert.equal(codigoDe(() => sug({ tipo: 'imagens', interesses: 'a1' })), 'esquema')
  assert.equal(codigoDe(() => sug({ rover: `rvr_${'A'.repeat(22)}` })), 'nao_encontrado')
})

test('sugestão não revela participação: só com a credencial do PRÓPRIO rover o relé deixa de sugerir o que ele já faz parte', () => {
  const x = nova()
  const dono = x.rover()
  const jardim = x.comunidade(x.rover(), { nome: 'Jardim', tema: 'jardinagem' })
  const outra = x.comunidade(x.rover(), { nome: 'Jardim dois', tema: 'jardinagem' })
  const pag = x.ok(dono, 'pagina-criar', { nome: 'Página de jardim', descricao: '', tema: 'jardinagem' }).id
  const alvo = x.rover({ grafo: 'privado', perfil: { interesses: ['jardinagem'] } })
  const curioso = x.rover()
  x.entra(alvo, jardim, { esperar: false })
  x.ok(alvo, 'pagina-seguir', { pagina: pag, acao: 'seguir' })
  const ids = (o) => x.s.sugestoes(o, x.m.relogio.agora).itens.map((c) => c.id).sort()
  const todas = [jardim, outra].sort()
  assert.deepEqual(ids({ tipo: 'comunidades', rover: alvo.uid, leitor: null }), todas, 'sem credencial: sem filtro')
  assert.deepEqual(ids({ tipo: 'comunidades', rover: alvo.uid, leitor: curioso.uid }), todas, 'credencial de outro: sem filtro, para não revelar')
  assert.deepEqual(ids({ tipo: 'comunidades', rover: alvo.uid, leitor: alvo.uid }), [outra], 'o próprio rover: filtra o que já participa')
  assert.deepEqual(ids({ tipo: 'paginas', rover: alvo.uid, leitor: curioso.uid }), [pag])
  assert.deepEqual(ids({ tipo: 'paginas', rover: alvo.uid, leitor: alvo.uid }), [], 'já segue')
  // a mesma regra para rovers: amigos e bloqueados só saem da lista do próprio
  const par = x.rover({ perfil: { interesses: ['jardinagem'] } })
  x.amigos(alvo, par, 0)
  const rovers = (leitor) => x.s.sugestoes({ tipo: 'rovers', rover: alvo.uid, leitor }, x.m.relogio.agora).itens.map((r) => r.uid)
  assert.equal(rovers(curioso.uid).includes(par.uid), true, 'quem não é o próprio não vê o filtro de amizade')
  assert.equal(rovers(alvo.uid).includes(par.uid), false)
  assert.equal(rovers(alvo.uid).includes(alvo.uid), false, 'nunca sugere a si mesmo')
  assert.equal(rovers(curioso.uid).includes(alvo.uid), true, 'o rover aparece como sugestão para outro (ele é listado)')
})

// ---------- tendências ----------

const usaTag = (x, autor, tag) => x.ok(autor, 'postagem', { texto: 'um texto qualquer', topicos: [tag] })

test('tendências: a tag precisa de 3 autores distintos com conta de 1 dia; o mesmo autor repetindo conta 1', () => {
  const x = nova()
  const [a, b, c, d] = [x.rover(), x.rover(), x.rover(), x.rover()]
  for (let i = 0; i < 5; i++) usaTag(x, a, 'solo')
  usaTag(x, a, 'trio'); usaTag(x, b, 'trio'); usaTag(x, c, 'trio')
  usaTag(x, a, 'dupla'); usaTag(x, b, 'dupla')
  usaTag(x, a, 'quarteto'); usaTag(x, b, 'quarteto'); usaTag(x, c, 'quarteto'); usaTag(x, d, 'quarteto')
  const t = x.s.tendencias({}, x.m.relogio.agora).itens
  assert.deepEqual(t, [{ tag: 'quarteto', autores: 4, usos: 4 }, { tag: 'trio', autores: 3, usos: 3 }])
  // hashtag no texto vale como tag
  const y = nova()
  const [p, q, r] = [y.rover(), y.rover(), y.rover()]
  for (const u of [p, q, r]) y.ok(u, 'postagem', { texto: 'gostei muito do #cafe de hoje', topicos: [] })
  assert.deepEqual(y.s.tendencias({}, y.m.relogio.agora).itens.map((i) => i.tag), ['cafe'])
})

test('tendências: não entram conta nova, conteúdo apagado ou escondido, nem tag de comunidade fechada; janela de 24h e 7d', () => {
  const x = nova()
  const dono = x.rover()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const f = x.comunidade(dono, { acesso: 'fechada', nome: 'Fechada com tendência' })
  for (const m of [a, b, c]) { x.gestao(dono, f, m, 'convidar'); x.ok(m, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' }) }
  x.avancar(3601)
  for (const m of [a, b, c]) x.topico(m, f, { titulo: `Tópico de ${m.handle}`, tags: ['segredo'] })
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens, [], 'comunidade fechada nunca gera tendência')
  const posts = [a, b, c].map((m) => usaTag(x, m, 'apagada'))
  assert.equal(x.s.tendencias({}, x.m.relogio.agora).itens.length, 1)
  x.ok(a, 'remocao-pelo-autor', { alvo: posts[0].id })
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens, [], 'apagado o primeiro, sobram 2 autores')
  const novas = [x.rover(), x.rover(), x.rover()]
  for (const m of novas) x.m.armazem.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 3600, u: m.uid })
  for (const m of novas) usaTag(x, m, 'novatas')
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens.map((i) => i.tag), [], 'contas com menos de 1 dia não contam')
  const veteranas = [x.rover(), x.rover(), x.rover()]
  for (const m of veteranas) usaTag(x, m, 'antiga')
  x.avancar(3 * DIA)
  assert.deepEqual(x.s.tendencias({ janela: '24h' }, x.m.relogio.agora).itens, [])
  assert.deepEqual(x.s.tendencias({ janela: '7d' }, x.m.relogio.agora).itens.map((i) => i.tag), ['antiga', 'novatas'], 'passados 3 dias as contas novas já têm mais de 1 dia')
  assert.equal(codigoDe(() => x.s.tendencias({ janela: '1y' }, 0)), 'esquema')
})

test('uma tag escondida por responsável sai das tendências e volta quando a apelação é revertida', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  const ms = [x.rover(), x.rover(), x.rover()]
  for (const m of ms) x.entra(m, c, { esperar: false })
  x.avancar(3601)
  const ts = ms.map((m) => x.topico(m, c, { titulo: `Sobre ${m.handle}`, tags: ['assunto'] }))
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens.map((i) => i.tag), ['assunto'])
  x.ok(dono, 'remocao-por-responsavel', { alvo: ts[0], motivo: 'spam' })
  assert.deepEqual(x.s.tendencias({}, x.m.relogio.agora).itens, [])
})

// ---------- janelas e tetos exatos ----------

test('janela do em alta: 24h e 7d exatos ficam de fora, um segundo a menos entra', () => {
  for (const [janela, duracao] of [['24h', DIA], ['7d', 7 * DIA]]) {
    const x = movimentada()
    const t = x.topico(x.dono, x.c, { titulo: `Tópico da janela ${janela}` })
    const rs = [x.responde(x.membros[0], t, 'primeira'), x.responde(x.membros[1], t, 'segunda')]
    const agora = x.m.relogio.agora
    const poe = (segundos) => { for (const r of rs) x.m.armazem.executar('UPDATE objetos SET recebido_em = :e WHERE id = :id', { e: agora - segundos, id: r }) }
    poe(duracao)
    assert.deepEqual(alta(x, { janela }), [], `${janela}: exatamente na borda sai`)
    poe(duracao - 1)
    assert.deepEqual(alta(x, { janela }), [t], `${janela}: um segundo antes entra`)
  }
})

test('o teto de 20 itens vale para em alta, tendências e sugestões', () => {
  const x = nova()
  const donos = Array.from({ length: 22 }, () => x.rover())
  const coms = donos.map((d, i) => x.comunidade(d, { nome: `Comunidade número ${i}`, tema: 'tetotema' }))
  const ts = coms.map((c, i) => x.topico(donos[i], c, { titulo: `Tópico número ${i}` }))
  const falantes = [x.rover(), x.rover()]
  for (const c of coms) for (const f of falantes) x.m.armazem.executar("INSERT OR IGNORE INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'membro', 1)", { c, u: f.uid })
  for (const t of ts) for (const f of falantes) x.responde(f, t, 'resposta')
  assert.equal(alta(x).length, 20)
  assert.equal(x.s.sugestoes({ tipo: 'comunidades', interesses: 'tetotema', leitor: null }, x.m.relogio.agora).itens.length, 20)
  const autores = [x.rover(), x.rover(), x.rover()]
  const tag = (i) => `tag-${String(i).padStart(2, '0')}`
  for (let g = 0; g < 7; g++) for (const a of autores) x.ok(a, 'postagem', { texto: 'um texto', topicos: [tag(g * 3), tag(g * 3 + 1), tag(g * 3 + 2)] })
  assert.equal(x.s.tendencias({}, x.m.relogio.agora).itens.length, 20)
})

// ---------- mínimos de pontuação, padrões de limite e interesses ----------

test('pontuação mínima do em alta: tópico 2 pontos entra e 1 não; comunidade 3 entra e 2 não; página 2 entra e 1 não', () => {
  const x = movimentada()
  const doisReatores = x.topico(x.dono, x.c, { titulo: 'Dois reatores' })
  const umReator = x.topico(x.dono, x.c, { titulo: 'Um reator' })
  x.ok(x.membros[0], 'reacao', { alvo: doisReatores, reacao: 'curtir' })
  x.ok(x.membros[1], 'reacao', { alvo: doisReatores, reacao: 'curtir' })
  x.ok(x.membros[0], 'reacao', { alvo: umReator, reacao: 'curtir' })
  assert.deepEqual(alta(x), [doisReatores])
  // comunidades: um tópico de um autor = 3 pontos (entra); um novo membro = 2 pontos (não)
  const y = nova()
  const c3 = y.comunidade(y.rover(), { nome: 'Três pontos' })
  const c2 = y.comunidade(y.rover(), { nome: 'Dois pontos' })
  const autor = y.rover()
  y.entra(autor, c3)
  y.topico(autor, c3)
  y.m.armazem.executar('UPDATE membros SET desde = 1 WHERE comunidade = :c AND uid = :u', { c: c3, u: autor.uid })
  y.entra(y.rover(), c2, { esperar: false })
  assert.deepEqual(y.s.emAlta({ tipo: 'comunidades' }, y.m.relogio.agora).itens.map((c) => c.id), [c3])
  // páginas: um seguidor = 1 ponto (não); dois seguidores = 2 pontos (entra)
  const dona = y.rover()
  const p1 = y.ok(dona, 'pagina-criar', { nome: 'Um ponto', descricao: '', tema: 'rovers' }).id
  const p2 = y.ok(y.rover(), 'pagina-criar', { nome: 'Dois pontos', descricao: '', tema: 'rovers' }).id
  const f1 = y.rover(); const f2 = y.rover()
  y.ok(f1, 'pagina-seguir', { pagina: p1, acao: 'seguir' })
  y.ok(f1, 'pagina-seguir', { pagina: p2, acao: 'seguir' })
  y.ok(f2, 'pagina-seguir', { pagina: p2, acao: 'seguir' })
  assert.deepEqual(y.s.emAlta({ tipo: 'paginas' }, y.m.relogio.agora).itens.map((p) => p.id), [p2])
})

test('padrões: a busca devolve 20 por página sem limite, o recém-chegado 50, e uma página com exatamente o que há não tem próxima', () => {
  const x = nova()
  for (let i = 0; i < 22; i++) x.ok(x.rover(), 'pagina-criar', { nome: `Pagina azulejo ${i}`, descricao: '', tema: 'rovers' })
  const padrao = x.s.buscar({ q: 'azulejo', tipo: 'paginas' }, x.m.relogio.agora)
  assert.equal(padrao.itens.length, 20)
  assert.equal(padrao.proximo, 20)
  const exata = x.s.buscar({ q: 'azulejo', tipo: 'paginas', limite: 22 }, x.m.relogio.agora)
  assert.equal(exata.itens.length, 22)
  assert.equal(exata.proximo, null)
  const y = nova({ novatos: true })
  for (let i = 0; i < 52; i++) y.rover({ novato: true })
  assert.equal(y.s.recemChegados({}, y.m.relogio.agora).itens.length, 50)
})

test('interesses: 8 valem, 9 não; os do perfil do rover somam aos pedidos', () => {
  const x = nova()
  const dono = x.rover()
  const temas = Array.from({ length: 9 }, (_, i) => `tema-${i}`)
  for (const t of temas) x.comunidade(x.rover(), { nome: `Comunidade ${t}`, tema: t })
  const sug = (o) => x.s.sugestoes({ leitor: null, ...o }, x.m.relogio.agora).itens.length
  assert.equal(sug({ interesses: temas.slice(0, 8).join(',') }), 8)
  assert.equal(codigoDe(() => sug({ interesses: temas.join(',') })), 'esquema')
  const comPerfil = x.rover({ perfil: { interesses: ['tema-8'], habilidades: ['tema-7'] } })
  assert.equal(sug({ interesses: 'tema-0', rover: comPerfil.uid }), 3, 'o pedido (tema-0) e o perfil (tema-8 e tema-7)')
  void dono
})
