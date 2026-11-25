// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.3.1 (proposta 0006): campos e rotas aditivos. Cada teste diz o que a 0.3 não dava, prova o que passou a dar e prova
// que a privacidade e a compatibilidade ficaram de pé (grafo privado, comunidade fechada, rover banido, o que o leitor não pode ver).
import test from 'node:test'
import assert from 'node:assert/strict'
import { codigoDe, nova } from '../ajuda/rede.js'
import { politicaDe } from '../ajuda/mundo.js'

function forum() {
  const x = nova()
  const dono = x.rover()
  const mod = x.rover()
  const [ana, beto, caio] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono, { categorias: ['Geral'] })
  for (const r of [mod, ana, beto, caio]) { x.entra(r, c, { esperar: false }); x.avancar(1) }
  x.gestao(dono, c, mod, 'promover')
  x.avancar(3601)
  return Object.assign(x, { dono, mod, ana, beto, caio, c })
}
const avisos = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens

// ---------- perfil e avisos ----------

test('perfilId: o id do objeto perfil vigente, para poder denunciar o perfil; some quando o rover ainda não publicou um', () => {
  const x = nova()
  const [a, b] = [x.rover(), x.rover()]
  const p = x.s.paginaDoRover(a.uid, {})
  assert.match(p.rover.perfilId, /^ob_/)
  assert.equal(x.rele.perfil(a.uid).perfilId, p.rover.perfilId)
  assert.equal(x.faz(b, 'denuncia', { alvo: p.rover.perfilId, motivo: 'spam' }).estado, 'recebida', 'o id serve de alvo de denúncia')
})

test('voce: amigoDesde, contaDesde e selosQueDei só existem para quem lê com credencial e falam só do leitor', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  assert.equal(x.s.paginaDoRover(a.uid, {}).voce, null, 'sem credencial não há voce')
  let v = x.s.paginaDoRover(a.uid, { credencial: x.como(b) }).voce
  assert.equal(v.amigoDesde, null)
  assert.equal(v.contaDesde, x.rele.armazem.rover(b.uid).criado_em)
  assert.deepEqual(v.selosQueDei, [])
  const quando = x.m.relogio.agora
  x.amigos(a, b, 8)
  v = x.s.paginaDoRover(a.uid, { credencial: x.como(b) }).voce
  assert.equal(v.amigoDesde, quando, 'a amizade ficou ativa no momento do aceite')
  x.ok(b, 'selo', { alvo: a.uid, selo: 'confiavel' })
  assert.deepEqual(x.s.paginaDoRover(a.uid, { credencial: x.como(b) }).voce.selosQueDei, ['confiavel'])
  assert.deepEqual(x.s.paginaDoRover(a.uid, { credencial: x.como(c) }).voce.selosQueDei, [], 'o selo de b não aparece para c')
  assert.deepEqual(x.s.paginaDoRover(b.uid, { credencial: x.como(a) }).voce.selosQueDei, [], 'e a pessoa que recebeu não vê "dei"')
  assert.equal(x.s.paginaDoRover(a.uid, { credencial: x.como(c) }).voce.amigoDesde, null)
})

test('contagens.seguidores e seguindo: as mesmas regras de grafo de contagens.amigos', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  x.ok(b, 'seguir', { alvo: a.uid })
  x.ok(a, 'seguir', { alvo: c.uid })
  const publico = x.s.paginaDoRover(a.uid, {}).contagens
  assert.equal(publico.seguidores, 1)
  assert.equal(publico.seguindo, 1)
  const reservada = x.rover({ grafo: 'privado' })
  x.ok(b, 'seguir', { alvo: reservada.uid })
  assert.equal(x.s.paginaDoRover(reservada.uid, {}).contagens.seguidores, null, 'grafo privado não mostra contagem a quem não é o rover')
  assert.equal(x.s.paginaDoRover(reservada.uid, {}).contagens.seguindo, null)
  assert.equal(x.s.paginaDoRover(reservada.uid, { credencial: x.como(b) }).contagens.seguidores, null)
  assert.equal(x.s.paginaDoRover(reservada.uid, { credencial: x.como(reservada) }).contagens.seguidores, 1, 'o próprio rover vê')
})

