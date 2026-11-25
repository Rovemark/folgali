// SPDX-License-Identifier: AGPL-3.0-or-later
// Moderação em camadas: remoção por responsável, registro público, apelação, bloqueio do relé e denúncia em duas filas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TEMPOS } from '../../packages/protocolo/src/index.js'
import { DIA, codigoDe, erroDe, nova } from '../ajuda/rede.js'

function forum() {
  const x = nova()
  const dono = x.rover()
  const mod = x.rover()
  const [ana, beto, caio] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono, { categorias: [] })
  for (const r of [mod, ana, beto, caio]) { x.entra(r, c, { esperar: false }); x.avancar(1) }
  x.gestao(dono, c, mod, 'promover')
  x.avancar(3601)
  return Object.assign(x, { dono, mod, ana, beto, caio, c })
}
const avisos = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens
const remover = (x, quem, alvo, motivo = 'spam') => x.ok(quem, 'remocao-por-responsavel', { alvo, motivo })

// ---------- remoção por responsável ----------

test('moderador remove tópico e resposta de um membro: some das leituras, da busca e das tags; o autor é avisado sem saber quem', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Oferta imperdível', tags: ['oferta'] })
  const r = x.responde(x.beto, t, 'Compre já')
  remover(x, x.mod, r, 'spam')
  assert.equal(x.s.respostasDo(t, {}).itens.length, 0)
  assert.equal(codigoDe(() => x.rele.objeto(r)), 'removido')
  assert.deepEqual(avisos(x, x.beto)[0], { seq: avisos(x, x.beto)[0].seq, tipo: 'removido-por-responsavel', em: x.m.relogio.agora, origem: null, objeto: null, comunidade: x.c, pagina: null, lugar: { tipo: 'comunidade', id: x.c, nome: x.s.comunidade(x.c).nome }, topico: null })
  remover(x, x.mod, t, 'spam')
  assert.deepEqual(x.s.topicosDa(x.c, {}).itens, [])
  assert.equal(codigoDe(() => x.s.topicoDetalhe(t, {})), 'removido')
  assert.equal(x.s.buscar({ q: 'Oferta' }, x.m.relogio.agora).topicos.length, 0)
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM tags_uso WHERE objeto = :o', { o: t }).n, 0)
  assert.equal(x.cod(x.mod, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' }), 'ja_existe')
  assert.equal(x.m.armazem.objeto(t).envelope !== null, true, 'o envelope fica retido para a apelação')
})

test('quem pode remover: moderador não remove o conteúdo do dono; dono remove tudo; membro e estranho não removem', () => {
  const x = forum()
  const doDono = x.topico(x.dono, x.c, { titulo: 'Aviso do dono' })
  const dele = x.topico(x.ana, x.c, { titulo: 'Tópico da ana' })
  assert.equal(x.cod(x.mod, 'remocao-por-responsavel', { alvo: doDono, motivo: 'regras' }), 'sem_permissao')
  assert.equal(x.cod(x.beto, 'remocao-por-responsavel', { alvo: dele, motivo: 'regras' }), 'sem_permissao', 'membro comum')
  assert.equal(x.cod(x.rover(), 'remocao-por-responsavel', { alvo: dele, motivo: 'regras' }), 'nao_e_membro')
  assert.equal(x.cod(x.ana, 'remocao-por-responsavel', { alvo: dele, motivo: 'regras' }), 'sem_permissao', 'nem o autor: ele usa a remoção pelo autor')
  assert.equal(x.faz(x.dono, 'remocao-por-responsavel', { alvo: dele, motivo: 'regras' }).estado, 'aceito')
  assert.equal(x.faz(x.dono, 'remocao-por-responsavel', { alvo: doDono, motivo: 'outro' }).estado, 'aceito', 'o dono remove o próprio também')
  assert.equal(x.cod(x.mod, 'remocao-por-responsavel', { alvo: `ob_${'A'.repeat(43)}`, motivo: 'spam' }), 'nao_encontrado')
  const post = x.ok(x.ana, 'postagem', { texto: 'postagem pública comum', topicos: [] })
  assert.equal(x.cod(x.dono, 'remocao-por-responsavel', { alvo: post.id, motivo: 'spam' }), 'sem_permissao', 'postagem não é de comunidade')
})

test('moderador de outra comunidade não remove aqui: "nao_e_membro" na pública, "nao_encontrado" na fechada', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const estranho = x.rover()
  x.comunidade(estranho, { nome: 'Outra comunidade' })
  assert.equal(x.cod(estranho, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' }), 'nao_e_membro')
  const f = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechadinha' })
  x.gestao(x.dono, f, x.ana, 'convidar')
  x.ok(x.ana, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.avancar(3601)
  const tf = x.topico(x.ana, f)
  assert.equal(x.cod(estranho, 'remocao-por-responsavel', { alvo: tf, motivo: 'spam' }), 'nao_encontrado')
})

test('registro público: motivo, papel de quem removeu e o id do conteúdo; nunca o texto nem quem moderou; sem registro em mural', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Texto que não deve vazar', texto: 'conteúdo removido' })
  remover(x, x.mod, t, 'assedio')
  const reg = x.s.registroDaComunidade(x.c, {})
  assert.equal(reg.itens.length, 1)
  assert.deepEqual({ ...reg.itens[0], id: undefined, em: undefined }, { id: undefined, em: undefined, escopo: 'comunidade', contexto: x.c, acao: 'remocao', alvoTipo: 'topico', alvo: t, motivo: 'assedio', por: 'moderador', apelacao: null })
  const texto = JSON.stringify(reg)
  for (const segredo of ['Texto que não deve vazar', 'conteúdo removido', x.mod.uid, x.ana.uid]) assert.equal(texto.includes(segredo), false, segredo)
  const t2 = x.topico(x.beto, x.c, { titulo: 'Outro' })
  remover(x, x.dono, t2, 'regras')
  assert.deepEqual(x.s.registroDaComunidade(x.c, {}).itens.map((i) => i.por), ['dono', 'moderador'])
  // pagina do mural não entra
  assert.equal(x.s.registroDoRele({}).itens.length, 0)
})

test('o registro de uma comunidade fechada só é lido por membros', () => {
  const x = forum()
  const f = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechadinha' })
  x.gestao(x.dono, f, x.ana, 'convidar')
  x.ok(x.ana, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.avancar(3601)
  remover(x, x.dono, x.topico(x.ana, f), 'spam')
  assert.equal(codigoDe(() => x.s.registroDaComunidade(f, {})), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.registroDaComunidade(f, { credencial: x.como(x.beto) })), 'nao_encontrado')
  assert.equal(x.s.registroDaComunidade(f, { credencial: x.como(x.ana) }).itens.length, 1)
})

test('o conteúdo escondido é apagado do armazém 30 dias depois, e a identidade de quem moderou também', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  remover(x, x.mod, t)
  assert.equal(x.m.armazem.um('SELECT por FROM remocoes').por, x.mod.uid)
  x.avancar(TEMPOS.retencaoDeRemovidoS - 1)
  x.rele.limpar()
  assert.notEqual(x.m.armazem.objeto(t).envelope, null)
  x.avancar(2)
  x.rele.limpar()
  assert.equal(x.m.armazem.objeto(t).envelope, null)
  assert.equal(x.m.armazem.um('SELECT por FROM remocoes').por, null)
  assert.equal(x.s.registroDaComunidade(x.c, {}).itens.length, 1, 'o registro público fica')
})

// ---------- apelação ----------

function removido() {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Pergunta legítima', tags: ['pergunta'] })
  remover(x, x.mod, t, 'fora-do-tema')
  return Object.assign(x, { t })
}

test('apelação de remoção feita por moderador: o dono decide; revertida devolve o conteúdo, a busca e as tags', () => {
  const x = removido()
  const ap = x.ok(x.ana, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'Era uma pergunta sobre o tema da comunidade.' })
  assert.deepEqual(x.s.registroDaComunidade(x.c, {}).itens[0].apelacao, 'aberta')
  assert.equal(avisos(x, x.dono)[0].tipo, 'apelacao-recebida')
  assert.equal(avisos(x, x.mod).some((n) => n.tipo === 'apelacao-recebida'), false)
  const fila = x.s.filaDaComunidade(x.c, { credencial: x.como(x.dono) })
  assert.deepEqual(fila.apelacoes.map((a) => [a.id, a.tipo, a.alvo, a.autor.uid, a.texto]), [[ap.id, 'remocao', x.t, x.ana.uid, 'Era uma pergunta sobre o tema da comunidade.']])
  assert.equal(fila.apelacoes[0].envelope.objeto.corpo.titulo, 'Pergunta legítima', 'o dono vê o conteúdo retido')
  assert.deepEqual(x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) }).apelacoes, [], 'o moderador não vê apelações')
  assert.equal(x.cod(x.mod, 'apelacao-decisao', { apelacao: ap.id, resultado: 'revertida' }), 'sem_permissao', 'moderador não decide')
  assert.equal(x.cod(x.ana, 'apelacao-decisao', { apelacao: ap.id, resultado: 'revertida' }), 'sem_permissao', 'o apelante também não')
  x.ok(x.dono, 'apelacao-decisao', { apelacao: ap.id, resultado: 'revertida' })
  assert.equal(x.s.topicoDetalhe(x.t, {}).titulo, 'Pergunta legítima')
  assert.equal(x.s.topicosDa(x.c, {}).itens.length, 1)
  assert.equal(x.s.buscar({ q: 'legítima' }, x.m.relogio.agora).topicos.length, 1)
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM tags_uso WHERE objeto = :o', { o: x.t }).n, 1)
  assert.equal(avisos(x, x.ana)[0].tipo, 'apelacao-decidida')
  assert.equal(x.s.registroDaComunidade(x.c, {}).itens[0].apelacao, 'revertida')
  assert.equal(x.cod(x.dono, 'apelacao-decisao', { apelacao: ap.id, resultado: 'mantida' }), 'ja_existe')
})

