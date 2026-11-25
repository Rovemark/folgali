// SPDX-License-Identifier: AGPL-3.0-or-later
// Fórum: tópicos, respostas em fio com citação, edição com histórico, enquete, fixar, trancar, mover, "resolveu" e ordenação.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTRUTURA, TEMPOS } from '../../packages/protocolo/src/index.js'
import { codigoDe, erroDe, nova } from '../ajuda/rede.js'

/** Uma comunidade aberta com um dono, um moderador e três membros que já passaram da carência. */
function forum(opcoes = {}) {
  const x = nova()
  const dono = x.rover()
  const mod = x.rover()
  const [ana, beto, caio] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono, { categorias: ['Dúvidas', 'Dicas'], ...opcoes })
  for (const r of [mod, ana, beto, caio]) x.entra(r, c, { esperar: false })
  x.gestao(dono, c, mod, 'promover')
  x.avancar(3601)
  return Object.assign(x, { dono, mod, ana, beto, caio, c })
}
const avisos = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens.map((n) => n.tipo)
const topicoCorpo = (c, extra = {}) => ({ comunidade: c, categoria: null, titulo: 'Como vocês organizam?', texto: 'Queria saber como cada um faz.', tags: [], enquete: null, ...extra })

// ---------- tópico ----------

test('tópico: membro cria; a leitura traz o cartão e o detalhe com o envelope assinado; o id é o do objeto', () => {
  const x = forum()
  const t = x.ok(x.ana, 'topico', topicoCorpo(x.c, { categoria: 'Dúvidas', titulo: 'Qual planilha?', texto: 'Procuro uma planilha simples.', tags: ['planilhas'] }))
  const d = x.s.topicoDetalhe(t.id, {})
  assert.equal(d.id, t.id)
  assert.deepEqual([d.titulo, d.texto, d.categoria, d.tags, d.respostas, d.fixado, d.trancado, d.resolvido, d.editado, d.enquete, d.comunidadeNome], ['Qual planilha?', 'Procuro uma planilha simples.', 'Dúvidas', ['planilhas'], 0, false, false, false, false, null, x.s.comunidade(x.c).nome])
  assert.equal(d.autor.uid, x.ana.uid)
  assert.equal(d.envelope.objeto.id, t.id)
  assert.equal(d.versoes, 1)
  const l = x.s.topicosDa(x.c, {})
  assert.deepEqual(l.itens.map((i) => i.id), [t.id])
  assert.equal(l.itens[0].trecho, 'Procuro uma planilha simples.')
  assert.equal(x.rele.objeto(t.id).objeto.corpo.titulo, 'Qual planilha?')
  assert.equal(x.s.comunidadeDetalhe(x.c, {}).topicos, 1)
})

test('tópico: quem não é membro, banido ou em comunidade encerrada não cria; categoria precisa existir na comunidade', () => {
  const x = forum()
  const fora = x.rover()
  assert.equal(x.cod(fora, 'topico', topicoCorpo(x.c)), 'nao_e_membro')
  assert.equal(x.cod(x.ana, 'topico', topicoCorpo(x.c, { categoria: 'Inexistente' })), 'esquema')
  assert.equal(x.faz(x.ana, 'topico', topicoCorpo(x.c, { categoria: 'Dicas' })).estado, 'aceito')
  x.gestao(x.dono, x.c, x.beto, 'banir', 'spam')
  assert.equal(x.cod(x.beto, 'topico', topicoCorpo(x.c)), 'banido')
  assert.equal(x.cod(x.ana, 'topico', topicoCorpo(`ob_${'A'.repeat(43)}`)), 'nao_encontrado')
})

test('carência: membro novo só abre tópico depois de 1 hora; moderador e dono não esperam; resposta espera 10 minutos', () => {
  const x = nova()
  const dono = x.rover()
  const novo = x.rover()
  const c = x.comunidade(dono)
  const t0 = x.topico(dono, c)
  x.entra(novo, c, { esperar: false })
  const e = erroDe(() => x.ok(novo, 'topico', topicoCorpo(c)))
  assert.equal(e.codigo, 'em_carencia')
  assert.equal(e.retryAfterS, TEMPOS.carenciaParaTopicoS)
  const er = erroDe(() => x.ok(novo, 'resposta-forum', { topico: t0, em: null, cita: null, texto: 'oi' }))
  assert.equal(er.codigo, 'em_carencia')
  assert.equal(er.retryAfterS, TEMPOS.carenciaParaRespostaS)
  x.avancar(TEMPOS.carenciaParaRespostaS)
  assert.equal(x.faz(novo, 'resposta-forum', { topico: t0, em: null, cita: null, texto: 'oi' }).estado, 'aceito', 'resposta aos 10 minutos')
  assert.equal(x.cod(novo, 'topico', topicoCorpo(c)), 'em_carencia', 'tópico ainda não')
  x.avancar(TEMPOS.carenciaParaTopicoS - TEMPOS.carenciaParaRespostaS - 1)
  assert.equal(x.cod(novo, 'topico', topicoCorpo(c)), 'em_carencia', 'falta um segundo')
  x.avancar(1)
  assert.equal(x.faz(novo, 'topico', topicoCorpo(c)).estado, 'aceito')
  const mod = x.rover()
  x.entra(mod, c, { esperar: false })
  x.gestao(dono, c, mod, 'promover')
  assert.equal(x.faz(mod, 'topico', topicoCorpo(c, { titulo: 'Do moderador' })).estado, 'aceito', 'moderador novo não espera')
})

