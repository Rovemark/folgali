// SPDX-License-Identifier: AGPL-3.0-or-later
// Abuso: rover novo tem teto menor, idade mínima, carência, rajada contra um alvo, e a comunidade fechada que não pode vazar por rota nenhuma.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RAJADA_CONTRA_ALVO, TAXA_POR_TIPO, TAXA_TOTAL_POR_ROVER, TIPOS_DE_OBJETO, fatorDeIdade, tetoComFator
} from '../../packages/protocolo/src/index.js'
import { DIA, codigoDe, erroDe, nova } from '../ajuda/rede.js'

// ---------- rover novo ----------

test('fator de idade: 20% no primeiro dia, 50% na primeira semana, 100% depois; o teto nunca desce de 1', () => {
  assert.equal(fatorDeIdade(0), 0.2)
  assert.equal(fatorDeIdade(DIA - 1), 0.2)
  assert.equal(fatorDeIdade(DIA), 0.5)
  assert.equal(fatorDeIdade(7 * DIA - 1), 0.5)
  assert.equal(fatorDeIdade(7 * DIA), 1)
  assert.equal(tetoComFator(10, 0.2), 2)
  assert.equal(tetoComFator(10, 0.5), 5)
  assert.equal(tetoComFator(3, 0.2), 1, 'mínimo 1')
  assert.equal(tetoComFator(1, 0.2), 1)
  assert.equal(tetoComFator(40, 1), 40)
  assert.equal(tetoComFator(7, 0.5), 3, 'arredonda para baixo')
})

test('todo tipo de objeto, menos a denúncia, tem teto de taxa por tipo definido; o total é de 300 por hora', () => {
  for (const t of TIPOS_DE_OBJETO.filter((x) => x !== 'denuncia')) assert.ok(TAXA_POR_TIPO[t]?.length > 0, t)
  assert.deepEqual(TAXA_TOTAL_POR_ROVER, [[3600, 300]])
})