test('apelação mantida: nada volta e o caso fecha; uma por caso; fora de 14 dias não vale', () => {
  const x = removido()
  const ap = x.ok(x.ana, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'Peço revisão.' })
  assert.equal(x.cod(x.ana, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'De novo.' }), 'ja_existe')
  x.ok(x.dono, 'apelacao-decisao', { apelacao: ap.id, resultado: 'mantida' })
  assert.equal(codigoDe(() => x.s.topicoDetalhe(x.t, {})), 'removido')
  assert.equal(x.s.registroDaComunidade(x.c, {}).itens[0].apelacao, 'mantida')
  assert.deepEqual(x.s.filaDaComunidade(x.c, { credencial: x.como(x.dono) }).apelacoes, [])
  const y = removido()
  y.avancar(TEMPOS.janelaDeApelacaoS)
  assert.equal(y.faz(y.ana, 'apelacao', { tipo: 'remocao', alvo: y.t, texto: 'No último dia.' }).estado, 'aceito')
  const z = removido()
  z.avancar(TEMPOS.janelaDeApelacaoS + 1)
  assert.equal(erroDe(() => z.ok(z.ana, 'apelacao', { tipo: 'remocao', alvo: z.t, texto: 'Tarde demais.' })).codigo, 'fora_da_janela')
})