test('avisos com nomes: lugar e topico só quando o leitor pode ver; o texto continua fora do aviso', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Qual a melhor planilha?' })
  const r = x.responde(x.beto, t, 'uma resposta secreta')
  const n = avisos(x, x.ana).find((a) => a.objeto === r)
  assert.deepEqual(n.topico, { id: t, titulo: 'Qual a melhor planilha?' })
  assert.deepEqual(n.lugar, { tipo: 'comunidade', id: x.c, nome: x.s.comunidade(x.c).nome })
  assert.equal(JSON.stringify(n).includes('secreta'), false, 'só o título do tópico e o nome do lugar, nunca o texto da resposta')
  x.ok(x.mod, 'remocao-por-responsavel', { alvo: r, motivo: 'spam' })
  const depois = avisos(x, x.ana).find((a) => a.seq === n.seq)
  assert.equal(depois.topico, null, 'resposta removida: o aviso não leva a lugar nenhum')
  assert.equal(depois.objeto, null)
})

test('avisos com nomes: página, e comunidade fechada de que a pessoa saiu ou foi banida não aparece', () => {
  const x = nova()
  const [dono, seg] = [x.rover(), x.rover()]
  const pag = x.ok(dono, 'pagina-criar', { nome: 'Página dos avisos', descricao: '', tema: 'rovers' }).id
  x.ok(seg, 'pagina-seguir', { pagina: pag, acao: 'seguir' })
  const n = avisos(x, dono).find((a) => a.tipo === 'novo-seguidor')
  assert.deepEqual(n.lugar, { tipo: 'pagina', id: pag, nome: 'Página dos avisos' })
  assert.equal(n.topico, null)
  const fechada = x.comunidade(dono, { acesso: 'fechada', nome: 'Fechada dos avisos' })
  x.gestao(dono, fechada, seg, 'convidar')
  const convite = avisos(x, seg).find((a) => a.tipo === 'convite-comunidade')
  assert.equal(convite.lugar.nome, 'Fechada dos avisos', 'quem foi convidado vê o nome (o cartão mínimo já mostrava)')
  x.ok(seg, 'comunidade-adesao', { comunidade: fechada, acao: 'aceitar-convite' })
  x.gestao(dono, fechada, seg, 'banir', 'spam')
  const banido = avisos(x, seg).find((a) => a.tipo === 'banido')
  assert.equal(banido.comunidade, null, 'quem foi banido de comunidade fechada não a enxerga mais')
  assert.equal(banido.lugar, null, 'e o nome também some')
})

test('depoimentos?estado=enviados: o autor lê o que escreveu e ainda espera decisão; só ele', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  x.amigos(a, b, 8)
  const dep = x.ok(a, 'depoimento', { alvo: b.uid, texto: 'Trabalha com capricho e entrega no prazo.' })
  const lista = x.s.depoimentos(a.uid, { estado: 'enviados', credencial: x.como(a) })
  assert.equal(lista.itens.length, 1)
  assert.equal(lista.itens[0].alvo.uid, b.uid)
  assert.equal(lista.itens[0].estado, 'pendente')
  assert.equal(lista.itens[0].envelope.objeto.id, dep.id)
  assert.equal(codigoDe(() => x.s.depoimentos(a.uid, { estado: 'enviados', credencial: x.como(b) })), 'sem_permissao')
  assert.equal(codigoDe(() => x.s.depoimentos(a.uid, { estado: 'enviados', credencial: x.como(c) })), 'sem_permissao')
  assert.equal(codigoDe(() => x.s.depoimentos(a.uid, { estado: 'enviados', credencial: null })), 'leitura_nao_autorizada')
  assert.equal(codigoDe(() => x.s.depoimentos(a.uid, { estado: 'todos', credencial: x.como(a) })), 'esquema')
  assert.deepEqual(x.s.depoimentos(b.uid, { estado: 'enviados', credencial: x.como(b) }).itens, [], 'quem recebeu não tem "enviados"')
  x.ok(b, 'depoimento-decisao', { depoimento: dep.id, decisao: 'aceitar' })
  assert.deepEqual(x.s.depoimentos(a.uid, { estado: 'enviados', credencial: x.como(a) }).itens, [], 'decidido, deixa de esperar')
})