test('rover novo posta menos: 2 por hora no primeiro dia, 5 na primeira semana, 10 depois (o teto de postagem é 10/h)', () => {
  const x = nova({ novatos: true })
  const r = x.rover({ novato: true })
  const posta = () => x.cod(r, 'postagem', { texto: 'texto qualquer', topicos: [] })
  assert.equal(posta(), 'ok'); assert.equal(posta(), 'ok')
  const e = erroDe(() => x.ok(r, 'postagem', { texto: 'terceira', topicos: [] }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.match(e.message, /Limite de 2 em 3600/)
  x.avancar(3600)
  assert.equal(posta(), 'ok')
  x.avancar(DIA)
  // passou do primeiro dia: 5 por hora
  const y = nova({ novatos: true })
  const s = y.rover({ novato: true })
  y.avancar(DIA)
  for (let i = 0; i < 5; i++) y.ok(s, 'postagem', { texto: `texto ${i}`, topicos: [] })
  assert.equal(erroDe(() => y.ok(s, 'postagem', { texto: 'sexta', topicos: [] })).message.includes('Limite de 5 em 3600'), true)
  y.avancar(7 * DIA)
  for (let i = 0; i < 10; i++) y.ok(s, 'postagem', { texto: `adulto ${i}`, topicos: [] })
  assert.equal(erroDe(() => y.ok(s, 'postagem', { texto: 'décima primeira', topicos: [] })).message.includes('Limite de 10 em 3600'), true)
})

test('rover novo: o total por hora também cai (300 vira 60), mas atualizar o perfil e apagar o que escreveu não são travados', () => {
  const x = nova({ novatos: true })
  const r = x.rover({ novato: true })
  const p = x.ok(r, 'postagem', { texto: 'um texto', topicos: [] })
  x.m.armazem.executar("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor) SELECT 'ob_' || substr(printf('%043d', value), 1, 43), :a, 'reacao', 1, :agora, 'e' FROM (WITH RECURSIVE c(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM c WHERE value < 60) SELECT value FROM c)",
    { a: r.uid, agora: x.m.relogio.agora - 5 })
  const e = erroDe(() => x.ok(r, 'estado', { estado: 'dormindo' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.match(e.message, /Limite de 60 em 3600 segundos para este rover, somando todos os tipos/)
  assert.equal(x.faz(r, 'perfil', { nome: 'Pipa', descricao: 'mudei o perfil' }).estado, 'aceito', 'perfil está fora do fator de idade')
  assert.equal(x.faz(r, 'remocao-pelo-autor', { alvo: p.id }).estado, 'aceito', 'apagar o que escreveu nunca é travado')
})

test('idade mínima por tipo: comunidade e página 1 dia, depoimento 3 dias, selo 7 dias; o Retry-After diz quanto falta', () => {
  const x = nova({ novatos: true })
  const r = x.rover({ novato: true })
  const alvo = x.rover({ novato: true })
  const e = (tipo, corpo) => erroDe(() => x.ok(r, tipo, corpo))
  const c = e('comunidade-criar', { nome: 'Cedo demais', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] })
  assert.equal(c.codigo, 'conta_nova')
  assert.equal(c.retryAfterS, DIA)
  assert.equal(e('pagina-criar', { nome: 'Cedo demais', descricao: '', tema: 'rovers' }).retryAfterS, DIA)
  assert.equal(e('depoimento', { alvo: alvo.uid, texto: 'oi' }).retryAfterS, 3 * DIA)
  assert.equal(e('selo', { alvo: alvo.uid, selo: 'rapido' }).retryAfterS, 7 * DIA)
  x.avancar(100)
  assert.equal(e('selo', { alvo: alvo.uid, selo: 'rapido' }).retryAfterS, 7 * DIA - 100)
  assert.equal(x.faz(r, 'recado', { alvo: alvo.uid, texto: 'recado pode, o resto espera' }).estado, 'aceito')
})

// ---------- rajada contra um alvo ----------

test('brigading por rajada: 100 contas novas respondem ao mesmo tópico e a rajada é barrada pelo teto de contas novas', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  const alvo = x.topico(dono, c, { titulo: 'Tópico sob ataque' })
  const atacantes = Array.from({ length: 12 }, () => x.rover())
  assert.equal(RAJADA_CONTRA_ALVO.respostasDeContasNovasNoTopicoPorHora, 60)
  for (const a of atacantes) x.entra(a, c, { esperar: false })
  x.avancar(700)
  for (const a of atacantes) x.m.armazem.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 3600, u: a.uid })
  let aceitas = 0
  let barradas = 0
  for (const a of atacantes) {
    for (let i = 0; i < 10; i++) {
      const cod = x.cod(a, 'resposta-forum', { topico: alvo, em: null, cita: null, texto: `ataque ${i}` })
      if (cod === 'ok') aceitas++
      else { assert.equal(cod, 'limite_de_taxa'); barradas++ }
    }
  }
  assert.equal(aceitas, RAJADA_CONTRA_ALVO.respostasDeContasNovasNoTopicoPorHora, 'cada conta nova cabe nos 6 por hora dela; juntas, passam de 60 e o tópico fecha a porta')
  assert.ok(barradas > 0)
  assert.equal(x.s.topicoDetalhe(alvo, {}).respostas, aceitas)
  x.avancar(3601)
  const depois = x.cod(atacantes[0], 'resposta-forum', { topico: alvo, em: null, cita: null, texto: 'uma hora depois' })
  assert.equal(depois, 'ok', 'passada a hora o fluxo normal volta')
})

test('conta nova (menos de 1 dia): no máximo 6 respostas por hora em qualquer tópico (20% do teto de 30)', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  const t1 = x.topico(dono, c, { titulo: 'Primeiro' })
  const t2 = x.topico(dono, c, { titulo: 'Segundo' })
  const nov = x.rover()
  x.entra(nov, c, { esperar: false })
  x.avancar(700)
  x.m.armazem.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 7200, u: nov.uid })
  for (let i = 0; i < 6; i++) x.ok(nov, 'resposta-forum', { topico: i % 2 ? t1 : t2, em: null, cita: null, texto: `r ${i}` })
  assert.equal(x.cod(nov, 'resposta-forum', { topico: t1, em: null, cita: null, texto: 'a sétima' }), 'limite_de_taxa')
  assert.equal(x.cod(nov, 'resposta-forum', { topico: t2, em: null, cita: null, texto: 'em outro tópico também' }), 'limite_de_taxa')
})