test('apelação: só o autor do conteúdo; remoção em mural de perfil não tem apelação; conteúdo não removido não apela', () => {
  const x = removido()
  assert.equal(x.cod(x.beto, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'Não é meu.' }), 'nao_encontrado')
  const vivo = x.topico(x.ana, x.c, { titulo: 'Vivo' })
  assert.equal(x.cod(x.ana, 'apelacao', { tipo: 'remocao', alvo: vivo, texto: 'Nada a apelar.' }), 'nao_encontrado')
  const rec = x.ok(x.beto, 'recado', { alvo: x.ana.uid, texto: 'oi' })
  x.ok(x.ana, 'remocao-por-responsavel', { alvo: rec.id, motivo: 'spam' })
  assert.equal(x.cod(x.beto, 'apelacao', { tipo: 'remocao', alvo: rec.id, texto: 'Meu recado.' }), 'sem_permissao')
  assert.equal(x.cod(x.ana, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Não fui banida.' }), 'nao_encontrado')
  assert.equal(x.cod(x.ana, 'apelacao', { tipo: 'remocao', alvo: x.t, texto: 'sem aprovação' }, { aprovada: false }), 'sem_aprovacao')
})

test('apelação de banimento: o banido apela, o dono decide; revertida levanta o banimento mas não recoloca como membro', () => {
  const x = forum()
  x.gestao(x.mod, x.c, x.caio, 'banir', 'spam')
  const ap = x.ok(x.caio, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Foi um engano.' })
  assert.equal(x.s.banidosDa(x.c, { credencial: x.como(x.dono) }).itens[0].apelacao, 'aberta')
  assert.equal(x.cod(x.caio, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'De novo.' }), 'ja_existe')
  x.ok(x.dono, 'apelacao-decisao', { apelacao: ap.id, resultado: 'revertida' })
  assert.equal(x.s.banidosDa(x.c, { credencial: x.como(x.dono) }).itens.length, 0)
  assert.equal(x.s.papel(x.c, x.caio.uid), null, 'não volta como membro')
  assert.equal(x.ok(x.caio, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }).resultado, 'membro', 'mas já pode entrar')
  assert.equal(x.s.registroDaComunidade(x.c, {}).itens[0].apelacao, 'revertida')
})