test('tópico: o texto passa pelos filtros e as hashtags viram tags de uso; menção avisa só quem pode ler', () => {
  const x = forum()
  assert.equal(x.cod(x.ana, 'topico', topicoCorpo(x.c, { texto: 'fale com ana@exemplo.com' })), 'esquema')
  assert.equal(x.cod(x.ana, 'topico', topicoCorpo(x.c, { texto: 'a https://a.com b https://b.com c https://c.com' })), 'esquema')
  assert.equal(x.cod(x.ana, 'topico', topicoCorpo(x.c, { texto: 'veja https://a.com?utm_source=x' })), 'esquema')
  const t = x.ok(x.ana, 'topico', topicoCorpo(x.c, { texto: `olá @${x.beto.handle}, veja #organizacao e #Planilhas`, tags: ['planilhas', 'dicas'] }))
  assert.equal(avisos(x, x.beto)[0], 'mencao')
  assert.deepEqual(x.m.armazem.todos('SELECT tag FROM tags_uso WHERE objeto = :o ORDER BY tag', { o: t.id }).map((l) => l.tag), ['dicas', 'organizacao', 'planilhas'])
  // comunidade fechada: o mencionado que não é membro não é avisado
  const f = x.comunidade(x.dono, { acesso: 'fechada' })
  x.gestao(x.dono, f, x.ana, 'convidar')
  x.ok(x.ana, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.avancar(3601)
  const antes = avisos(x, x.caio).length
  x.ok(x.ana, 'topico', topicoCorpo(f, { texto: `segredo para @${x.caio.handle}` }))
  assert.equal(avisos(x, x.caio).length, antes, 'caio não é membro da fechada')
})

// ---------- respostas ----------

test('respostas em fio: primeiro nível e um nível de filhas; responder a uma filha é "resposta_funda"; a citação traz o trecho vivo', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.responde(x.beto, t, 'Eu uso uma lista só.')
  const f1 = x.responde(x.caio, t, 'Eu também, com prazo ao lado.', { em: r1 })
  assert.equal(x.cod(x.ana, 'resposta-forum', { topico: t, em: f1, cita: null, texto: 'responder à filha' }), 'resposta_funda')
  const f2 = x.responde(x.ana, t, 'Concordo com o Caio.', { em: r1, cita: f1 })
  const topo = x.s.respostasDo(t, {})
  assert.deepEqual(topo.itens.map((i) => [i.id, i.em, i.filhas]), [[r1, null, 2]])
  const filhas = x.s.respostasDo(t, { em: r1 })
  assert.deepEqual(filhas.itens.map((i) => i.id), [f1, f2], 'da mais antiga à mais nova')
  assert.deepEqual(filhas.itens[1].cita, { id: f1, autor: x.s.resumo(x.caio.uid), trecho: 'Eu também, com prazo ao lado.' })
  assert.equal(filhas.itens[0].cita, null)
  assert.equal(filhas.itens[0].envelope.objeto.id, f1)
  assert.equal(x.s.topicoDetalhe(t, {}).respostas, 3)
  // a citação não carrega cópia do texto: se o citado some, o trecho some
  x.ok(x.caio, 'remocao-pelo-autor', { alvo: f1 })
  assert.equal(x.s.respostasDo(t, { em: r1 }).itens[0].cita.trecho, null)
  assert.equal(x.s.respostasDo(t, { em: r1 }).itens.length, 1)
})

