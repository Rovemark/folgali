// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3.2 (proposta 0007): o painel de início (`inicio`) e os anúncios do relé. O painel só devolve ids, contagens e carimbos, e nada de
// quem o leitor bloqueou ou silenciou. Os anúncios só nascem pela administração: nenhum objeto assinado escreve neles.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DIA, codigoDe, erroDe, nova } from '../ajuda/rede.js'

function mundo() {
  const x = nova()
  const dono = x.rover()
  const [ana, beto, caio, duda, eli] = [x.rover(), x.rover(), x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono, { categorias: [] })
  for (const r of [ana, beto, caio, duda, eli]) { x.entra(r, c, { esperar: false }); x.avancar(1) }
  x.avancar(3601)
  const inicio = (quem, o = {}) => x.s.inicio({ credencial: x.como(quem, '/v1/inicio'), ...o })
  return Object.assign(x, { dono, ana, beto, caio, duda, eli, c, inicio })
}

test('sem credencial, o painel é 401 (leitura_nao_autorizada); com credencial vem inteiro e vazio num mundo parado', () => {
  const x = mundo()
  assert.equal(codigoDe(() => x.s.inicio({})), 'leitura_nao_autorizada')
  const p = x.inicio(x.ana)
  assert.deepEqual(Object.keys(p), ['agora', 'voce', 'avisos', 'atividade', 'pendencias', 'moderacao', 'anuncios'])
  assert.equal(p.agora, x.m.relogio.agora)
  assert.deepEqual(p.voce, { uid: x.ana.uid, contaDesde: x.rele.armazem.rover(x.ana.uid).criado_em, atestadoExpiraEm: x.rele.armazem.rover(x.ana.uid).atestado_expira_em })
  assert.deepEqual(p.avisos, { total: 0, porTipo: {} })
  assert.deepEqual(p.atividade, [])
  assert.deepEqual(p.pendencias, { amizades: { n: 0, uids: [] }, depoimentos: 0, convites: [], pedidosDeEntrada: [] })
  assert.deepEqual(p.moderacao, [])
  assert.deepEqual(p.anuncios, { novos: 0, ultimo: null })
})

test('desde é um inteiro de 0 para cima', () => {
  const x = mundo()
  for (const ruim of [-1, 1.5, '5', null, NaN]) assert.equal(codigoDe(() => x.inicio(x.ana, { desde: ruim })), 'esquema', String(ruim))
})

test('avisos: contados por tipo, só os de depois de desde', () => {
  const x = mundo()
  const t = x.topico(x.ana, x.c)
  x.responde(x.beto, t, 'primeira'); x.avancar(5)
  x.ok(x.duda, 'recado', { alvo: x.ana.uid, texto: 'Oi, passei por aqui.' })
  const corte = x.m.relogio.agora
  x.avancar(10)
  x.responde(x.caio, t, 'segunda')
  const tudo = x.inicio(x.ana).avisos
  assert.equal(tudo.porTipo['resposta-no-topico'], 2)
  assert.equal(tudo.porTipo.recado, 1)
  assert.equal(tudo.total, 3)
  const recente = x.inicio(x.ana, { desde: corte }).avisos
  assert.deepEqual(recente, { total: 1, porTipo: { 'resposta-no-topico': 1 } }, 'só a resposta que veio depois do corte')
  assert.equal(x.inicio(x.ana, { desde: x.m.relogio.agora }).avisos.total, 0)
  assert.equal(x.inicio(x.beto).avisos.total, 0, 'o painel é de quem lê, não de todos')
})