test('remoção ou banimento feito pelo DONO não tem decisor dentro da comunidade: a apelação cai na fila do relé, que decide', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  remover(x, x.dono, t, 'regras')
  x.gestao(x.dono, x.c, x.caio, 'banir', 'assedio')
  const a1 = x.ok(x.ana, 'apelacao', { tipo: 'remocao', alvo: t, texto: 'O dono removeu e discordo.' })
  const a2 = x.ok(x.caio, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Banido por engano.' })
  assert.equal(x.cod(x.dono, 'apelacao-decisao', { apelacao: a1.id, resultado: 'revertida' }), 'sem_permissao', 'o dono não julga a si mesmo')
  assert.deepEqual(x.s.filaDaComunidade(x.c, { credencial: x.como(x.dono) }).apelacoes, [])
  assert.equal(avisos(x, x.dono).some((n) => n.tipo === 'apelacao-recebida'), false)
  const fila = x.s.apelacoesDoRele({})
  assert.deepEqual(fila.itens.map((a) => [a.id, a.tipo, a.origem]).sort(), [[a1.id, 'remocao', 'rele'], [a2.id, 'banimento', 'rele']].sort())
  x.s.decidirApelacaoDoRele(a1.id, 'revertida')
  x.s.decidirApelacaoDoRele(a2.id, 'mantida')
  assert.equal(x.s.topicoDetalhe(t, {}).id, t)
  assert.equal(x.s.banidosDa(x.c, { credencial: x.como(x.dono) }).itens[0].apelacao, 'mantida')
  assert.equal(avisos(x, x.ana)[0].tipo, 'apelacao-decidida')
  assert.equal(codigoDe(() => x.s.decidirApelacaoDoRele(a1.id, 'revertida')), 'ja_existe')
  assert.equal(codigoDe(() => x.s.decidirApelacaoDoRele(`ob_${'A'.repeat(43)}`, 'revertida')), 'nao_encontrado')
})

