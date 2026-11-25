// SPDX-License-Identifier: AGPL-3.0-or-later
// Os ajudantes da camada social que todas as rotas usam: quem é visível, idade da conta, papéis e o par de amizade.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PAPEIS, parDe } from '../../packages/rele/src/social-base.js'
import { codigoDe, nova } from '../ajuda/rede.js'

test('o par de amizade é o mesmo nos dois sentidos e distingue pares diferentes', () => {
  assert.equal(parDe('rvr_a', 'rvr_b'), 'rvr_a|rvr_b')
  assert.equal(parDe('rvr_b', 'rvr_a'), 'rvr_a|rvr_b')
  assert.notEqual(parDe('rvr_a', 'rvr_b'), parDe('rvr_a', 'rvr_c'))
})

test('papéis em ordem: membro abaixo de moderador abaixo de dono', () => {
  const ordem = (p) => PAPEIS.indexOf(p)
  assert.ok(ordem('membro') >= 0)
  assert.ok(ordem('membro') < ordem('moderador'))
  assert.ok(ordem('moderador') < ordem('dono'))
  assert.equal(PAPEIS.length, 3)
})

test('resumo: rover conhecido traz handle, nome e retrato; desconhecido e rover que saiu vêm sem nada, só com o uid', () => {
  const x = nova()
  const a = x.rover({ handle: 'resumo.ana', perfil: { retrato: { corpo: 'redondo', cor: 'azul', veste: null, acessorio: null } } })
  assert.deepEqual(x.s.resumo(a.uid), { uid: a.uid, handle: 'resumo.ana', nome: 'Pipa', retrato: { corpo: 'redondo', cor: 'azul', veste: null, acessorio: null } })
  const semRetrato = x.rover()
  assert.equal(x.s.resumo(semRetrato.uid).retrato, null)
  const desconhecido = `rvr_${'Z'.repeat(22)}`
  assert.deepEqual(x.s.resumo(desconhecido), { uid: desconhecido, handle: null, nome: null, retrato: null })
  x.ok(a, 'remocao-pelo-autor', { alvo: x.rele.perfil(a.uid).perfil.id })
  assert.deepEqual(x.s.resumo(a.uid), { uid: a.uid, handle: null, nome: null, retrato: null })
})

test('idade da conta: segundos desde o primeiro objeto visto; conta desconhecida vale 0; relógio atrasado não dá idade negativa', () => {
  const x = nova({ novatos: true })
  const a = x.rover({ novato: true })
  const agora = x.m.relogio.agora
  assert.equal(x.s.idadeDaConta(a.uid, agora), 0)
  assert.equal(x.s.idadeDaConta(a.uid, agora + 100), 100)
  assert.equal(x.s.idadeDaConta(a.uid, agora - 50), 0, 'nunca negativa')
  assert.equal(x.s.idadeDaConta(`rvr_${'Z'.repeat(22)}`, agora), 0)
})

test('exigirRover e exigirPapel: o que não existe ou não se vê é 404; quem não participa de comunidade pública é "nao_e_membro"', () => {
  const x = nova()
  const [dono, membro, fora] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono)
  x.entra(membro, c, { esperar: false })
  const f = x.comunidade(dono, { acesso: 'fechada', nome: 'Fechada de base' })
  const agora = x.m.relogio.agora
  assert.equal(x.s.exigirRover(dono.uid, agora).uid, dono.uid)
  assert.equal(codigoDe(() => x.s.exigirRover(`rvr_${'Z'.repeat(22)}`, agora)), 'alvo_desconhecido')
  assert.equal(x.s.exigirPapel(c, membro.uid, 'membro').papel, 'membro')
  assert.equal(x.s.exigirPapel(c, dono.uid, 'dono').papel, 'dono')
  assert.equal(codigoDe(() => x.s.exigirPapel(c, membro.uid, 'moderador')), 'sem_permissao')
  assert.equal(codigoDe(() => x.s.exigirPapel(c, membro.uid, 'dono')), 'sem_permissao')
  assert.equal(codigoDe(() => x.s.exigirPapel(c, fora.uid, 'membro')), 'nao_e_membro')
  assert.equal(codigoDe(() => x.s.exigirPapel(f, fora.uid, 'membro')), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.exigirPapel(`ob_${'A'.repeat(43)}`, fora.uid, 'membro')), 'nao_encontrado')
  x.gestao(dono, c, fora, 'banir', 'spam')
  assert.equal(codigoDe(() => x.s.exigirPapel(c, fora.uid, 'membro')), 'banido')
})