// ---------- comunidades e fórum ----------

test('voce.banidoEm e voce.membroDesde: as datas do próprio leitor', () => {
  const x = forum()
  const antes = x.m.relogio.agora
  const v = x.s.comunidadeDetalhe(x.c, { credencial: x.como(x.ana) }).voce
  assert.ok(v.membroDesde < antes && v.membroDesde > antes - 3700, 'a data em que a ana entrou')
  assert.equal(v.banidoEm, null)
  const quando = x.m.relogio.agora
  x.gestao(x.dono, x.c, x.caio, 'banir', 'spam')
  const b = x.s.comunidadeDetalhe(x.c, { credencial: x.como(x.caio) }).voce
  assert.equal(b.banidoEm, quando)
  assert.equal(b.membroDesde, null, 'quem foi banido deixou de ser membro')
  assert.equal(x.s.comunidadeDetalhe(x.c, { credencial: x.como(x.beto) }).voce.banidoEm, null, 'o banimento do caio não aparece para o beto')
})

test('removidos: o autor lê o que a moderação removeu do que ele escreveu; ninguém mais', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Conteúdo a remover' })
  const outro = x.topico(x.beto, x.c, { titulo: 'Conteúdo do beto' })
  x.ok(x.mod, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' })
  const lista = x.s.removidosDe(x.ana.uid, { credencial: x.como(x.ana) })
  assert.equal(lista.itens.length, 1)
  const i = lista.itens[0]
  assert.equal(i.alvo, t)
  assert.equal(i.alvoTipo, 'topico')
  assert.equal(i.por, 'moderador')
  assert.equal(i.motivo, 'spam')
  assert.equal(i.apelacao, null)
  assert.equal(i.envelope.objeto.corpo.titulo, 'Conteúdo a remover', 'o autor vê o que foi removido, para poder apelar')
  assert.equal(JSON.stringify(lista).includes(outro), false, 'o do beto não aparece na lista da ana')
  assert.equal(codigoDe(() => x.s.removidosDe(x.ana.uid, { credencial: x.como(x.beto) })), 'sem_permissao')
  assert.equal(codigoDe(() => x.s.removidosDe(x.ana.uid, { credencial: null })), 'leitura_nao_autorizada')
  assert.deepEqual(x.s.removidosDe(x.beto.uid, { credencial: x.como(x.beto) }).itens, [])
})

test('fila: cada denúncia traz o tópico onde o alvo vive (o próprio tópico, ou o tópico da resposta)', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tópico denunciado' })
  const r = x.responde(x.caio, t, 'resposta denunciada')
  x.faz(x.beto, 'denuncia', { alvo: t, motivo: 'spam' })
  x.faz(x.beto, 'denuncia', { alvo: r, motivo: 'spam' })
  const fila = x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) })
  const por = Object.fromEntries(fila.denuncias.map((d) => [d.alvo, d]))
  assert.equal(por[t].topico, t)
  assert.equal(por[r].topico, t)
  assert.equal(por[r].alvoTipo, 'resposta-forum')
})