// ---------- o relé ----------

test('o relé bloqueia um objeto com motivo público: entra no registro do relé; a apelação cai na fila dele; reverter desbloqueia', () => {
  const x = forum()
  const post = x.ok(x.ana, 'postagem', { texto: 'uma postagem polêmica', topicos: [] })
  x.rele.bloquear({ tipo: 'objeto', alvo: post.id, motivo: 'denúncia procedente em análise', motivoPublico: 'assedio' })
  assert.equal(codigoDe(() => x.rele.objeto(post.id)), 'nao_encontrado')
  const reg = x.s.registroDoRele({})
  assert.deepEqual(reg.itens.map((i) => [i.escopo, i.acao, i.alvoTipo, i.alvo, i.motivo, i.por, i.apelacao]), [['rele', 'remocao', 'postagem', post.id, 'assedio', 'rele', null]])
  const ap = x.ok(x.ana, 'apelacao', { tipo: 'remocao', alvo: post.id, texto: 'Não vejo o problema.' })
  assert.deepEqual(x.s.apelacoesDoRele({}).itens.map((a) => a.id), [ap.id])
  x.s.decidirApelacaoDoRele(ap.id, 'revertida')
  assert.equal(x.rele.objeto(post.id).objeto.id, post.id)
  assert.equal(x.rele.listarBloqueios().length, 0)
  // sem motivo público o bloqueio continua privado
  x.rele.bloquear({ tipo: 'objeto', alvo: post.id, motivo: 'privado' })
  assert.equal(x.s.registroDoRele({}).itens.length, 1)
  assert.equal(codigoDe(() => x.rele.bloquear({ tipo: 'rover', alvo: x.ana.uid, motivo: 'x', motivoPublico: 'spam' })), 'esquema')
  assert.equal(codigoDe(() => x.rele.bloquear({ tipo: 'objeto', alvo: post.id, motivo: 'x', motivoPublico: 'golpe' })), 'esquema')
})

test('o relé bloqueia o objeto que criou uma comunidade: ela some das listas e das leituras', () => {
  const x = forum()
  x.rele.bloquear({ tipo: 'objeto', alvo: x.c, motivo: 'comunidade de golpe', motivoPublico: 'ilegal' })
  assert.deepEqual(x.s.comunidadesListadas({}).itens, [])
  assert.equal(codigoDe(() => x.s.comunidadeDetalhe(x.c, {})), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.topicosDa(x.c, {})), 'nao_encontrado')
  assert.equal(x.s.buscar({ q: 'Comunidade' }, x.m.relogio.agora).comunidades.length, 0)
  x.rele.desbloquear('objeto', x.c)
  assert.equal(x.s.comunidadeDetalhe(x.c, {}).id, x.c)
})

// ---------- denúncia ----------

test('denúncia de conteúdo de comunidade vai para as duas filas; a da comunidade mostra motivos e pesos, nunca o denunciante', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Conteúdo suspeito' })
  x.faz(x.beto, 'denuncia', { alvo: t, motivo: 'spam' })
  x.faz(x.caio, 'denuncia', { alvo: t, motivo: 'assedio' })
  const fila = x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) })
  assert.equal(fila.denuncias.length, 1)
  assert.deepEqual({ ...fila.denuncias[0], primeiraEm: 0, ultimaEm: 0 }, { alvo: t, alvoTipo: 'topico', topico: t, motivos: { spam: 1, assedio: 1 }, total: 2, primeiraEm: 0, ultimaEm: 0, peso: 2 })
  const texto = JSON.stringify(fila)
  for (const quem of [x.beto, x.caio]) {
    assert.equal(texto.includes(quem.uid), false)
    assert.equal(texto.includes(x.rele._pseudonimo(quem.uid)), false, 'nem o pseudônimo que o operador do relé vê')
  }
  const doRele = x.rele.listarDenuncias()
  assert.equal(doRele.length, 2)
  assert.equal(doRele[0].comunidade, x.c)
  assert.ok(doRele.every((d) => d.denunciante.length === 22))
  assert.equal(x.faz(x.beto, 'denuncia', { alvo: t, motivo: 'spam' }).estado, 'recebida', 'repetir é aceito em silêncio, sem duplicar')
  assert.equal(x.rele.listarDenuncias().length, 2)
  assert.equal(codigoDe(() => x.s.filaDaComunidade(x.c, { credencial: x.como(x.beto) })), 'sem_permissao')
  assert.equal(codigoDe(() => x.s.filaDaComunidade(x.c, { credencial: null })), 'leitura_nao_autorizada')
})