test('resposta: alvo e citação precisam ser respostas vivas do mesmo tópico', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const t2 = x.topico(x.ana, x.c, { titulo: 'Outro tópico' })
  const r2 = x.responde(x.beto, t2, 'resposta do outro tópico')
  const r1 = x.responde(x.beto, t, 'resposta')
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: r2, cita: null, texto: 'x' }), 'alvo_desconhecido', 'em de outro tópico')
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: null, cita: r2, texto: 'x' }), 'alvo_desconhecido', 'citação de outro tópico')
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: t, cita: null, texto: 'x' }), 'alvo_desconhecido', 'o tópico não é uma resposta')
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: `ob_${'A'.repeat(43)}`, cita: null, texto: 'x' }), 'alvo_desconhecido')
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: r1 })
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: r1, cita: null, texto: 'x' }), 'alvo_desconhecido', 'resposta apagada')
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: `ob_${'A'.repeat(43)}`, em: null, cita: null, texto: 'x' }), 'nao_encontrado')
})

test('resposta: notificações para o autor do tópico, da mãe, do citado e dos mencionados, uma por pessoa e a mais importante', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.responde(x.beto, t, 'primeira')
  assert.equal(avisos(x, x.ana)[0], 'resposta-no-topico')
  const antesBeto = avisos(x, x.beto).length
  x.responde(x.caio, t, `@${x.ana.handle} e @${x.beto.handle} olhem`, { em: r1, cita: r1 })
  assert.equal(avisos(x, x.beto)[0], 'resposta-a-voce', 'a mãe também é a citada e vence a menção')
  assert.equal(avisos(x, x.beto).length, antesBeto + 1)
  assert.equal(avisos(x, x.ana)[0], 'resposta-no-topico', 'a autora do tópico vence a menção')
  assert.equal(avisos(x, x.ana).filter((n) => n === 'mencao').length, 0)
  const antesCaio = avisos(x, x.caio).length
  x.responde(x.caio, t, `eu mesmo @${x.caio.handle}`)
  assert.equal(avisos(x, x.caio).length, antesCaio, 'ninguém é avisado de si mesmo')
  const dm = x.rover()
  x.entra(dm, x.c, { esperar: false })
  x.avancar(700)
  x.responde(dm, t, `oi @${x.ana.handle}`, { cita: r1 })
  assert.equal(avisos(x, x.beto)[0], 'citacao')
})

test('resposta em tópico trancado: recusada para membro, aceita de moderador e dono', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'trancar', comunidade: null, categoria: null })
  assert.equal(x.cod(x.beto, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'oi' }), 'trancado')
  assert.equal(x.faz(x.mod, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'sou moderador' }).estado, 'aceito')
  assert.equal(x.faz(x.dono, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'sou o dono' }).estado, 'aceito')
  x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'destrancar', comunidade: null, categoria: null })
  assert.equal(x.faz(x.beto, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'agora vai' }).estado, 'aceito')
})

test('resposta a quem bloqueou o autor (ou foi bloqueado por ele): recusada na mãe, na citação e no tópico', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.responde(x.beto, t, 'resposta do beto')
  x.ok(x.caio, 'relacao', { alvo: x.beto.uid, acao: 'bloquear' })
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: r1, cita: null, texto: 'x' }), 'interacao_nao_permitida')
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: null, cita: r1, texto: 'x' }), 'interacao_nao_permitida')
  assert.equal(x.faz(x.beto, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'resposta direta ao tópico de ana' }).estado, 'aceito', 'bloqueio entre outros dois não atrapalha')
  x.ok(x.ana, 'relacao', { alvo: x.caio.uid, acao: 'bloquear' })
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'x' }), 'interacao_nao_permitida', 'o dono do tópico bloqueou')
})

test('respostas: a lista de primeiro nível pagina em ordem crescente sem repetir nem pular; filhas têm a própria lista', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const ids = []
  for (let i = 0; i < 5; i++) { ids.push(x.responde([x.beto, x.caio][i % 2], t, `resposta ${i}`)); x.avancar(1) }
  const p1 = x.s.respostasDo(t, { limite: 2 })
  const p2 = x.s.respostasDo(t, { limite: 2, antes: p1.proximo })
  const p3 = x.s.respostasDo(t, { limite: 2, antes: p2.proximo })
  assert.deepEqual([...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.id), ids)
  assert.equal(p3.proximo, null)
  assert.equal(codigoDe(() => x.s.respostasDo(t, { em: 'ob_x' })), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.respostasDo(t, { em: t })), 'nao_encontrado', 'o tópico não é resposta')
  const f = x.responde(x.ana, t, 'filha', { em: ids[0] })
  assert.equal(codigoDe(() => x.s.respostasDo(t, { em: f })), 'nao_encontrado', 'uma filha não tem filhas')
})