test('denuncia-dispensar: tira da fila sem apagar o conteúdo, entra no registro público e não libera quem denunciou', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tópico em dúvida' })
  const r = x.responde(x.caio, t, 'uma resposta em dúvida')
  x.faz(x.beto, 'denuncia', { alvo: r, motivo: 'spam' })
  x.faz(x.ana, 'denuncia', { alvo: r, motivo: 'fora-do-tema' })
  assert.equal(x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) }).denuncias[0].total, 2)
  // quem pode: só dono e moderador; e é preciso haver denúncia aberta naquela comunidade
  assert.equal(x.cod(x.ana, 'denuncia-dispensar', { comunidade: x.c, alvo: r }), 'sem_permissao')
  assert.equal(x.cod(x.rover(), 'denuncia-dispensar', { comunidade: x.c, alvo: r }), 'nao_e_membro')
  assert.equal(x.cod(x.mod, 'denuncia-dispensar', { comunidade: x.c, alvo: t }), 'nao_encontrado', 'o tópico não foi denunciado')
  const ato = x.ok(x.mod, 'denuncia-dispensar', { comunidade: x.c, alvo: r })
  assert.deepEqual(x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) }).denuncias, [], 'saiu da fila')
  assert.ok(x.s.respostasDo(t, {}).itens.some((i) => i.id === r), 'o conteúdo continua visível')
  assert.equal(x.cod(x.mod, 'denuncia-dispensar', { comunidade: x.c, alvo: r }), 'nao_encontrado', 'não há mais denúncia aberta')
  const reg = x.s.registroDaComunidade(x.c, {}).itens[0]
  assert.equal(reg.acao, 'dispensa')
  assert.equal(reg.alvo, r)
  assert.equal(reg.alvoTipo, 'resposta-forum')
  assert.equal(reg.por, 'moderador')
  const publico = JSON.stringify(x.s.registroDaComunidade(x.c, {}))
  for (const quem of [x.beto, x.ana]) {
    assert.equal(publico.includes(quem.uid), false, 'o registro nunca diz quem denunciou')
    assert.equal(publico.includes(x.rele._pseudonimo(quem.uid)), false)
  }
  assert.equal(x.faz(x.beto, 'denuncia', { alvo: r, motivo: 'spam' }).estado, 'recebida')
  assert.deepEqual(x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) }).denuncias, [], 'quem já denunciou não reabre o caso')
  x.faz(x.rover(), 'denuncia', { alvo: r, motivo: 'assedio' })
  const reaberta = x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) }).denuncias
  assert.equal(reaberta.length, 1, 'uma denúncia nova, de outra pessoa, reabre')
  assert.equal(reaberta[0].total, 1)
  assert.equal(codigoDe(() => x.rele.objeto(ato.id)), 'nao_encontrado', 'é ação: o relé não guarda o envelope')
})

test('reações em tópico: reacoes e minhaReacao no detalhe', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  x.ok(x.beto, 'reacao', { alvo: t, reacao: 'curtir' })
  x.ok(x.caio, 'reacao', { alvo: t, reacao: 'util' })
  let d = x.s.topicoDetalhe(t, { credencial: x.como(x.beto) })
  assert.deepEqual(d.reacoes, { curtir: 1, util: 1 })
  assert.equal(d.minhaReacao, 'curtir')
  d = x.s.topicoDetalhe(t, {})
  assert.deepEqual(d.reacoes, { curtir: 1, util: 1 })
  assert.equal(d.minhaReacao, null, 'sem credencial não há minhaReacao')
  assert.equal(x.s.topicoDetalhe(t, { credencial: x.como(x.mod) }).minhaReacao, null, 'quem não reagiu')
  assert.equal(JSON.stringify(d).includes(x.beto.uid), false, 'nunca a lista de quem reagiu')
})

test('categoria=-: só os tópicos sem categoria', () => {
  const x = forum()
  const sem = x.topico(x.ana, x.c, { titulo: 'Sem categoria' })
  const com = x.topico(x.beto, x.c, { titulo: 'Com categoria', categoria: 'Geral' })
  assert.deepEqual(x.s.topicosDa(x.c, { categoria: '-' }).itens.map((i) => i.id), [sem])
  assert.deepEqual(x.s.topicosDa(x.c, { categoria: 'Geral' }).itens.map((i) => i.id), [com])
  assert.deepEqual(x.s.topicosDa(x.c, {}).itens.map((i) => i.id).sort(), [sem, com].sort(), 'sem o filtro, os dois')
})