test('o peso da denúncia só conta quem tem conta de 7 dias ou mais, e as novas motivos existem', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  x.m.armazem.executar('UPDATE rovers SET criado_em = :n WHERE uid = :u', { n: x.m.relogio.agora - 2 * DIA, u: x.caio.uid })
  x.faz(x.beto, 'denuncia', { alvo: t, motivo: 'menores' })
  x.faz(x.caio, 'denuncia', { alvo: t, motivo: 'personificacao' })
  const g = x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) }).denuncias[0]
  assert.equal(g.total, 2)
  assert.equal(g.peso, 1, 'só a denúncia de quem tem 7 dias ou mais pesa')
  assert.deepEqual(g.motivos, { menores: 1, personificacao: 1 })
  assert.equal(x.faz(x.beto, 'denuncia', { alvo: t, motivo: 'fora-do-tema' }).estado, 'recebida')
  assert.equal(x.cod(x.beto, 'denuncia', { alvo: t, motivo: 'ilegal-demais' }), 'esquema', 'motivo fora do enum')
})

test('brigading: 50 rovers denunciam o mesmo conteúdo e NADA é escondido nem removido; a fila só ordena', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Conteúdo legítimo atacado' })
  const r = x.responde(x.beto, t, 'uma resposta também atacada')
  for (let i = 0; i < 50; i++) {
    const atacante = x.rover()
    x.faz(atacante, 'denuncia', { alvo: t, motivo: 'assedio' })
    x.faz(atacante, 'denuncia', { alvo: r, motivo: 'spam' })
  }
  assert.equal(x.s.topicoDetalhe(t, {}).titulo, 'Conteúdo legítimo atacado')
  assert.equal(x.s.respostasDo(t, {}).itens.length, 1)
  assert.equal(x.s.topicosDa(x.c, {}).itens.length, 1)
  assert.equal(x.s.buscar({ q: 'legítimo' }, x.m.relogio.agora).topicos.length, 1)
  assert.equal(x.m.armazem.objeto(t).oculto_em, null)
  const fila = x.s.filaDaComunidade(x.c, { credencial: x.como(x.mod) })
  assert.equal(fila.denuncias[0].total, 50)
  assert.equal(x.faz(x.ana, 'topico-editar', { topico: t, titulo: 'Segue editável', texto: 'O autor segue podendo editar.', tags: [] }).estado, 'aceito')
})