test('responsáveis: o dono e até 20 moderadores, o dono primeiro', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  const mods = Array.from({ length: 22 }, () => x.rover())
  for (const m of mods) { x.m.armazem.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'moderador', :d)", { c, u: m.uid, d: x.m.relogio.agora + 1 }) }
  x.m.armazem.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'membro', 1)", { c, u: `rvr_${'q'.repeat(22)}` })
  const r = x.s.responsaveis(c)
  assert.equal(r.length, 21, 'o dono mais 20 moderadores')
  assert.equal(r[0], dono.uid)
  assert.ok(!r.includes(`rvr_${'q'.repeat(22)}`), 'membro comum não é responsável')
  assert.deepEqual(x.s.responsaveis(`ob_${'A'.repeat(43)}`), [])
})

test('papel numa página: dono, administrador ou ninguém; sem uid não há papel', () => {
  const x = nova()
  const [dono, adm, outro] = [x.rover(), x.rover(), x.rover()]
  const p = x.ok(dono, 'pagina-criar', { nome: 'Página de base', descricao: '', tema: 'rovers' }).id
  x.ok(dono, 'pagina-gestao', { pagina: p, alvo: adm.uid, acao: 'adicionar-admin' })
  assert.equal(x.s.papelNaPagina(p, dono.uid), 'dono')
  assert.equal(x.s.papelNaPagina(p, adm.uid), 'administrador')
  assert.equal(x.s.papelNaPagina(p, outro.uid), null)
  assert.equal(x.s.papelNaPagina(p, null), null)
  assert.equal(x.s.papel(`ob_${'A'.repeat(43)}`, null), null)
  assert.equal(x.s.convidado(p, null), false)
})

test('comunidadeDoCtx: acha a comunidade pelo id dela, pelo id de um tópico dela, e é null para o resto', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  const t = x.topico(dono, c)
  assert.equal(x.s.comunidadeDoCtx(c), c)
  assert.equal(x.s.comunidadeDoCtx(t), c)
  assert.equal(x.s.comunidadeDoCtx(null), null)
  assert.equal(x.s.comunidadeDoCtx(dono.uid), null)
  assert.equal(x.s.comunidadeDoCtx(`ob_${'A'.repeat(43)}`), null)
})

test('comunidade e página: id que não é texto é null; encerrada ou bloqueada pelo relé também', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  const p = x.ok(dono, 'pagina-criar', { nome: 'Página dois', descricao: '', tema: 'rovers' }).id
  assert.equal(x.s.comunidade(undefined), null)
  assert.equal(x.s.comunidade(5), null)
  assert.equal(x.s.pagina(undefined), null)
  assert.equal(x.s.topico(undefined), null)
  assert.equal(x.s.comunidade(c).id, c)
  x.rele.bloquear({ tipo: 'objeto', alvo: c, motivo: 'teste' })
  x.rele.bloquear({ tipo: 'objeto', alvo: p, motivo: 'teste' })
  assert.equal(x.s.comunidade(c), null)
  assert.equal(x.s.pagina(p), null)
})