test('apagar uma resposta de primeiro nível esconde as filhas (a leitura delas dá 410); a contagem do tópico acompanha', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.responde(x.beto, t, 'mãe')
  x.responde(x.caio, t, 'filha', { em: r1 })
  assert.equal(x.s.topicoDetalhe(t, {}).respostas, 2)
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: r1 })
  assert.equal(codigoDe(() => x.s.respostasDo(t, { em: r1 })), 'removido')
  assert.equal(x.s.respostasDo(t, {}).itens.length, 0)
  assert.equal(x.s.topicoDetalhe(t, {}).respostas, 1, 'a filha ainda está viva no armazém')
})

// ---------- edição ----------

test('editar o tópico: só o autor, dentro de 30 minutos, até 5 vezes; o histórico traz toda versão assinada', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Título original', texto: 'Texto original do tópico.' })
  assert.equal(x.cod(x.beto, 'topico-editar', { topico: t, titulo: 'Título roubado', texto: 'Texto roubado.', tags: [] }), 'sem_permissao')
  assert.equal(x.cod(x.mod, 'topico-editar', { topico: t, titulo: 'Título do mod', texto: 'Moderador não edita.', tags: [] }), 'sem_permissao')
  x.avancar(60)
  const e1 = x.ok(x.ana, 'topico-editar', { topico: t, titulo: 'Título corrigido', texto: 'Texto corrigido do tópico.', tags: ['revisado'] })
  const d = x.s.topicoDetalhe(t, {})
  assert.deepEqual([d.titulo, d.texto, d.tags, d.editado, d.versoes], ['Título corrigido', 'Texto corrigido do tópico.', ['revisado'], true, 2])
  assert.equal(d.envelope.objeto.id, e1.id, 'o envelope servido é o da última versão')
  const h = x.s.historicoDo(t, {})
  assert.deepEqual(h.itens.map((i) => [i.versao, i.envelope.objeto.tipo, i.envelope.objeto.corpo.titulo]), [[1, 'topico', 'Título original'], [2, 'topico-editar', 'Título corrigido']])
  assert.equal(x.s.topicosDa(x.c, {}).itens[0].editado, true)
  assert.equal(x.s.topicosDa(x.c, {}).itens[0].titulo, 'Título corrigido')
  assert.equal(x.rele.objeto(t).objeto.corpo.titulo, 'Título original', 'o objeto original continua o que foi assinado')
})

test('editar: a janela fecha aos 30 minutos exatos, o máximo é 5 edições e tópico trancado não se edita', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const edita = (n) => x.faz(x.ana, 'topico-editar', { topico: t, titulo: `Título ${n}`, texto: `Texto ${n} do tópico.`, tags: [] })
  for (let i = 1; i <= ESTRUTURA.edicoesDeTopico; i++) { assert.equal(edita(i).estado, 'aceito', `edição ${i}`); x.avancar(10) }
  assert.equal(codigoDe(() => edita(6)), 'limite_de_estrutura')
  const y = forum()
  const t2 = y.topico(y.ana, y.c)
  y.avancar(TEMPOS.janelaDeEdicaoDoTopicoS)
  assert.equal(y.faz(y.ana, 'topico-editar', { topico: t2, titulo: 'No limite', texto: 'Aos 30 minutos exatos ainda vale.', tags: [] }).estado, 'aceito')
  y.avancar(1)
  const e = erroDe(() => y.ok(y.ana, 'topico-editar', { topico: t2, titulo: 'Tarde', texto: 'Um segundo depois, não.', tags: [] }))
  assert.equal(e.codigo, 'fora_da_janela')
  const z = forum()
  const t3 = z.topico(z.ana, z.c)
  z.ok(z.mod, 'topico-gestao', { topico: t3, acao: 'trancar', comunidade: null, categoria: null })
  assert.equal(z.cod(z.ana, 'topico-editar', { topico: t3, titulo: 'Trancado', texto: 'Não edita trancado.', tags: [] }), 'trancado')
})

test('editar reindexa a busca e as tags; a menção nova avisa, a antiga não avisa de novo', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tema antigo', texto: `Oi @${x.beto.handle} tudo bem` })
  const antesBeto = avisos(x, x.beto).filter((n) => n === 'mencao').length
  assert.equal(x.s.buscar({ q: 'antigo' }, x.m.relogio.agora).topicos.length, 1)
  x.ok(x.ana, 'topico-editar', { topico: t, titulo: 'Tema moderno', texto: `Oi @${x.beto.handle} e @${x.caio.handle} tudo bem`, tags: [] })
  assert.equal(x.s.buscar({ q: 'antigo' }, x.m.relogio.agora).topicos.length, 0)
  assert.equal(x.s.buscar({ q: 'moderno' }, x.m.relogio.agora).topicos.length, 1)
  assert.equal(avisos(x, x.beto).filter((n) => n === 'mencao').length, antesBeto, 'beto já tinha sido avisado')
  assert.equal(avisos(x, x.caio)[0], 'mencao')
})