test('o denunciante tem teto de 10 por dia; denúncia de quem não pode ver o alvo (comunidade fechada) é descartada em silêncio', () => {
  const x = forum()
  const f = x.comunidade(x.dono, { acesso: 'fechada', nome: 'Fechada para denúncia' })
  x.gestao(x.dono, f, x.ana, 'convidar')
  x.ok(x.ana, 'comunidade-adesao', { comunidade: f, acao: 'aceitar-convite' })
  x.avancar(3601)
  const tf = x.topico(x.ana, f, { titulo: 'Segredo' })
  const estranho = x.rover()
  const r = x.faz(estranho, 'denuncia', { alvo: tf, motivo: 'spam' })
  assert.equal(r.estado, 'recebida', 'a mesma resposta de sempre')
  assert.equal(x.rele.listarDenuncias().length, 0, 'mas nada foi guardado')
  const aberta = x.topico(x.ana, x.c, { titulo: 'Aberto' })
  assert.equal(x.faz(estranho, 'denuncia', { alvo: aberta, motivo: 'spam' }).estado, 'recebida')
  assert.equal(x.rele.listarDenuncias().length, 1)
  const inexistente = x.faz(estranho, 'denuncia', { alvo: `ob_${'A'.repeat(43)}`, motivo: 'spam' })
  assert.equal(inexistente.estado, 'recebida')
  // denunciar a própria comunidade (o objeto que a criou) vai só para a fila do relé
  x.faz(x.beto, 'denuncia', { alvo: x.c, motivo: 'personificacao' })
  assert.deepEqual(x.s.filaDaComunidade(x.c, { credencial: x.como(x.dono) }).denuncias.map((d) => d.alvo), [aberta], 'na fila da comunidade só o tópico, não ela mesma')
  assert.equal(x.rele.listarDenuncias().some((d) => d.alvo === x.c && d.comunidade === null), true)
  // um membro da fechada consegue denunciar
  x.faz(x.dono, 'denuncia', { alvo: tf, motivo: 'spam' })
  assert.equal(x.s.filaDaComunidade(f, { credencial: x.como(x.dono) }).denuncias.length, 1)
})

// ---------- páginas, restauração e bordas da apelação ----------

test('atualização de página: só o dono remove, e não a própria; página que não existe mais não deixa remover; o autor é avisado com a página', () => {
  const x = forum()
  const pag = x.ok(x.dono, 'pagina-criar', { nome: 'Página moderada', descricao: '', tema: 'rovers' }).id
  x.ok(x.dono, 'pagina-gestao', { pagina: pag, alvo: x.mod.uid, acao: 'adicionar-admin' })
  const doDono = x.ok(x.dono, 'pagina-publicar', { pagina: pag, texto: 'atualização do dono', tags: [] })
  const doAdm = x.ok(x.mod, 'pagina-publicar', { pagina: pag, texto: 'atualização do administrador', tags: ['aviso'] })
  assert.equal(x.cod(x.dono, 'remocao-por-responsavel', { alvo: doDono.id, motivo: 'spam' }), 'sem_permissao', 'o dono não remove a própria por esta rota')
  assert.equal(x.cod(x.mod, 'remocao-por-responsavel', { alvo: doAdm.id, motivo: 'spam' }), 'sem_permissao', 'nem o administrador a dele')
  assert.equal(x.cod(x.ana, 'remocao-por-responsavel', { alvo: doAdm.id, motivo: 'spam' }), 'sem_permissao')
  x.ok(x.dono, 'remocao-por-responsavel', { alvo: doAdm.id, motivo: 'fora-do-tema' })
  const n = avisos(x, x.mod)[0]
  assert.deepEqual([n.tipo, n.pagina, n.comunidade, n.origem], ['removido-por-responsavel', pag, null, null])
  assert.deepEqual(x.s.registroDaPagina(pag, {}).itens.map((i) => [i.escopo, i.contexto, i.motivo, i.por]), [['pagina', pag, 'fora-do-tema', 'dono']])
  // página encerrada: nada a remover
  const outra = x.ok(x.beto, 'pagina-criar', { nome: 'Página que acaba', descricao: '', tema: 'rovers' }).id
  const u = x.ok(x.beto, 'pagina-publicar', { pagina: outra, texto: 'x', tags: [] })
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: outra })
  assert.equal(x.cod(x.beto, 'remocao-por-responsavel', { alvo: u.id, motivo: 'spam' }), 'sem_permissao')
})