test('quem o leitor silenciou ou bloqueou depois do fato sai do painel, mas continua na lista de avisos', () => {
  const x = mundo()
  const t = x.topico(x.ana, x.c)
  x.responde(x.beto, t, 'resposta do beto')
  x.responde(x.caio, t, 'resposta do caio')
  x.reacao = undefined
  x.ok(x.eli, 'reacao', { alvo: t, reacao: 'curtir' })
  assert.equal(x.inicio(x.ana).avisos.total, 2)
  assert.deepEqual(x.inicio(x.ana).atividade, [{ tipo: 'topico', id: t, respostas: 2, reacoes: 1 }])
  x.ok(x.ana, 'relacao', { alvo: x.beto.uid, acao: 'silenciar' })
  x.ok(x.ana, 'relacao', { alvo: x.eli.uid, acao: 'bloquear' })
  assert.equal(x.inicio(x.ana).avisos.total, 1, 'sobrou só o aviso do caio')
  assert.deepEqual(x.inicio(x.ana).atividade, [{ tipo: 'topico', id: t, respostas: 1, reacoes: 0 }], 'a resposta do beto e a reação do eli não contam')
  assert.equal(x.s.listar(x.ana.uid, { limite: 50 }, x.m.relogio.agora).itens.filter((n) => n.tipo === 'resposta-no-topico').length, 2, 'a lista de avisos continua inteira')
})

test('rover bloqueado pelo operador (invisível) sai das contagens do painel', () => {
  const x = mundo()
  const t = x.topico(x.ana, x.c)
  x.responde(x.beto, t, 'resposta')
  assert.equal(x.inicio(x.ana).avisos.total, 1)
  x.rele.bloquear({ tipo: 'rover', alvo: x.beto.uid, motivo: 'x' })
  assert.equal(x.inicio(x.ana).avisos.total, 0)
  assert.deepEqual(x.inicio(x.ana).atividade, [])
})

test('atividade: tópicos e postagens do leitor, respostas e pessoas distintas que reagiram, nunca o que o leitor mesmo fez', () => {
  const x = mundo()
  const t = x.topico(x.ana, x.c)
  const quieto = x.topico(x.ana, x.c, { titulo: 'Sem novidade nenhuma' })
  const post = x.ok(x.ana, 'postagem', { texto: 'uma postagem da ana', topicos: [] }).id
  for (const r of [x.beto, x.caio]) x.responde(r, t, 'resposta de fora')
  x.responde(x.beto, t, 'outra do mesmo beto')
  x.responde(x.ana, t, 'a própria ana respondendo')
  x.ok(x.eli, 'reacao', { alvo: t, reacao: 'curtir' })
  x.ok(x.duda, 'reacao', { alvo: t, reacao: 'util' })
  x.ok(x.ana, 'reacao', { alvo: t, reacao: 'curtir' })
  x.ok(x.beto, 'resposta', { alvo: post, texto: 'resposta à postagem' })
  x.ok(x.caio, 'reacao', { alvo: post, reacao: 'curtir' })
  const a = x.inicio(x.ana).atividade
  assert.equal(a.length, 2, 'o tópico sem novidade não aparece')
  assert.ok(!a.some((i) => i.id === quieto))
  const topico = a.find((i) => i.id === t)
  assert.deepEqual(topico, { tipo: 'topico', id: t, respostas: 3, reacoes: 2 }, '3 respostas de fora (a da ana não conta), 2 pessoas reagiram (a ana não conta)')
  assert.deepEqual(a.find((i) => i.id === post), { tipo: 'postagem', id: post, respostas: 1, reacoes: 1 })
  assert.deepEqual(Object.keys(topico), ['tipo', 'id', 'respostas', 'reacoes'], 'só ids e contagens')
  assert.equal(x.inicio(x.ana, { desde: x.m.relogio.agora }).atividade.length, 0, 'desde no futuro: nada')
})

test('atividade tem teto de 20 itens', () => {
  const x = mundo()
  const posts = []
  for (let i = 0; i < 25; i++) { posts.push(x.ok(x.ana, 'postagem', { texto: `postagem número ${i} da ana`, topicos: [] }).id); x.avancar(1000) }
  for (const p of posts.slice(-22)) { x.ok(x.beto, 'resposta', { alvo: p, texto: 'uma resposta' }); x.avancar(1) }
  assert.equal(x.inicio(x.ana).atividade.length, 20)
})