// ---------- enquete ----------

test('enquete: voto único e secreto, contagem por opção, "voce" só para quem lê com credencial, e encerra no prazo', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { enquete: { opcoes: ['Planilha', 'Papel', 'Caderno'], encerraEm: x.m.relogio.agora + 7200 } })
  const prazo = x.m.relogio.agora + 7200
  assert.deepEqual(x.s.topicoDetalhe(t, {}).enquete, { opcoes: [{ texto: 'Planilha', votos: 0 }, { texto: 'Papel', votos: 0 }, { texto: 'Caderno', votos: 0 }], encerraEm: prazo, encerrada: false, total: 0, voce: null })
  const v = x.ok(x.beto, 'voto', { topico: t, opcao: 1 })
  x.ok(x.caio, 'voto', { topico: t, opcao: 1 })
  x.ok(x.ana, 'voto', { topico: t, opcao: 0 })
  assert.equal(x.cod(x.beto, 'voto', { topico: t, opcao: 2 }), 'ja_existe', 'sem troca de voto')
  const e = x.s.topicoDetalhe(t, {}).enquete
  assert.deepEqual(e.opcoes.map((o) => o.votos), [1, 2, 0])
  assert.equal(e.total, 3)
  assert.equal(x.s.topicoDetalhe(t, { credencial: x.como(x.beto) }).enquete.voce, 1)
  assert.equal(x.s.topicoDetalhe(t, { credencial: x.como(x.mod) }).enquete.voce, null)
  assert.equal(x.m.armazem.objeto(v.id).envelope, null, 'o envelope do voto não é guardado')
  assert.equal(codigoDe(() => x.rele.objeto(v.id)), 'nao_encontrado')
  assert.equal(JSON.stringify(x.s.topicoDetalhe(t, {}).enquete).includes('rvr_'), false, 'a enquete não traz uid nenhum: quem votou não aparece')
  x.avancar(7200)
  assert.equal(x.cod(x.mod, 'voto', { topico: t, opcao: 0 }), 'enquete_encerrada')
  assert.equal(x.s.topicoDetalhe(t, {}).enquete.encerrada, true)
})

test('voto: opção que não existe, tópico sem enquete, quem não é membro e a carência de 1 hora', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { enquete: { opcoes: ['Sim', 'Não'], encerraEm: x.m.relogio.agora + 86400 } })
  const sem = x.topico(x.ana, x.c, { titulo: 'Sem enquete' })
  assert.equal(x.cod(x.beto, 'voto', { topico: t, opcao: 2 }), 'esquema')
  assert.equal(x.cod(x.beto, 'voto', { topico: sem, opcao: 0 }), 'esquema')
  assert.equal(x.cod(x.rover(), 'voto', { topico: t, opcao: 0 }), 'nao_e_membro')
  const novo = x.rover()
  x.entra(novo, x.c, { esperar: false })
  const e = erroDe(() => x.ok(novo, 'voto', { topico: t, opcao: 0 }))
  assert.equal(e.codigo, 'em_carencia', 'voto de quem acabou de entrar não conta (anti-raid)')
  x.avancar(3600)
  assert.equal(x.faz(novo, 'voto', { topico: t, opcao: 0 }).estado, 'aceito')
  x.gestao(x.dono, x.c, x.caio, 'banir', 'spam')
  assert.equal(x.cod(x.caio, 'voto', { topico: t, opcao: 0 }), 'banido')
})

// ---------- fixar, trancar, mover ----------