test('respostas?ordem=recentes: do mais novo ao mais antigo, com o cursor; o padrão continua antigas', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const ids = []
  for (let i = 0; i < 5; i++) { ids.push(x.responde(x.beto, t, `resposta ${i}`)); x.avancar(1) }
  assert.deepEqual(x.s.respostasDo(t, { limite: 50 }).itens.map((i) => i.id), ids, 'padrão: antigas')
  assert.deepEqual(x.s.respostasDo(t, { limite: 50, ordem: 'antigas' }).itens.map((i) => i.id), ids)
  const p1 = x.s.respostasDo(t, { limite: 2, ordem: 'recentes' })
  assert.deepEqual(p1.itens.map((i) => i.id), [ids[4], ids[3]])
  const p2 = x.s.respostasDo(t, { limite: 2, ordem: 'recentes', antes: p1.proximo })
  assert.deepEqual(p2.itens.map((i) => i.id), [ids[2], ids[1]])
  const p3 = x.s.respostasDo(t, { limite: 2, ordem: 'recentes', antes: p2.proximo })
  assert.deepEqual(p3.itens.map((i) => i.id), [ids[0]])
  assert.equal(p3.proximo, null)
  assert.equal(codigoDe(() => x.s.respostasDo(t, { ordem: 'aleatoria' })), 'esquema')
})

// ---------- páginas, busca e linha ----------

test('lista completa: autor, página, contagens e a reação do leitor; sem a opção a lista é a da 0.3', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const post = x.ok(a, 'postagem', { texto: 'uma postagem com resposta', topicos: [] }).id
  x.ok(b, 'reacao', { alvo: post, reacao: 'curtir' })
  x.ok(c, 'resposta', { alvo: post, texto: 'concordo' })
  const completa = x.rele.postagensDe(a.uid, { completo: true, credencial: x.como(b) })
  assert.equal(completa.itens.length, 1)
  const i = completa.itens[0]
  assert.equal(i.tipo, 'postagem')
  assert.equal(i.envelope.objeto.id, post)
  assert.equal(i.autor.uid, a.uid)
  assert.equal(i.pagina, null)
  assert.deepEqual(i.contagens, { respostas: 1, reacoes: { curtir: 1, util: 0 } })
  assert.equal(i.minhaReacao, 'curtir')
  assert.equal(x.rele.postagensDe(a.uid, { completo: true }).itens[0].minhaReacao, null, 'sem credencial')
  const antiga = x.rele.postagensDe(a.uid, {})
  assert.equal(antiga.itens[0].objeto.id, post, 'sem a opção a lista continua sendo de envelopes, como na 0.3')
  assert.deepEqual(Object.keys(antiga.itens[0]).sort(), Object.keys(x.rele.postagensDe(a.uid, { completo: false }).itens[0]).sort())
})

test('lista completa da linha e das atualizações de página: o item misto diz o tipo e o nome da página', () => {
  const x = nova()
  const [dono, seg, amigo] = [x.rover(), x.rover(), x.rover()]
  const pag = x.ok(dono, 'pagina-criar', { nome: 'Página da linha', descricao: '', tema: 'rovers' }).id
  x.ok(seg, 'pagina-seguir', { pagina: pag, acao: 'seguir' })
  x.ok(seg, 'seguir', { alvo: amigo.uid })
  const post = x.ok(amigo, 'postagem', { texto: 'postagem do amigo', topicos: [] }).id
  x.avancar(1)
  const upd = x.ok(dono, 'pagina-publicar', { pagina: pag, texto: 'novidade da página', tags: [] }).id
  x.ok(seg, 'reacao', { alvo: upd, reacao: 'util' })
  const linha = x.rele.linhaDoInicio(seg.uid, { tipos: ['postagem', 'pagina-publicar'], completo: true, credencial: x.como(seg) })
  assert.deepEqual(linha.itens.map((i) => i.tipo), ['pagina-publicar', 'postagem'], 'do mais novo ao mais velho, os dois tipos no mesmo array')
  assert.deepEqual(linha.itens[0].pagina, { id: pag, nome: 'Página da linha' })
  assert.equal(linha.itens[0].minhaReacao, 'util')
  assert.deepEqual(linha.itens[0].contagens, { respostas: 0, reacoes: { curtir: 0, util: 1 } })
  assert.equal(linha.itens[1].pagina, null)
  assert.equal(linha.itens[1].envelope.objeto.id, post)
  const atu = x.s.atualizacoesDa(pag, { completo: true, credencial: x.como(seg) })
  assert.equal(atu.itens.length, 1)
  assert.equal(atu.itens[0].tipo, 'pagina-publicar')
  assert.equal(atu.itens[0].minhaReacao, 'util')
  assert.equal(x.s.atualizacoesDa(pag, {}).itens[0].objeto.id, upd, 'sem a opção, só o envelope')
  const fechado = x.rover({ grafo: 'privado' })
  assert.equal(codigoDe(() => x.rele.linhaDoInicio(fechado.uid, { completo: true })), 'grafo_privado', 'a linha de quem esconde o grafo continua só dele')
})