test('tópico legível: o operador bloquear o tópico ou o autor dele o tira do ar, cada um sozinho; apagado vira 410 só para quem lê a comunidade', () => {
  const x = nova()
  const [dono, autor, leitor] = [x.rover(), x.rover(), x.rover()]
  const c = x.comunidade(dono)
  x.entra(autor, c)
  const t1 = x.topico(autor, c, { titulo: 'Um tópico' })
  const t2 = x.topico(dono, c, { titulo: 'Outro tópico' })
  const agora = x.m.relogio.agora
  assert.equal(x.s.topicoLegivel(t1, null, agora).t.id, t1)
  x.rele.bloquear({ tipo: 'objeto', alvo: t2, motivo: 'teste' })
  assert.equal(codigoDe(() => x.s.topicoLegivel(t2, null, agora)), 'nao_encontrado', 'só o tópico bloqueado')
  assert.equal(x.s.topicoLegivel(t1, null, agora).t.id, t1)
  x.rele.bloquear({ tipo: 'rover', alvo: autor.uid, motivo: 'teste' })
  assert.equal(codigoDe(() => x.s.topicoLegivel(t1, null, agora)), 'nao_encontrado', 'só o autor bloqueado')
  assert.equal(codigoDe(() => x.s.topicoLegivel(`ob_${'A'.repeat(43)}`, leitor.uid, agora)), 'nao_encontrado')
})

test('espaço legível: a resposta de um tópico apagado, escondido ou bloqueado não é legível; o próprio tópico, sim', () => {
  const x = nova()
  const [dono, autor] = [x.rover(), x.rover()]
  const c = x.comunidade(dono)
  x.entra(autor, c)
  const mk = (titulo) => { const t = x.topico(autor, c, { titulo }); const r = x.responde(dono, t, 'resposta'); return { t, r, linha: x.m.armazem.objeto(r), linhaT: x.m.armazem.objeto(t) } }
  const ok = mk('Tópico vivo')
  assert.equal(x.s.espacoLegivel(ok.linha, null), true)
  assert.equal(x.s.espacoLegivel(ok.linhaT, null), true, 'o ctx do tópico é a comunidade: basta ela estar aberta')
  const apagado = mk('Tópico apagado')
  x.ok(autor, 'remocao-pelo-autor', { alvo: apagado.t })
  assert.equal(x.s.espacoLegivel(x.m.armazem.objeto(apagado.r), null), false, 'tópico apagado')
  const escondido = mk('Tópico escondido')
  x.ok(dono, 'remocao-por-responsavel', { alvo: escondido.t, motivo: 'spam' })
  assert.equal(x.s.espacoLegivel(x.m.armazem.objeto(escondido.r), null), false, 'tópico escondido por responsável')
  const bloqueado = mk('Tópico bloqueado')
  x.rele.bloquear({ tipo: 'objeto', alvo: bloqueado.t, motivo: 'teste' })
  assert.equal(x.s.espacoLegivel(x.m.armazem.objeto(bloqueado.r), null), false, 'tópico bloqueado pelo relé')
})

test('espaço legível: página encerrada não é legível, e a atualização de página só vale com a página viva', () => {
  const x = nova()
  const dono = x.rover()
  const p = x.ok(dono, 'pagina-criar', { nome: 'Página legível', descricao: '', tema: 'rovers' }).id
  const u = x.ok(dono, 'pagina-publicar', { pagina: p, texto: 'atualização', tags: [] })
  assert.equal(x.s.espacoLegivel(x.m.armazem.objeto(u.id), null), true)
  x.rele.bloquear({ tipo: 'objeto', alvo: p, motivo: 'teste' })
  assert.equal(x.s.espacoLegivel(x.m.armazem.objeto(u.id), null), false)
})

test('espaço legível: o conteúdo de uma comunidade continua legível depois que quem a criou saiu da rede (a posse passou adiante)', () => {
  const x = nova()
  const [dono, herdeiro] = [x.rover(), x.rover()]
  const c = x.comunidade(dono)
  x.entra(herdeiro, c)
  const t = x.topico(herdeiro, c, { titulo: 'Fica depois da saída' })
  x.ok(dono, 'remocao-pelo-autor', { alvo: x.rele.perfil(dono.uid).perfil.id })
  assert.equal(x.m.armazem.objeto(c).removido_em !== null, true, 'o objeto de criação foi apagado com o perfil do criador')
  assert.equal(x.s.espacoLegivel(x.m.armazem.objeto(t), null), true)
  assert.equal(x.s.topicoDetalhe(t, {}).titulo, 'Fica depois da saída')
})