test('fixar e desafixar: só moderador; fixados vêm primeiro na primeira página; no máximo 3', () => {
  const x = forum()
  const ts = [1, 2, 3, 4].map((i) => { const t = x.topico(x.ana, x.c, { titulo: `Tópico ${i}` }); x.avancar(1); return t })
  assert.equal(x.cod(x.ana, 'topico-gestao', { topico: ts[0], acao: 'fixar', comunidade: null, categoria: null }), 'sem_permissao', 'nem o autor fixa')
  assert.equal(x.cod(x.rover(), 'topico-gestao', { topico: ts[0], acao: 'fixar', comunidade: null, categoria: null }), 'nao_e_membro')
  for (const t of ts.slice(0, 3)) x.ok(x.mod, 'topico-gestao', { topico: t, acao: 'fixar', comunidade: null, categoria: null })
  assert.equal(x.cod(x.mod, 'topico-gestao', { topico: ts[0], acao: 'fixar', comunidade: null, categoria: null }), 'ja_existe')
  assert.equal(x.cod(x.mod, 'topico-gestao', { topico: ts[3], acao: 'fixar', comunidade: null, categoria: null }), 'limite_de_estrutura')
  const pag = x.s.topicosDa(x.c, {})
  assert.deepEqual(pag.fixados.map((t) => t.id), [ts[2], ts[1], ts[0]])
  assert.deepEqual(pag.itens.map((t) => t.id), [ts[3]], 'o fixado não repete na lista')
  assert.equal(x.s.topicosDa(x.c, {}).fixados[0].fixado, true)
  x.ok(x.dono, 'topico-gestao', { topico: ts[0], acao: 'desafixar', comunidade: null, categoria: null })
  assert.equal(x.cod(x.dono, 'topico-gestao', { topico: ts[0], acao: 'desafixar', comunidade: null, categoria: null }), 'ja_existe')
  assert.equal(x.s.topicosDa(x.c, {}).fixados.length, 2)
  const seg = x.s.topicosDa(x.c, { limite: 1 })
  assert.equal(x.s.topicosDa(x.c, { limite: 1, antes: seg.proximo }).fixados, undefined, 'a segunda página não repete os fixados')
})

test('mover: precisa de papel de moderador nos dois lados; o id e as respostas ficam; a categoria de destino precisa existir', () => {
  const x = forum()
  const donoDest = x.rover()
  const dest = x.comunidade(donoDest, { categorias: ['Arquivo'], nome: 'Destino de tópicos' })
  const t = x.topico(x.ana, x.c, { categoria: 'Dúvidas' })
  const r = x.responde(x.beto, t, 'uma resposta')
  const mover = (quem, comunidade, categoria = null) => x.cod(quem, 'topico-gestao', { topico: t, acao: 'mover', comunidade, categoria })
  assert.equal(mover(x.mod, dest), 'nao_e_membro', 'moderador só da origem não move para onde não é membro')
  x.entra(x.mod, dest, { esperar: false })
  assert.equal(mover(x.mod, dest), 'sem_permissao', 'membro comum no destino')
  assert.equal(mover(x.ana, dest), 'sem_permissao', 'o autor também não move')
  x.entra(x.beto, dest, { esperar: false })
  assert.equal(mover(donoDest, dest), 'nao_e_membro', 'o dono do destino não é da origem')
  x.gestao(donoDest, dest, x.mod, 'promover')
  assert.equal(mover(x.mod, dest, 'Inexistente'), 'esquema', 'categoria que o destino não tem')
  assert.equal(mover(x.mod, dest, 'Arquivo'), 'ok')
  assert.equal(x.s.topicoDetalhe(t, {}).comunidade, dest)
  assert.equal(x.s.topicoDetalhe(t, {}).categoria, 'Arquivo')
  assert.deepEqual(x.s.topicosDa(x.c, {}).itens, [], 'saiu da origem')
  assert.deepEqual(x.s.topicosDa(dest, {}).itens.map((i) => i.id), [t])
  assert.deepEqual(x.s.respostasDo(t, {}).itens.map((i) => i.id), [r], 'as respostas vão junto')
  assert.equal(x.m.armazem.objeto(t).ctx, dest)
  // quem era moderador só da origem perde o poder sobre o tópico
  assert.equal(x.cod(x.dono, 'topico-gestao', { topico: t, acao: 'fixar', comunidade: null, categoria: null }), 'nao_e_membro')
  assert.equal(x.faz(x.mod, 'topico-gestao', { topico: t, acao: 'fixar', comunidade: null, categoria: null }).estado, 'aceito')
})

test('mover para a mesma comunidade só muda a categoria; sem mudança nenhuma é "ja_existe"', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { categoria: 'Dúvidas' })
  assert.equal(x.cod(x.mod, 'topico-gestao', { topico: t, acao: 'mover', comunidade: x.c, categoria: 'Dúvidas' }), 'ja_existe')
  assert.equal(x.faz(x.mod, 'topico-gestao', { topico: t, acao: 'mover', comunidade: x.c, categoria: 'Dicas' }).estado, 'aceito')
  assert.equal(x.s.topicoDetalhe(t, {}).categoria, 'Dicas')
  assert.equal(x.faz(x.mod, 'topico-gestao', { topico: t, acao: 'mover', comunidade: x.c, categoria: null }).estado, 'aceito')
  assert.equal(x.s.topicoDetalhe(t, {}).categoria, null)
})