test('temas de páginas: os temas das páginas abertas, do mais usado para o menos', () => {
  const x = nova()
  const [a, b] = [x.rover(), x.rover()]
  const p1 = x.ok(a, 'pagina-criar', { nome: 'Uma', descricao: '', tema: 'planilhas' }).id
  x.ok(b, 'pagina-criar', { nome: 'Duas', descricao: '', tema: 'planilhas' })
  x.ok(a, 'pagina-criar', { nome: 'Tres', descricao: '', tema: 'receitas' })
  assert.deepEqual(x.s.temasDePaginas().itens, [{ tema: 'planilhas', paginas: 2 }, { tema: 'receitas', paginas: 1 }])
  x.rele.bloquear({ tipo: 'objeto', alvo: p1, motivo: 'teste' })
  assert.deepEqual(x.s.temasDePaginas().itens, [{ tema: 'planilhas', paginas: 1 }, { tema: 'receitas', paginas: 1 }], 'página bloqueada pelo operador não conta (empate: por tema)')
})

test('em alta: pessoas distintas que moveram o item, nunca a lista; quem responde 3 vezes conta 1', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tópico em alta' })
  for (let i = 0; i < 3; i++) x.responde(x.beto, t, `resposta ${i}`)
  x.responde(x.caio, t, 'outra pessoa')
  x.ok(x.mod, 'reacao', { alvo: t, reacao: 'curtir' })
  const item = x.s.emAlta({ tipo: 'topicos' }, x.m.relogio.agora).itens.find((i) => i.id === t)
  assert.equal(item.pessoas, 3, 'beto, caio e o moderador que reagiu: pessoas, não volume')
  assert.equal(JSON.stringify(item).includes(x.beto.uid), false, 'o item não diz quem')
  const com = x.s.emAlta({ tipo: 'comunidades', janela: '7d' }, x.m.relogio.agora).itens.find((i) => i.id === x.c)
  assert.ok(com.pessoas >= 2, 'comunidades também trazem pessoas')
  const dona = x.rover()
  const p = x.ok(dona, 'pagina-criar', { nome: 'Página em alta', descricao: '', tema: 'rovers' }).id
  for (const s of [x.beto, x.caio]) x.ok(s, 'pagina-seguir', { pagina: p, acao: 'seguir' })
  x.ok(dona, 'pagina-publicar', { pagina: p, texto: 'novidade', tags: [] })
  assert.equal(x.s.emAlta({ tipo: 'paginas' }, x.m.relogio.agora).itens.find((i) => i.id === p).pessoas, 2)
  assert.equal(codigoDe(() => x.s.emAlta({ tipo: 'rovers' }, x.m.relogio.agora)), 'esquema', 'o relé não ranqueia pessoas (decisão da 0.3 que a 0.3.1 mantém)')
})

// ---------- postagens ----------