test('pendências: pedidos de amizade (visíveis e não bloqueados), depoimentos, convites e pedidos de entrada', () => {
  const x = mundo()
  x.ok(x.beto, 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  x.ok(x.duda, 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  x.ok(x.caio, 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  x.ok(x.ana, 'relacao', { alvo: x.duda.uid, acao: 'bloquear' })
  x.rele.bloquear({ tipo: 'rover', alvo: x.caio.uid, motivo: 'x' })
  const p = x.inicio(x.ana).pendencias
  assert.deepEqual(p.amizades, { n: 1, uids: [x.beto.uid] }, 'a pedida pela duda (bloqueada) e pelo caio (invisível) não entram')
  x.amigos(x.eli, x.ana, 8)
  x.ok(x.eli, 'depoimento', { alvo: x.ana.uid, texto: 'Trabalha com capricho e entrega no prazo.' })
  assert.equal(x.inicio(x.ana).pendencias.depoimentos, 1)
  const fechada = x.comunidade(x.dono, { acesso: 'fechada' })
  x.gestao(x.dono, fechada, x.ana, 'convidar')
  assert.deepEqual(x.inicio(x.ana).pendencias.convites, [{ comunidade: fechada }])
  const moderada = x.comunidade(x.dono, { acesso: 'moderada' })
  x.ok(x.ana, 'comunidade-adesao', { comunidade: moderada, acao: 'entrar' })
  x.gestao(x.dono, moderada, x.ana, 'aprovar-pedido')
  x.gestao(x.dono, moderada, x.ana, 'promover')
  x.ok(x.eli, 'comunidade-adesao', { comunidade: moderada, acao: 'entrar' })
  x.ok(x.beto, 'comunidade-adesao', { comunidade: moderada, acao: 'entrar' })
  assert.deepEqual(x.inicio(x.ana).pendencias.pedidosDeEntrada, [{ comunidade: moderada, n: 2 }])
  assert.deepEqual(x.inicio(x.eli).pendencias.pedidosDeEntrada, [], 'só quem modera vê os pedidos da comunidade')
})

test('pendências: no máximo 10 uids de pedidos de amizade, e a contagem diz quantos são', () => {
  const x = mundo()
  for (let i = 0; i < 12; i++) x.ok(x.rover(), 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  const a = x.inicio(x.ana).pendencias.amizades
  assert.equal(a.n, 12)
  assert.equal(a.uids.length, 10)
  for (const u of a.uids) assert.match(u, /^rvr_[A-Za-z0-9_-]{22}$/)
})

test('moderação: denúncias abertas e apelações só para quem modera; dispensar tira da conta', () => {
  const x = mundo()
  x.gestao(x.dono, x.c, x.ana, 'promover')
  const t = x.topico(x.beto, x.c, { titulo: 'Conteúdo denunciado' })
  assert.equal(x.faz(x.caio, 'denuncia', { alvo: t, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.faz(x.duda, 'denuncia', { alvo: t, motivo: 'spam' }).estado, 'recebida')
  assert.deepEqual(x.inicio(x.ana).moderacao, [{ comunidade: x.c, denuncias: 1, apelacoes: 0 }], 'dois denunciantes, um alvo: conta o alvo')
  assert.deepEqual(x.inicio(x.dono).moderacao, [{ comunidade: x.c, denuncias: 1, apelacoes: 0 }])
  assert.deepEqual(x.inicio(x.caio).moderacao, [], 'quem não modera não vê a fila')
  x.ok(x.ana, 'denuncia-dispensar', { comunidade: x.c, alvo: t })
  assert.deepEqual(x.inicio(x.ana).moderacao, [], 'dispensada, some da conta (e a comunidade sem nada não aparece)')
  const t2 = x.topico(x.caio, x.c, { titulo: 'Será removido' })
  x.ok(x.ana, 'remocao-por-responsavel', { alvo: t2, motivo: 'spam' })
  x.ok(x.caio, 'apelacao', { tipo: 'remocao', alvo: t2, texto: 'Acho que foi um engano.' })
  assert.deepEqual(x.inicio(x.dono).moderacao, [{ comunidade: x.c, denuncias: 0, apelacoes: 1 }], 'a apelação de remoção de moderador é do dono')
  assert.deepEqual(x.inicio(x.ana).moderacao, [], 'o moderador não decide a apelação da própria remoção')
})

test('nenhum texto de terceiros, nome ou handle no painel: só ids, contagens e carimbos', () => {
  const x = mundo()
  const t = x.topico(x.ana, x.c, { titulo: 'Titulomarcador', texto: 'Textomarcador do topico' })
  x.responde(x.beto, t, 'Respostamarcador de fora')
  x.ok(x.caio, 'amizade', { alvo: x.ana.uid, acao: 'pedir' })
  x.ok(x.duda, 'recado', { alvo: x.ana.uid, texto: 'Recadomarcador pessoal' })
  const fechada = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Nomemarcador secreto' })
  x.gestao(x.dono, fechada, x.ana, 'convidar')
  const texto = JSON.stringify(x.inicio(x.ana))
  for (const marcador of ['marcador', x.beto.handle, x.caio.handle, x.duda.handle, x.ana.handle]) assert.equal(texto.includes(marcador), false, marcador)
  const folhas = []
  const anda = (v) => { if (v !== null && typeof v === 'object') Object.values(v).forEach(anda); else folhas.push(v) }
  anda(JSON.parse(texto))
  for (const f of folhas.filter((f) => typeof f === 'string')) assert.match(f, /^(rvr|ob|an)_[A-Za-z0-9_-]+$|^[a-z-]+$/, `só ids ou nomes de tipo, e veio ${f}`)
})

test('atestado vencido: o painel passa a ser 401 (e atestadoExpiraEm avisava a data)', () => {
  const x = mundo()
  const expira = x.inicio(x.ana).voce.atestadoExpiraEm
  assert.ok(expira > x.m.relogio.agora)
  x.m.avancar(expira - x.m.relogio.agora + 10)
  assert.equal(codigoDe(() => x.inicio(x.ana)), 'leitura_nao_autorizada')
})

// ---------- anúncios ----------

test('anúncios: a administração publica, todo mundo lê; os fixados vêm primeiro e depois os mais novos', () => {
  const x = mundo()
  const a = x.s.publicarAnuncio({ titulo: 'Manutenção hoje', texto: 'O relé reinicia às 3h.' }).id
  x.avancar(5)
  const b = x.s.publicarAnuncio({ titulo: 'Regra nova', texto: 'Leia a página de regras.', fixado: true }).id
  x.avancar(5)
  const c = x.s.publicarAnuncio({ titulo: 'Domínio novo', texto: 'Vamos mudar de endereço.' }).id
  assert.match(a, /^an_[A-Za-z0-9_-]{22}$/)
  const lista = x.s.listarAnuncios({ limite: 20 })
  assert.deepEqual(lista.itens.map((i) => i.id), [b, c, a])
  assert.deepEqual(lista.itens.map((i) => i.fixado), [true, false, false])
  assert.deepEqual(Object.keys(lista.itens[0]), ['id', 'titulo', 'texto', 'em', 'fixado'])
  assert.equal(x.s.anuncio(b).titulo, 'Regra nova')
  const p1 = x.s.listarAnuncios({ limite: 2 })
  assert.equal(p1.proximo, 2)
  assert.deepEqual(x.s.listarAnuncios({ limite: 2, antes: 2 }).itens.map((i) => i.id), [a])
  assert.equal(codigoDe(() => x.s.anuncio('an_naoexiste00000000000')), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.anuncio('qualquer')), 'nao_encontrado')
})

test('anúncios no painel: só quantos são novos e o último (id e carimbo), nunca o texto', () => {
  const x = mundo()
  const antes = x.m.relogio.agora
  x.avancar(10)
  const id = x.s.publicarAnuncio({ titulo: 'Titulodoanuncio', texto: 'Textodoanuncio' }).id
  const p = x.inicio(x.ana).anuncios
  assert.deepEqual(p, { novos: 1, ultimo: { id, em: x.m.relogio.agora } })
  assert.equal(JSON.stringify(p).includes('doanuncio'), false)
  assert.equal(x.inicio(x.ana, { desde: antes }).anuncios.novos, 1)
  assert.equal(x.inicio(x.ana, { desde: x.m.relogio.agora }).anuncios.novos, 0)
})

test('anúncios: no máximo 3 fixados, e remover libera a vaga', () => {
  const x = mundo()
  const ids = [1, 2, 3].map((i) => x.s.publicarAnuncio({ titulo: `Fixado ${i}`, texto: 'texto', fixado: true }).id)
  assert.equal(codigoDe(() => x.s.publicarAnuncio({ titulo: 'Quarto', texto: 'texto', fixado: true })), 'limite_de_estrutura')
  x.s.publicarAnuncio({ titulo: 'Solto', texto: 'texto' })
  assert.deepEqual(x.s.removerAnuncio(ids[0]), { removido: true })
  x.s.publicarAnuncio({ titulo: 'Quarto agora cabe', texto: 'texto', fixado: true })
  assert.equal(codigoDe(() => x.s.removerAnuncio(ids[0])), 'nao_encontrado', 'já removido')
  assert.equal(codigoDe(() => x.s.removerAnuncio('nao-e-id')), 'nao_encontrado')
})

test('anúncios: texto puro e corpo fechado', () => {
  const x = mundo()
  const bom = { titulo: 'Aviso', texto: 'Veja https://roverhangar.com/regras para os detalhes. Contato: seguranca@roverhangar.com' }
  assert.match(x.s.publicarAnuncio(bom).id, /^an_/)
  const ruins = {
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
  for (const [nome, corpo] of Object.entries(ruins)) assert.equal(codigoDe(() => x.s.publicarAnuncio(corpo)), 'esquema', nome)
  assert.equal(codigoDe(() => x.s.publicarAnuncio(null)), 'esquema')
  assert.equal(codigoDe(() => x.s.publicarAnuncio([])), 'esquema')
  assert.equal(x.s.listarAnuncios({ limite: 50 }).itens.length, 1, 'nenhuma recusa deixou anúncio')
})

test('nenhum objeto assinado escreve nos anúncios: a comunidade oficial é virtual', () => {
  const x = mundo()
  assert.equal(x.rele.armazem.um("SELECT 1 AS n FROM comunidades WHERE id = 'anuncios'", {}), null, 'não existe linha de comunidade')
  for (const corpo of [
    { comunidade: 'anuncios', categoria: null, titulo: 'Tentativa', texto: 'texto', tags: [], enquete: null },
    { comunidade: `ob_${'Z'.repeat(43)}`, categoria: null, titulo: 'Tentativa', texto: 'texto', tags: [], enquete: null }
  ]) {
    const c = x.cod(x.ana, 'topico', corpo)
    assert.ok(['esquema', 'nao_encontrado'].includes(c), c)
  }
  assert.equal(x.cod(x.dono, 'comunidade-adesao', { comunidade: 'anuncios', acao: 'entrar' }), 'esquema')
  assert.equal(x.cod(x.dono, 'comunidade-vocabulario', { comunidade: 'anuncios', etiquetas: [], status: [] }), 'esquema')
  assert.equal(x.s.listarAnuncios({ limite: 50 }).itens.length, 0, 'e nenhuma das tentativas criou anúncio')
  assert.ok(DIA > 0)
})

// ---------- furos que o medidor de mutação achou ----------

test('avisos: lê no máximo os 500 mais novos (o teto de retenção), nem um a menos nem um a mais', () => {
  const x = mundo()
  for (let i = 0; i < 501; i++) x.s.avisar(x.ana.uid, 'recado', {}, x.m.relogio.agora)
  assert.equal(x.inicio(x.ana).avisos.total, 500)
  assert.deepEqual(x.inicio(x.ana).avisos.porTipo, { recado: 500 })
})

test('atividade: um tópico com uma única reação e nenhuma resposta aparece', () => {
  const x = mundo()
  const t = x.topico(x.ana, x.c)
  x.ok(x.beto, 'reacao', { alvo: t, reacao: 'curtir' })
  assert.deepEqual(x.inicio(x.ana).atividade, [{ tipo: 'topico', id: t, respostas: 0, reacoes: 1 }])
})

test('pendências e moderação: no máximo 20 comunidades, e comunidade encerrada não conta', () => {
  const x = mundo()
  const db = x.rele.armazem
  for (let i = 0; i < 22; i++) {
    const id = `ob_comunidade${String(i).padStart(2, '0')}`
    db.executar(
      "INSERT INTO comunidades (id, dono, nome, chave_nome, descricao, regras, tema, acesso, categorias, criada_em, seq, atividade_em, atividade_seq, versao_id) VALUES (:id, :dono, :nome, :chave, 'd', 'r', 'rovers', 'moderada', '[]', 1, :seq, 1, :seq, :id)",
      { id, dono: x.eli.uid, nome: `Comunidade ${i}`, chave: `comunidade ${i}`, seq: 1000 + i }
    )
    db.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:id, :uid, 'moderador', 1)", { id, uid: x.ana.uid })
    db.executar("INSERT INTO pedidos_de_entrada (comunidade, uid, em) VALUES (:id, :uid, 1)", { id, uid: x.beto.uid })
  }
  assert.equal(x.inicio(x.ana).pendencias.pedidosDeEntrada.length, 20, 'o painel traz até 20 comunidades')
  // encerrada: some da moderação mesmo com denúncia aberta num conteúdo vivo
  const c = x.comunidade(x.dono, { acesso: 'aberta' })
  x.entra(x.caio, c, { esperar: true })
  const t = x.topico(x.caio, c, { titulo: 'Conteúdo da comunidade que vai fechar' })
  assert.equal(x.faz(x.beto, 'denuncia', { alvo: t, motivo: 'spam' }).estado, 'recebida')
  assert.deepEqual(x.inicio(x.dono).moderacao, [{ comunidade: c, denuncias: 1, apelacoes: 0 }])
  // marca como encerrada direto no banco, deixando a denúncia e o papel de pé: a guarda do painel é que tem de esconder
  db.executar('UPDATE comunidades SET encerrada_em = :t WHERE id = :id', { t: x.m.relogio.agora, id: c })
  assert.deepEqual(x.inicio(x.dono).moderacao, [], 'comunidade encerrada: nada na moderação')
})

test('anúncios: o que o operador pode escrever (e-mail, várias linhas, três links) e o que não pode (hashtags demais)', () => {
  const x = mundo()
  assert.match(x.s.publicarAnuncio({ titulo: 'Fale com seguranca@roverhangar.com', texto: 'texto' }).id, /^an_/, 'e-mail de contato no título')
  assert.match(x.s.publicarAnuncio({ titulo: 'Aviso', texto: 'linha um\nlinha dois\nlinha três' }).id, /^an_/, 'várias linhas no texto')
  assert.match(x.s.publicarAnuncio({ titulo: 'Aviso', texto: 'https://a.com/1 https://b.com/2 https://c.com/3' }).id, /^an_/, 'exatamente três links https')
  assert.equal(erroDe(() => x.s.publicarAnuncio({ titulo: 'Aviso #aa #bb #cc #dd #ee #ff', texto: 'texto' })).campo, 'titulo', 'o título segue as regras de texto da rede (hashtags demais)')
  assert.equal(erroDe(() => x.s.publicarAnuncio({ titulo: 'Aviso', texto: 'texto\nsegunda linha\n\n\n\nquinta' })).campo, 'texto', 'quebras demais em sequência')
  for (const corpo of ['Aviso', [], null, 42]) assert.equal(erroDe(() => x.s.publicarAnuncio(corpo)).campo, 'corpo', JSON.stringify(corpo))
})

test('anúncios: só vale id em texto; um id que vem em lista (que viraria texto ao ser comparado) é "não encontrado", nunca erro de banco', () => {
  const x = mundo()
  const id = x.s.publicarAnuncio({ titulo: 'Aviso', texto: 'texto' }).id
  for (const ruim of [[id], { toString: () => id }, 42, null, undefined]) {
    assert.equal(codigoDe(() => x.s.anuncio(ruim)), 'nao_encontrado', String(typeof ruim))
    assert.equal(codigoDe(() => x.s.removerAnuncio(ruim)), 'nao_encontrado', String(typeof ruim))
  }
  assert.equal(x.s.anuncio(id).id, id, 'o anúncio continua lá')
  assert.deepEqual(x.s.removerAnuncio(id), { removido: true })
})