test('mover de comunidade fechada para uma aberta exige ser o DONO da fechada: torna o conteúdo público', () => {
  const x = forum()
  const fechada = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechada de origem' })
  const aberta = x.comunidade(x.dono, { nome: 'Aberta de destino' })
  for (const r of [x.mod, x.ana]) { x.gestao(x.dono, fechada, r, 'convidar'); x.ok(r, 'comunidade-adesao', { comunidade: fechada, acao: 'aceitar-convite' }) }
  x.gestao(x.dono, fechada, x.mod, 'promover')
  x.entra(x.mod, aberta, { esperar: false })
  x.gestao(x.dono, aberta, x.mod, 'promover')
  x.avancar(3601)
  const t = x.topico(x.ana, fechada)
  assert.equal(x.cod(x.mod, 'topico-gestao', { topico: t, acao: 'mover', comunidade: aberta, categoria: null }), 'sem_permissao', 'moderador com papel nos dois lados ainda não publica o que é fechado')
  assert.equal(codigoDe(() => x.s.topicoDetalhe(t, {})), 'nao_encontrado')
  assert.equal(x.faz(x.dono, 'topico-gestao', { topico: t, acao: 'mover', comunidade: aberta, categoria: null }).estado, 'aceito')
  assert.equal(x.s.topicoDetalhe(t, {}).comunidade, aberta)
  // o contrário (aberta para fechada) é do moderador: o conteúdo só fica mais restrito
  const t2 = x.topico(x.dono, aberta)
  assert.equal(x.faz(x.dono, 'topico-gestao', { topico: t2, acao: 'mover', comunidade: fechada, categoria: null }).estado, 'aceito')
  assert.equal(codigoDe(() => x.s.topicoDetalhe(t2, {})), 'nao_encontrado')
})

// ---------- resolveu ----------

test('marcar resposta como "resolveu": autor do tópico e moderadores; a nova substitui; desmarcar com null; avisa o autor da resposta', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.responde(x.beto, t, 'tente assim')
  const r2 = x.responde(x.caio, t, 'ou assim')
  assert.equal(x.cod(x.beto, 'topico-resolvido', { topico: t, resposta: r1 }), 'sem_permissao', 'outro membro não marca')
  x.ok(x.ana, 'topico-resolvido', { topico: t, resposta: r1 })
  assert.equal(avisos(x, x.beto)[0], 'resolveu')
  let d = x.s.topicoDetalhe(t, {})
  assert.deepEqual([d.resolvido, d.resolvidoPor.resposta, d.resolvidoPor.por.uid], [true, r1, x.ana.uid])
  assert.equal(x.s.respostasDo(t, {}).itens.find((i) => i.id === r1).resolveu, true)
  assert.equal(x.s.topicosDa(x.c, {}).itens[0].resolvido, true)
  x.ok(x.mod, 'topico-resolvido', { topico: t, resposta: r2 })
  d = x.s.topicoDetalhe(t, {})
  assert.equal(d.resolvidoPor.resposta, r2)
  assert.equal(x.s.respostasDo(t, {}).itens.find((i) => i.id === r1).resolveu, false, 'uma só por tópico')
  x.ok(x.ana, 'topico-resolvido', { topico: t, resposta: null })
  assert.equal(x.s.topicoDetalhe(t, {}).resolvido, false)
  assert.equal(x.cod(x.ana, 'topico-resolvido', { topico: t, resposta: t }), 'alvo_desconhecido', 'o tópico não é resposta')
  const outro = x.topico(x.ana, x.c, { titulo: 'Outro' })
  assert.equal(x.cod(x.ana, 'topico-resolvido', { topico: outro, resposta: r1 }), 'alvo_desconhecido', 'resposta de outro tópico')
})

test('se a resposta que resolveu é apagada, o "resolveu" cai', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r1 = x.responde(x.beto, t, 'a solução')
  x.ok(x.ana, 'topico-resolvido', { topico: t, resposta: r1 })
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: r1 })
  assert.equal(x.s.topicoDetalhe(t, {}).resolvido, false)
})

// ---------- ordenação ----------