test('postagem por id: contagens e minhaReacao; o que o leitor não pode ver não existe para ele', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const post = x.ok(a, 'postagem', { texto: 'uma postagem para ver', topicos: [] }).id
  x.ok(b, 'reacao', { alvo: post, reacao: 'util' })
  x.ok(c, 'resposta', { alvo: post, texto: 'primeira' })
  x.avancar(1)
  x.ok(b, 'resposta', { alvo: post, texto: 'segunda' })
  const d = x.s.postagemDetalhe(post, { credencial: x.como(b) })
  assert.deepEqual(Object.keys(d).sort(), ['autor', 'contagens', 'envelope', 'minhaReacao'])
  assert.deepEqual(d.contagens, { respostas: 2, reacoes: { curtir: 0, util: 1 } })
  assert.equal(d.minhaReacao, 'util')
  assert.equal(x.s.postagemDetalhe(post, {}).minhaReacao, null)
  const recado = x.ok(a, 'recado', { alvo: b.uid, texto: 'um recado qualquer' }).id
  assert.equal(codigoDe(() => x.s.postagemDetalhe(recado, {})), 'nao_encontrado', 'só postagem')
  assert.equal(codigoDe(() => x.s.postagemDetalhe('ob_' + 'A'.repeat(43), {})), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.postagemDetalhe('x', {})), 'nao_encontrado')
  x.ok(c, 'remocao-pelo-autor', { alvo: x.s.respostasDaPostagem(post, {}).itens.find((i) => i.autor.uid === c.uid).envelope.objeto.id })
  assert.equal(x.s.postagemDetalhe(post, {}).contagens.respostas, 1, 'resposta removida não conta')
  x.ok(a, 'remocao-pelo-autor', { alvo: post })
  assert.equal(codigoDe(() => x.s.postagemDetalhe(post, {})), 'removido')
  const outra = x.ok(a, 'postagem', { texto: 'outra postagem', topicos: [] }).id
  x.rele.bloquear({ tipo: 'objeto', alvo: outra, motivo: 'teste' })
  assert.equal(codigoDe(() => x.s.postagemDetalhe(outra, {})), 'nao_encontrado', 'bloqueada pelo operador')
})

test('respostas de uma postagem: ordem, cursor, contagens e reação do leitor', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const post = x.ok(a, 'postagem', { texto: 'postagem com respostas', topicos: [] }).id
  const ids = []
  for (const [autor, texto] of [[b, 'um'], [c, 'dois'], [b, 'tres']]) { ids.push(x.ok(autor, 'resposta', { alvo: post, texto }).id); x.avancar(1) }
  x.ok(c, 'reacao', { alvo: ids[0], reacao: 'curtir' })
  const novas = x.s.respostasDaPostagem(post, { limite: 2, credencial: x.como(c) })
  assert.deepEqual(novas.itens.map((i) => i.envelope.objeto.id), [ids[2], ids[1]], 'o padrão é do mais novo ao mais velho')
  const resto = x.s.respostasDaPostagem(post, { limite: 2, antes: novas.proximo, credencial: x.como(c) })
  assert.deepEqual(resto.itens.map((i) => i.envelope.objeto.id), [ids[0]])
  assert.deepEqual(resto.itens[0].contagens, { respostas: 0, reacoes: { curtir: 1, util: 0 } })
  assert.equal(resto.itens[0].minhaReacao, 'curtir')
  assert.equal(resto.itens[0].autor.uid, b.uid)
  assert.deepEqual(x.s.respostasDaPostagem(post, { limite: 5, ordem: 'antigas' }).itens.map((i) => i.envelope.objeto.id), ids)
  assert.equal(codigoDe(() => x.s.respostasDaPostagem(post, { ordem: 'aleatoria' })), 'esquema')
  assert.equal(codigoDe(() => x.s.respostasDaPostagem('x', {})), 'nao_encontrado')
})