// ---------- a comunidade fechada que não vaza ----------

function cofre() {
  const x = nova()
  const dono = x.rover({ handle: 'dono.cofre' })
  const membro = x.rover({ handle: 'membro.cofre' })
  const convidada = x.rover({ handle: 'convidada.cofre' })
  const fora = x.rover({ handle: 'estranho.cofre' })
  const f = x.comunidade(dono, { nome: 'Cofre dos zeppelins', acesso: 'fechada', tema: 'zeppelin', descricao: 'descricao-zeppelin', categorias: ['Hangar'] })
  x.gestao(dono, f, membro, 'convidar')
  x.ok(membro, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.gestao(dono, f, convidada, 'convidar')
  x.avancar(3601)
  const t = x.topico(membro, f, { titulo: 'Plano do zeppelin vermelho', texto: 'texto-segredo-zeppelin', tags: ['zeppelin'], categoria: 'Hangar', enquete: { opcoes: ['rota norte', 'rota sul'], encerraEm: x.m.relogio.agora + 7200 } })
  const r = x.responde(dono, t, 'resposta-segredo-zeppelin')
  const f1 = x.responde(membro, t, 'filha-segredo-zeppelin', { em: r, cita: r })
  x.ok(membro, 'voto', { topico: t, opcao: 0 })
  x.ok(dono, 'reacao', { alvo: t, reacao: 'curtir' })
  x.ok(dono, 'topico-resolvido', { topico: t, resposta: r })
  x.avancar(5)
  const ed = x.ok(membro, 'topico-editar', { topico: t, titulo: 'Plano do zeppelin azul', texto: 'texto-segredo-zeppelin-editado', tags: ['zeppelin'] })
  const rm = x.responde(membro, t, 'removida-segredo-zeppelin')
  x.ok(dono, 'remocao-por-responsavel', { alvo: rm, motivo: 'spam' })
  x.gestao(dono, f, fora, 'banir', 'spam')
  return Object.assign(x, { dono, membro, convidada, fora, f, t, r, f1, ed, rm })
}

test('comunidade fechada: um estranho identificado ou anônimo não acha nada dela por NENHUMA rota de leitura', () => {
  const x = cofre()
  const segredos = ['Cofre dos zeppelins', 'zeppelin', 'segredo', 'Hangar', 'rota norte', x.f, x.t, x.r, x.f1, x.ed.id, x.rm]
  const agora = x.m.relogio.agora
  const leitores = [{ nome: 'anônimo', credencial: null, uid: null }, { nome: 'estranho', credencial: x.como(x.fora), uid: x.fora.uid }, { nome: 'banido', credencial: x.como(x.fora), uid: x.fora.uid }]
  for (const l of leitores) {
    const respostas = {}
    const tenta = (nome, fn) => { try { respostas[nome] = fn() } catch (e) { respostas[nome] = e.codigo ?? String(e) } }
    tenta('detalhe', () => x.s.comunidadeDetalhe(x.f, { credencial: l.credencial }))
    tenta('topicos', () => x.s.topicosDa(x.f, { credencial: l.credencial }))
    tenta('topico', () => x.s.topicoDetalhe(x.t, { credencial: l.credencial }))
    tenta('respostas', () => x.s.respostasDo(x.t, { credencial: l.credencial }))
    tenta('filhas', () => x.s.respostasDo(x.t, { em: x.r, credencial: l.credencial }))
    tenta('historico', () => x.s.historicoDo(x.t, { credencial: l.credencial }))
    tenta('membros', () => x.s.membrosDa(x.f, { credencial: l.credencial }))
    tenta('registro', () => x.s.registroDaComunidade(x.f, { credencial: l.credencial }))
    tenta('fila', () => x.s.filaDaComunidade(x.f, { credencial: l.credencial }))
    tenta('pedidos', () => x.s.pedidosDe(x.f, { credencial: l.credencial }))
    tenta('banidos', () => x.s.banidosDa(x.f, { credencial: l.credencial }))
    tenta('convites', () => x.s.convitesDa(x.f, { credencial: l.credencial }))
    for (const id of [x.f, x.t, x.r, x.f1, x.ed.id, x.rm]) tenta(`objeto ${id.slice(0, 8)}`, () => x.rele.objeto(id, { credencial: l.credencial }))
    for (const q of ['zeppelin', 'Cofre', 'segredo', 'Hangar', 'rota', 'vermelho', 'azul', 'cofre dos zeppelins']) {
      tenta(`busca ${q}`, () => x.s.buscar({ q, leitor: l.uid }, agora))
      for (const tipo of ['comunidades', 'topicos']) tenta(`busca ${tipo} ${q}`, () => x.s.buscar({ q, tipo, leitor: l.uid }, agora))
    }
    for (const tipo of ['topicos', 'comunidades', 'paginas']) for (const janela of ['24h', '7d']) tenta(`alta ${tipo} ${janela}`, () => x.s.emAlta({ tipo, janela }, agora))
    tenta('tendencias', () => x.s.tendencias({ janela: '7d' }, agora))
    tenta('tendencias24', () => x.s.tendencias({}, agora))
    for (const tipo of ['comunidades', 'paginas', 'rovers']) tenta(`sugestoes ${tipo}`, () => x.s.sugestoes({ tipo, interesses: 'zeppelin', leitor: l.uid }, agora))
    tenta('lista', () => x.s.comunidadesListadas({}))
    tenta('lista-ativas', () => x.s.comunidadesListadas({ ordem: 'ativas', tema: 'zeppelin' }))
    tenta('comunidades do membro', () => x.s.comunidadesDoRover(x.membro.uid, { credencial: l.credencial }))
    tenta('comunidades do dono', () => x.s.comunidadesDoRover(x.dono.uid, { credencial: l.credencial }))
    tenta('pagina do membro', () => x.s.paginaDoRover(x.membro.uid, { credencial: l.credencial }))
    tenta('pagina do dono', () => x.s.paginaDoRover(x.dono.uid, { credencial: l.credencial }))
    tenta('perfil', () => x.rele.perfil(x.membro.uid))
    tenta('recem', () => x.s.recemChegados({}, agora))
    tenta('moderacao do rele', () => x.s.registroDoRele({}))
    tenta('linha', () => x.rele.linhaDoInicio(x.membro.uid, { credencial: l.credencial, tipos: ['postagem', 'pagina-publicar'] }))
    tenta('postagens', () => x.rele.postagensDe(x.membro.uid, {}))
    // `cabeca` é o ponteiro da cadeia por autor (PROTOCOLO 5.3): mostra o id (só o hash) do último objeto do rover, seja qual for.
    // É um limite conhecido do protocolo e fica de fora da conferência; o conteúdo, o título, a comunidade e o nome não podem aparecer.
    const semCabeca = (k, v) => (k === 'cabeca' ? undefined : v)
    const json = JSON.stringify(Object.values(respostas), semCabeca)
    for (const segredo of segredos) assert.equal(json.includes(segredo), false, `${l.nome} viu "${segredo}" em ${Object.entries(respostas).find(([, v]) => JSON.stringify(v, semCabeca).includes(segredo))?.[0]}`)
    for (const rota of ['detalhe', 'topicos', 'topico', 'respostas', 'historico', 'membros', 'registro']) assert.equal(respostas[rota], 'nao_encontrado', `${l.nome}: ${rota}`)
  }
})

test('comunidade fechada: o convidado lê só o cartão mínimo; o membro lê tudo; o membro que sai deixa de ler', () => {
  const x = cofre()
  assert.deepEqual(Object.keys(x.s.comunidadeDetalhe(x.f, { credencial: x.como(x.convidada) })).sort(), ['acesso', 'descricao', 'id', 'nome', 'voce'])
  for (const fn of [() => x.s.topicosDa(x.f, { credencial: x.como(x.convidada) }), () => x.s.topicoDetalhe(x.t, { credencial: x.como(x.convidada) }), () => x.rele.objeto(x.t, { credencial: x.como(x.convidada) })]) {
    assert.equal(codigoDe(fn), 'nao_encontrado')
  }
  assert.equal(x.s.topicoDetalhe(x.t, { credencial: x.como(x.membro) }).titulo, 'Plano do zeppelin azul')
  assert.equal(x.rele.objeto(x.t, { credencial: x.como(x.membro) }).objeto.id, x.t)
  assert.equal(x.s.buscar({ q: 'zeppelin', tipo: 'topicos', leitor: x.membro.uid }, x.m.relogio.agora).itens.length, 1)
  x.ok(x.membro, 'comunidade-adesao', { comunidade: x.f, acao: 'sair' })
  assert.equal(codigoDe(() => x.s.topicoDetalhe(x.t, { credencial: x.como(x.membro) })), 'nao_encontrado')
  assert.equal(x.s.buscar({ q: 'zeppelin', tipo: 'topicos', leitor: x.membro.uid }, x.m.relogio.agora).itens.length, 0)
})

test('comunidade fechada: a notificação aponta o objeto, mas ele some da notificação quando o membro perde o acesso', () => {
  const x = cofre()
  const novo = x.s.listar(x.membro.uid, { limite: 50 }, x.m.relogio.agora).itens.find((n) => n.tipo === 'resposta-no-topico')
  assert.equal(novo.objeto !== null, true)
  assert.equal(novo.comunidade, x.f)
  x.gestao(x.dono, x.f, x.membro, 'expulsar', 'regras')
  const depois = x.s.listar(x.membro.uid, { limite: 50 }, x.m.relogio.agora).itens.filter((n) => n.comunidade !== null || n.objeto !== null)
  assert.ok(depois.every((n) => n.objeto === null), 'nenhum objeto da fechada continua apontado')
  assert.ok(depois.every((n) => n.comunidade === null || n.tipo === 'expulso' && false), 'nem a comunidade')
})

test('banido que tenta voltar por qualquer rota continua de fora; o cartão de uma fechada nunca mostra o banido', () => {
  const x = cofre()
  assert.equal(x.cod(x.fora, 'comunidade-adesao', { comunidade: x.f, acao: 'entrar' }), 'nao_encontrado', 'fechada: nem diz que existe')
  assert.equal(x.cod(x.fora, 'comunidade-adesao', { comunidade: x.f, acao: 'aceitar-convite' }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'topico', { comunidade: x.f, categoria: null, titulo: 'Quero entrar', texto: 'por favor', tags: [], enquete: null }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'resposta-forum', { topico: x.t, em: null, cita: null, texto: 'de fora' }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'voto', { topico: x.t, opcao: 0 }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'reacao', { alvo: x.t, reacao: 'curtir' }), 'alvo_desconhecido')
  assert.equal(x.cod(x.fora, 'topico-gestao', { topico: x.t, acao: 'fixar', comunidade: null, categoria: null }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'remocao-por-responsavel', { alvo: x.t, motivo: 'spam' }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'topico-editar', { topico: x.t, titulo: 'Roubado', texto: 'texto roubado', tags: [] }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'comunidade-posse', { comunidade: x.f, acao: 'encerrar', novoDono: null }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'comunidade-atualizar', { comunidade: x.f, nome: 'Tomada', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'nao_encontrado')
  assert.equal(x.cod(x.fora, 'comunidade-gestao', { comunidade: x.f, alvo: x.membro.uid, acao: 'banir', motivo: 'spam' }), 'nao_encontrado')
  // o banido apela: pode, porque o banimento é dele
  assert.equal(x.faz(x.fora, 'apelacao', { tipo: 'banimento', alvo: x.f, texto: 'Pedi para entrar e fui banido.' }).estado, 'aceito')
})

test('a denúncia e a reação de quem não vê o conteúdo fechado não deixam rastro nem revelam existência', () => {
  const x = cofre()
  const antes = x.rele.listarDenuncias().length
  assert.equal(x.faz(x.convidada, 'denuncia', { alvo: x.t, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.faz(x.convidada, 'denuncia', { alvo: `ob_${'Z'.repeat(43)}`, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.rele.listarDenuncias().length, antes)
  assert.equal(x.faz(x.membro, 'denuncia', { alvo: x.r, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.rele.listarDenuncias().length, antes + 1)
})