test('ordens: recentes (criação), ativos (última resposta) e sem-resposta; filtros por categoria e tag; cursor sem repetir', () => {
  const x = forum()
  const mk = (titulo, extra) => { const t = x.topico(x.ana, x.c, { titulo, ...extra }); x.avancar(1); return t }
  const a = mk('Primeiro', { categoria: 'Dúvidas', tags: ['planilhas'] })
  const b = mk('Segundo', { categoria: 'Dicas' })
  const c = mk('Terceiro', { categoria: 'Dúvidas', tags: ['planilhas'] })
  x.responde(x.beto, a, 'resposta no primeiro')
  const ids = (o) => x.s.topicosDa(x.c, o).itens.map((i) => i.id)
  assert.deepEqual(ids({}), [c, b, a], 'recentes')
  assert.deepEqual(ids({ ordem: 'ativos' }), [a, c, b], 'o primeiro subiu com a resposta')
  assert.deepEqual(ids({ ordem: 'sem-resposta' }), [c, b])
  assert.deepEqual(ids({ categoria: 'Dúvidas' }), [c, a])
  assert.deepEqual(ids({ tag: 'planilhas' }), [c, a])
  assert.deepEqual(ids({ categoria: 'Dúvidas', tag: 'planilhas', ordem: 'sem-resposta' }), [c])
  assert.equal(codigoDe(() => x.s.topicosDa(x.c, { ordem: 'aleatoria' })), 'esquema')
  assert.equal(codigoDe(() => x.s.topicosDa(x.c, { tag: 'Maiuscula' })), 'esquema')
  const p1 = x.s.topicosDa(x.c, { limite: 2, ordem: 'ativos' })
  const p2 = x.s.topicosDa(x.c, { limite: 2, ordem: 'ativos', antes: p1.proximo })
  assert.deepEqual([...p1.itens, ...p2.itens].map((i) => i.id), [a, c, b])
  assert.equal(p2.proximo, null)
  assert.equal(x.s.comunidadesListadas({ ordem: 'ativas' }).itens.length, 1)
})

test('a atividade de um tópico sobe a comunidade na lista "ativas"', () => {
  const x = forum()
  const outra = x.comunidade(x.rover(), { nome: 'Outra comunidade qualquer' })
  assert.deepEqual(x.s.comunidadesListadas({ ordem: 'ativas' }).itens.map((i) => i.id), [outra, x.c], 'a mais nova primeiro enquanto ninguém fala')
  x.topico(x.ana, x.c)
  assert.deepEqual(x.s.comunidadesListadas({ ordem: 'ativas' }).itens.map((i) => i.id), [x.c, outra])
})

// ---------- apagar e esconder ----------

test('o autor apaga o tópico: some da lista, do detalhe e da busca, as respostas somem junto e o texto é esvaziado', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Tópico para apagar', tags: ['apagar'] })
  x.responde(x.beto, t, 'uma resposta qualquer')
  x.ok(x.ana, 'remocao-pelo-autor', { alvo: t })
  assert.deepEqual(x.s.topicosDa(x.c, {}).itens, [])
  assert.equal(codigoDe(() => x.s.topicoDetalhe(t, {})), 'removido')
  assert.equal(codigoDe(() => x.s.respostasDo(t, {})), 'removido')
  assert.equal(codigoDe(() => x.rele.objeto(t)), 'removido')
  assert.equal(x.s.buscar({ q: 'apagar' }, x.m.relogio.agora).topicos.length, 0)
  assert.equal(x.m.armazem.um('SELECT texto, titulo FROM topicos WHERE id = :t', { t }).titulo, '')
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM tags_uso WHERE objeto = :t', { t }).n, 0)
  assert.equal(x.cod(x.caio, 'resposta-forum', { topico: t, em: null, cita: null, texto: 'tarde demais' }), 'alvo_removido')
})

test('reagir a tópico e a resposta de fórum: só membro; uma por autor; a contagem aparece na resposta', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r = x.responde(x.beto, t, 'resposta')
  assert.equal(x.cod(x.rover(), 'reacao', { alvo: t, reacao: 'curtir' }), 'nao_e_membro')
  x.ok(x.caio, 'reacao', { alvo: r, reacao: 'util' })
  x.ok(x.ana, 'reacao', { alvo: r, reacao: 'util' })
  x.ok(x.ana, 'reacao', { alvo: t, reacao: 'curtir' })
  assert.equal(x.cod(x.caio, 'reacao', { alvo: r, reacao: 'curtir' }), 'ja_reagiu')
  assert.deepEqual(x.s.respostasDo(t, {}).itens[0].reacoes, { curtir: 0, util: 2 })
  x.gestao(x.dono, x.c, x.caio, 'banir', 'spam')
  assert.equal(x.cod(x.caio, 'reacao', { alvo: t, reacao: 'curtir' }), 'banido')
  // reação a objeto que não é um alvo válido
  assert.equal(x.cod(x.ana, 'reacao', { alvo: x.c, reacao: 'curtir' }), 'esquema', 'comunidade não é alvo de reação')
})