test('privacidade das contagens: rover bloqueado pelo operador não conta, e a postagem de um rover invisível some', () => {
  const x = nova()
  const [a, b, c] = [x.rover(), x.rover(), x.rover()]
  const post = x.ok(a, 'postagem', { texto: 'postagem com contagens', topicos: [] }).id
  x.ok(b, 'reacao', { alvo: post, reacao: 'curtir' })
  x.ok(c, 'resposta', { alvo: post, texto: 'uma resposta' })
  assert.deepEqual(x.s.postagemDetalhe(post, {}).contagens, { respostas: 1, reacoes: { curtir: 1, util: 0 } })
  x.rele.bloquear({ tipo: 'rover', alvo: b.uid, motivo: 'teste' })
  x.rele.bloquear({ tipo: 'rover', alvo: c.uid, motivo: 'teste' })
  assert.deepEqual(x.s.postagemDetalhe(post, {}).contagens, { respostas: 0, reacoes: { curtir: 0, util: 0 } }, 'quem não é visível não entra na conta')
  assert.deepEqual(x.s.respostasDaPostagem(post, {}).itens, [])
  x.rele.bloquear({ tipo: 'rover', alvo: a.uid, motivo: 'teste' })
  assert.equal(codigoDe(() => x.s.postagemDetalhe(post, {})), 'nao_encontrado', 'o autor deixou de ser visível: a postagem não existe para quem lê')
  assert.equal(codigoDe(() => x.s.respostasDaPostagem(post, {})), 'nao_encontrado')
})

test('compatibilidade das declarações da pessoa: o tipo novo não entra na lista que ela pode exigir, como num relé 0.3', () => {
  const x = nova()
  const a = x.rover()
  const com = politicaDe(a, { v: '0.3', exigirAprovacao: ['denuncia-dispensar'] })
  assert.equal(codigoDe(() => x.rele.aceitarDeclaracao({ declaracao: com })), 'esquema', 'a lista fechada da 0.3 segue valendo: o relé 0.3.1 recusa o que um relé 0.3 recusaria')
  const normal = politicaDe(a, { v: '0.3', exigirAprovacao: ['comunidade-gestao'] })
  assert.equal(x.rele.aceitarDeclaracao({ declaracao: normal }).estado, 'aceita', 'a política de antes continua valendo')
})

test('lista completa pagina como a de envelopes: limite, proximo e antes; com exatamente "limite" itens não há próxima página', () => {
  const x = nova()
  const a = x.rover()
  const ids = []
  for (let i = 0; i < 3; i++) { ids.push(x.ok(a, 'postagem', { texto: `postagem ${i} da paginação`, topicos: [] }).id); x.avancar(1) }
  const ordem = (pagina) => pagina.itens.map((i) => i.envelope.objeto.id)
  const p1 = x.rele.postagensDe(a.uid, { completo: true, limite: 2 })
  assert.deepEqual(ordem(p1), [ids[2], ids[1]], 'do mais novo ao mais velho')
  assert.notEqual(p1.proximo, null, 'sobrou uma postagem')
  const p2 = x.rele.postagensDe(a.uid, { completo: true, limite: 2, antes: p1.proximo })
  assert.deepEqual(ordem(p2), [ids[0]], 'o cursor continua exatamente onde a primeira página parou')
  assert.equal(p2.proximo, null)
  const exata = x.rele.postagensDe(a.uid, { completo: true, limite: 3 })
  assert.deepEqual(ordem(exata), [ids[2], ids[1], ids[0]])
  assert.equal(exata.proximo, null, 'o limite é igual ao total: não há próxima página')
  const um = x.rele.postagensDe(a.uid, { completo: true, limite: 1 })
  assert.deepEqual(ordem(um), [ids[2]])
  assert.deepEqual(ordem(x.rele.postagensDe(a.uid, { completo: true, limite: 1, antes: um.proximo })), [ids[1]])
  // o mesmo caminho serve a linha do início
  const seg = x.rover()
  x.ok(seg, 'seguir', { alvo: a.uid })
  const l1 = x.rele.linhaDoInicio(seg.uid, { completo: true, limite: 2 })
  assert.deepEqual(ordem(l1), [ids[2], ids[1]])
  assert.deepEqual(ordem(x.rele.linhaDoInicio(seg.uid, { completo: true, limite: 2, antes: l1.proximo })), [ids[0]])
})