test('apelação revertida de atualização de página devolve a atualização e as tags de uso', () => {
  const x = forum()
  const pag = x.ok(x.dono, 'pagina-criar', { nome: 'Página que devolve', descricao: '', tema: 'rovers' }).id
  x.ok(x.dono, 'pagina-gestao', { pagina: pag, alvo: x.mod.uid, acao: 'adicionar-admin' })
  const u = x.ok(x.mod, 'pagina-publicar', { pagina: pag, texto: 'conteúdo legítimo sobre #devolver', tags: ['devolvida'] })
  x.ok(x.dono, 'remocao-por-responsavel', { alvo: u.id, motivo: 'regras' })
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM tags_uso WHERE objeto = :o', { o: u.id }).n, 0)
  const ap = x.ok(x.mod, 'apelacao', { tipo: 'remocao', alvo: u.id, texto: 'Era legítimo.' })
  assert.deepEqual(x.s.apelacoesDoRele({}).itens.map((a) => a.id), [ap.id], 'removido pelo dono da página: a fila é do relé')
  x.s.decidirApelacaoDoRele(ap.id, 'revertida')
  assert.equal(x.s.atualizacoesDa(pag, {}).itens.length, 1)
  assert.deepEqual(x.m.armazem.todos('SELECT tag FROM tags_uso WHERE objeto = :o ORDER BY tag', { o: u.id }).map((l) => l.tag), ['devolver', 'devolvida'])
})

test('restaurar só funciona com o envelope ainda retido; sem ele devolve false e não mexe em nada', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c, { titulo: 'Restauração', tags: ['restaurar'] })
  x.ok(x.mod, 'remocao-por-responsavel', { alvo: t, motivo: 'spam' })
  const linha = x.m.armazem.objeto(t)
  assert.equal(x.s.restaurar({ ...linha, envelope: null }), false)
  assert.notEqual(x.m.armazem.objeto(t).oculto_em, null, 'sem envelope nada foi desfeito')
  assert.equal(x.s.restaurar(linha), true)
  assert.equal(x.m.armazem.objeto(t).oculto_em, null)
  assert.equal(x.s.buscar({ q: 'Restauração' }, x.m.relogio.agora).topicos.length, 1)
})

test('apelação: banimento sem ban, de comunidade encerrada ou sem registro, e decisão de apelação que não existe', () => {
  const x = forum()
  assert.equal(x.cod(x.ana, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Nunca fui banida.' }), 'nao_encontrado')
  x.gestao(x.dono, x.c, x.caio, 'banir', 'spam')
  x.m.armazem.executar('DELETE FROM remocoes WHERE acao = :a', { a: 'banimento' })
  assert.equal(x.cod(x.caio, 'apelacao', { tipo: 'banimento', alvo: x.c, texto: 'Sem registro.' }), 'nao_encontrado', 'banido, mas sem registro do banimento')
  const y = forum()
  y.gestao(y.dono, y.c, y.caio, 'banir', 'spam')
  y.ok(y.dono, 'comunidade-posse', { comunidade: y.c, acao: 'encerrar', novoDono: null })
  assert.equal(y.cod(y.caio, 'apelacao', { tipo: 'banimento', alvo: y.c, texto: 'Comunidade encerrada.' }), 'nao_encontrado')
  assert.equal(x.cod(x.dono, 'apelacao-decisao', { apelacao: `ob_${'A'.repeat(43)}`, resultado: 'revertida' }), 'nao_encontrado')
})

test('o autor remover o que um responsável escondeu, ou um resolveu cair, não deixa estado preso', () => {
  const x = forum()
  const t = x.topico(x.ana, x.c)
  const r = x.responde(x.beto, t, 'a resposta')
  x.ok(x.ana, 'topico-resolvido', { topico: t, resposta: r })
  const outro = x.responde(x.caio, t, 'outra resposta')
  x.ok(x.caio, 'remocao-pelo-autor', { alvo: outro })
  assert.equal(x.s.topicoDetalhe(t, {}).resolvido, true, 'apagar OUTRA resposta não derruba o "resolveu"')
  x.ok(x.beto, 'remocao-pelo-autor', { alvo: r })
  assert.equal(x.s.topicoDetalhe(t, {}).resolvido, false)
})
