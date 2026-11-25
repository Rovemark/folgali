// SPDX-License-Identifier: AGPL-3.0-or-later
// Comunidades: criar, acessos, papéis, convites, expulsão e banimento, posse, e o que cada leitor enxerga.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTRUTURA, RAID } from '../../packages/protocolo/src/index.js'
import { DIA, codigoDe, erroDe, nova } from '../ajuda/rede.js'

const base = () => {
  const x = nova()
  const dono = x.rover()
  const [m1, m2, m3] = [x.rover(), x.rover(), x.rover()]
  return Object.assign(x, { dono, m1, m2, m3 })
}
const avisos = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens.map((n) => n.tipo)

// ---------- criar ----------

test('criar comunidade: o criador vira dono e primeiro membro; o id é o id do objeto; aparece na lista e na leitura', () => {
  const x = base()
  const c = x.ok(x.dono, 'comunidade-criar', { nome: 'Planilhas e prazos', descricao: 'Troca de ideias', regras: 'Sem spam.', tema: 'produtividade', acesso: 'aberta', categorias: ['Dúvidas', 'Dicas'] })
  assert.equal(x.s.papel(c.id, x.dono.uid), 'dono')
  const d = x.s.comunidadeDetalhe(c.id, {})
  assert.equal(d.id, c.id)
  assert.equal(d.nome, 'Planilhas e prazos')
  assert.equal(d.regras, 'Sem spam.')
  assert.deepEqual(d.categorias, ['Dúvidas', 'Dicas'])
  assert.equal(d.membros, 1)
  assert.equal(d.dono.uid, x.dono.uid)
  assert.equal(d.envelope.objeto.id, c.id)
  assert.equal(d.voce, null)
  assert.deepEqual(x.s.comunidadesListadas({}).itens.map((i) => i.id), [c.id])
  assert.equal(x.s.comunidadeDetalhe(c.id, { credencial: x.como(x.dono) }).voce.papel, 'dono')
  assert.deepEqual(x.s.comunidadesDoRover(x.dono.uid, {}).itens.map((i) => [i.comunidade.id, i.papel]), [[c.id, 'dono']])
})

test('nome único entre as listadas (maiúsculas, acentos e pontuação não distinguem); a fechada não reserva nome', () => {
  const x = base()
  x.comunidade(x.dono, { nome: 'Café & Código' })
  assert.equal(x.cod(x.m1, 'comunidade-criar', { nome: 'cafe codigo', descricao: '', regras: '', tema: 'rovers', acesso: 'moderada', categorias: [] }), 'ja_existe')
  assert.equal(x.faz(x.m1, 'comunidade-criar', { nome: 'cafe codigo', descricao: '', regras: '', tema: 'rovers', acesso: 'fechada', categorias: [] }).estado, 'aceito', 'a fechada não colide')
  assert.equal(x.faz(x.m2, 'comunidade-criar', { nome: 'Café & Código Dois', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito')
  x.comunidade(x.m3, { nome: 'Segredo', acesso: 'fechada' })
  assert.equal(x.faz(x.m2, 'comunidade-criar', { nome: 'Segredo', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito', 'o nome de uma fechada não é reservado nem revelado')
})

test('criar: conta com menos de 1 dia é "conta_nova"; no máximo 10 comunidades como dono', () => {
  const y = nova({ novatos: true })
  const novo = y.rover({ novato: true })
  const e = erroDe(() => y.ok(novo, 'comunidade-criar', { nome: 'Minha', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }))
  assert.equal(e.codigo, 'conta_nova')
  assert.equal(e.retryAfterS, DIA)
  y.avancar(DIA)
  assert.equal(y.faz(novo, 'comunidade-criar', { nome: 'Minha', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito')
  const x = nova()
  const a = x.rover()
  for (let i = 0; i < ESTRUTURA.comunidadesComoDono; i++) {
    x.ok(a, 'comunidade-criar', { nome: `Comunidade número ${i}`, descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] })
    x.avancar(3600 * 8)
  }
  assert.equal(x.cod(a, 'comunidade-criar', { nome: 'A de número onze', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'limite_de_estrutura')
})

test('criar exige aprovação humana a cada uso e nunca vai por autorização permanente', () => {
  const x = base()
  assert.equal(x.cod(x.dono, 'comunidade-criar', { nome: 'Sem aprovação', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }, { aprovada: false }), 'sem_aprovacao')
})

// ---------- acessos e entrada ----------

test('aberta: entrar vira membro na hora; entrar de novo é "ja_existe"; sair desfaz; o dono não sai', () => {
  const x = base()
  const c = x.comunidade(x.dono)
  assert.equal(x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'membro')
  assert.equal(x.s.papel(c, x.m1.uid), 'membro')
  assert.equal(x.cod(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }), 'ja_existe')
  assert.equal(x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'sair' }).resultado, 'fora')
  assert.equal(x.s.papel(c, x.m1.uid), null)
  assert.equal(x.cod(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'sair' }), 'nao_e_membro')
  assert.equal(x.cod(x.dono, 'comunidade-adesao', { comunidade: c, acao: 'sair' }), 'sem_permissao')
  assert.equal(x.cod(x.m1, 'comunidade-adesao', { comunidade: `ob_${'A'.repeat(43)}`, acao: 'entrar' }), 'nao_encontrado')
})

test('moderada: entrar é um pedido; o moderador aprova ou recusa; o pedido pode ser cancelado; avisos saem', () => {
  const x = base()
  const c = x.comunidade(x.dono, { acesso: 'moderada' })
  assert.equal(x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'pendente')
  assert.equal(x.s.papel(c, x.m1.uid), null)
  assert.equal(x.cod(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }), 'ja_existe')
  assert.deepEqual(avisos(x, x.dono), ['pedido-de-entrada'])
  assert.deepEqual(x.s.pedidosDe(c, { credencial: x.como(x.dono) }).itens.map((i) => i.rover.uid), [x.m1.uid])
  assert.equal(x.gestao(x.dono, c, x.m1, 'aprovar-pedido').resultado, 'membro')
  assert.equal(x.s.papel(c, x.m1.uid), 'membro')
  assert.deepEqual(avisos(x, x.m1), ['entrada-aprovada'])
  x.ok(x.m2, 'comunidade-adesao', { comunidade: c, acao: 'entrar' })
  assert.equal(x.gestao(x.dono, c, x.m2, 'recusar-pedido').resultado, 'fora')
  assert.equal(x.s.papel(c, x.m2.uid), null)
  x.ok(x.m3, 'comunidade-adesao', { comunidade: c, acao: 'entrar' })
  assert.equal(x.ok(x.m3, 'comunidade-adesao', { comunidade: c, acao: 'cancelar-pedido' }).resultado, 'fora')
  assert.equal(x.cod(x.m3, 'comunidade-adesao', { comunidade: c, acao: 'cancelar-pedido' }), 'nao_encontrado')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m3.uid, acao: 'aprovar-pedido', motivo: null }), 'nao_encontrado')
})

test('fechada: não se entra sem convite (404, como se não existisse); com convite, aceitar entra; recusar não', () => {
  const x = base()
  const c = x.comunidade(x.dono, { acesso: 'fechada' })
  assert.equal(x.cod(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }), 'nao_encontrado')
  assert.equal(x.cod(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' }), 'nao_encontrado')
  assert.equal(x.gestao(x.dono, c, x.m1, 'convidar').estado, 'aceito')
  assert.deepEqual(avisos(x, x.m1), ['convite-comunidade'])
  assert.deepEqual(x.s.convitesDoRover(x.m1.uid, x.como(x.m1)).itens.map((i) => [i.comunidade.id, i.comunidade.nome, i.por.uid]), [[c, x.s.comunidade(c).nome, x.dono.uid]])
  assert.equal(x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' }).resultado, 'membro')
  assert.equal(x.s.papel(c, x.m1.uid), 'membro')
  assert.equal(x.cod(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' }), 'nao_encontrado', 'o convite foi gasto')
  x.gestao(x.dono, c, x.m2, 'convidar')
  assert.equal(x.ok(x.m2, 'comunidade-adesao', { comunidade: c, acao: 'recusar-convite' }).resultado, 'fora')
  assert.equal(x.s.papel(c, x.m2.uid), null)
  assert.equal(x.cod(x.m2, 'comunidade-adesao', { comunidade: c, acao: 'recusar-convite' }), 'nao_encontrado')
})

test('convidar: só moderador e dono; não convida membro, banido nem quem já tem convite; cancelar-convite; tetos', () => {
  const x = base()
  const c = x.comunidade(x.dono, { acesso: 'moderada' })
  x.entra(x.m1, c, { esperar: false }) // pedido
  x.gestao(x.dono, c, x.m1, 'aprovar-pedido')
  assert.equal(x.cod(x.m1, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'convidar', motivo: null }), 'sem_permissao', 'membro comum não convida')
  assert.equal(x.cod(x.m2, 'comunidade-gestao', { comunidade: c, alvo: x.m3.uid, acao: 'convidar', motivo: null }), 'nao_e_membro', 'quem não é membro de comunidade pública não age')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m1.uid, acao: 'convidar', motivo: null }), 'ja_existe', 'já é membro')
  x.gestao(x.dono, c, x.m2, 'convidar')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'convidar', motivo: null }), 'ja_existe', 'convite repetido')
  x.gestao(x.dono, c, x.m2, 'cancelar-convite')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'cancelar-convite', motivo: null }), 'nao_encontrado')
  x.gestao(x.dono, c, x.m3, 'banir', 'spam')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m3.uid, acao: 'convidar', motivo: null }), 'banido')
  const y = base()
  const cy = y.comunidade(y.dono)
  for (let i = 0; i < ESTRUTURA.convitesPorComunidade; i++) y.m.armazem.executar('INSERT INTO convites (comunidade, uid, por, em) VALUES (:c, :u, :p, 1)', { c: cy, u: `rvr_${String(i).padStart(22, 'c')}`, p: y.dono.uid })
  assert.equal(y.cod(y.dono, 'comunidade-gestao', { comunidade: cy, alvo: y.m1.uid, acao: 'convidar', motivo: null }), 'limite_de_estrutura', '100 por comunidade')
  const z = base()
  const cz = z.comunidade(z.dono)
  for (let i = 0; i < ESTRUTURA.convitesRecebidos; i++) z.m.armazem.executar('INSERT INTO convites (comunidade, uid, por, em) VALUES (:c, :u, :p, 1)', { c: `ob_${String(i).padStart(43, 'k')}`, u: z.m1.uid, p: z.dono.uid })
  assert.equal(z.cod(z.dono, 'comunidade-gestao', { comunidade: cz, alvo: z.m1.uid, acao: 'convidar', motivo: null }), 'limite_de_estrutura', '50 por convidado')
})

test('modo anti-raid: passando de 30 entradas na última hora, a entrada em comunidade aberta vira pedido', () => {
  const x = nova()
  const dono = x.rover()
  const c = x.comunidade(dono)
  for (let i = 0; i < RAID.entradasPorHora; i++) assert.equal(x.ok(x.rover(), 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'membro', `entrada ${i + 1}`)
  const tarde = x.rover()
  assert.equal(x.ok(tarde, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'pendente', 'a 31ª espera aprovação')
  assert.equal(x.s.papel(c, tarde.uid), null)
  assert.deepEqual(avisos(x, dono), ['pedido-de-entrada'])
  x.avancar(3601)
  assert.equal(x.ok(x.rover(), 'comunidade-adesao', { comunidade: c, acao: 'entrar' }).resultado, 'membro', 'passada a hora, volta ao normal')
  assert.equal(x.gestao(dono, c, tarde, 'aprovar-pedido').resultado, 'membro')
})

test('limites de participação: 200 comunidades por rover, 20 pedidos pendentes por rover, 500 por comunidade', () => {
  const x = base()
  const c = x.comunidade(x.dono)
  for (let i = 0; i < ESTRUTURA.comunidadesComoMembro; i++) x.m.armazem.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'membro', 1)", { c: `ob_${String(i).padStart(43, 'm')}`, u: x.m1.uid })
  assert.equal(x.cod(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'entrar' }), 'limite_de_estrutura')
  assert.equal(x.cod(x.m1, 'comunidade-criar', { nome: 'Mais uma', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'limite_de_estrutura')
  const y = base()
  const cm = y.comunidade(y.dono, { acesso: 'moderada' })
  for (let i = 0; i < ESTRUTURA.pedidosDeEntradaPorRover; i++) y.m.armazem.executar('INSERT INTO pedidos_de_entrada (comunidade, uid, em) VALUES (:c, :u, 1)', { c: `ob_${String(i).padStart(43, 'p')}`, u: y.m1.uid })
  assert.equal(y.cod(y.m1, 'comunidade-adesao', { comunidade: cm, acao: 'entrar' }), 'limite_de_estrutura')
  for (let i = 0; i < ESTRUTURA.pedidosDeEntradaPorComunidade; i++) y.m.armazem.executar('INSERT INTO pedidos_de_entrada (comunidade, uid, em) VALUES (:c, :u, 1)', { c: cm, u: `rvr_${String(i).padStart(22, 'p')}` })
  assert.equal(y.cod(y.m2, 'comunidade-adesao', { comunidade: cm, acao: 'entrar' }), 'limite_de_estrutura')
})

// ---------- papéis ----------

function comMods() {
  const x = base()
  const c = x.comunidade(x.dono)
  for (const r of [x.m1, x.m2, x.m3]) { x.entra(r, c, { esperar: false }); x.avancar(1) } // entram em instantes diferentes: "o mais antigo" é bem definido
  x.gestao(x.dono, c, x.m1, 'promover')
  x.gestao(x.dono, c, x.m2, 'promover')
  return Object.assign(x, { c, mod1: x.m1, mod2: x.m2, membro: x.m3 })
}

test('promover e rebaixar: só o dono; só quem é membro; moderador não promove; teto de 10 moderadores', () => {
  const x = base()
  const c = x.comunidade(x.dono)
  x.entra(x.m1, c, { esperar: false })
  x.entra(x.m2, c, { esperar: false })
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m3.uid, acao: 'promover', motivo: null }), 'nao_encontrado', 'quem não é membro')
  x.gestao(x.dono, c, x.m1, 'promover')
  assert.equal(x.s.papel(c, x.m1.uid), 'moderador')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m1.uid, acao: 'promover', motivo: null }), 'ja_existe')
  assert.equal(x.cod(x.m1, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'promover', motivo: null }), 'sem_permissao', 'moderador não promove')
  assert.equal(x.cod(x.m1, 'comunidade-gestao', { comunidade: c, alvo: x.m1.uid, acao: 'rebaixar', motivo: null }), 'esquema', 'ninguém age sobre si')
  assert.equal(x.cod(x.m1, 'comunidade-gestao', { comunidade: c, alvo: x.dono.uid, acao: 'rebaixar', motivo: null }), 'sem_permissao')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'rebaixar', motivo: null }), 'ja_existe', 'já é membro comum')
  x.gestao(x.dono, c, x.m1, 'rebaixar')
  assert.equal(x.s.papel(c, x.m1.uid), 'membro')
  for (let i = 0; i < ESTRUTURA.moderadoresPorComunidade; i++) x.m.armazem.executar("INSERT INTO membros (comunidade, uid, papel, desde) VALUES (:c, :u, 'moderador', 1)", { c, u: `rvr_${String(i).padStart(22, 'd')}` })
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: c, alvo: x.m2.uid, acao: 'promover', motivo: null }), 'limite_de_estrutura')
})

test('expulsar: moderador expulsa só membro comum; dono expulsa moderador; ninguém expulsa o dono; o expulso pode voltar na aberta', () => {
  const x = comMods()
  assert.equal(x.cod(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod2.uid, acao: 'expulsar', motivo: 'regras' }), 'sem_permissao', 'moderador não expulsa moderador')
  assert.equal(x.cod(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.dono.uid, acao: 'expulsar', motivo: 'regras' }), 'sem_permissao')
  assert.equal(x.cod(x.membro, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod2.uid, acao: 'expulsar', motivo: 'regras' }), 'sem_permissao', 'membro comum')
  assert.equal(x.gestao(x.mod1, x.c, x.membro, 'expulsar', 'fora-do-tema').resultado, 'fora')
  assert.equal(x.s.papel(x.c, x.membro.uid), null)
  assert.deepEqual(avisos(x, x.membro).slice(0, 1), ['expulso'])
  assert.equal(x.s.listar(x.membro.uid, { limite: 5 }, x.m.relogio.agora).itens[0].origem, null, 'quem expulsou não aparece')
  assert.equal(x.gestao(x.dono, x.c, x.mod2, 'expulsar', 'assedio').resultado, 'fora')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod2.uid, acao: 'expulsar', motivo: 'spam' }), 'nao_encontrado', 'já saiu')
  assert.equal(x.ok(x.membro, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }).resultado, 'membro', 'expulso pode voltar')
  const reg = x.s.registroDaComunidade(x.c, {}).itens
  assert.deepEqual(reg.map((r) => [r.acao, r.motivo, r.por]), [['expulsao', 'assedio', 'dono'], ['expulsao', 'fora-do-tema', 'moderador']])
  assert.equal(reg[0].alvo.uid, x.mod2.uid)
})

test('banir: remove, impede de voltar por qualquer caminho e entra no registro público com o papel de quem baniu', () => {
  const x = comMods()
  assert.equal(x.cod(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod2.uid, acao: 'banir', motivo: 'spam' }), 'sem_permissao', 'moderador não bane moderador')
  assert.equal(x.cod(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.dono.uid, acao: 'banir', motivo: 'spam' }), 'sem_permissao')
  x.gestao(x.mod1, x.c, x.membro, 'banir', 'assedio')
  assert.equal(x.s.papel(x.c, x.membro.uid), null)
  assert.equal(x.cod(x.mod1, 'comunidade-gestao', { comunidade: x.c, alvo: x.membro.uid, acao: 'banir', motivo: 'assedio' }), 'ja_existe')
  assert.deepEqual(avisos(x, x.membro).slice(0, 1), ['banido'])
  // volta por outra rota: entrar, pedido, convite, aceitar-convite
  assert.equal(x.cod(x.membro, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }), 'banido')
  x.avancar(3601) // a criação de comunidade tem teto por hora
  const moderada = x.comunidade(x.dono, { acesso: 'moderada' })
  x.entra(x.membro, moderada, { esperar: false })
  x.gestao(x.dono, moderada, x.membro, 'banir', 'spam')
  assert.equal(x.cod(x.membro, 'comunidade-adesao', { comunidade: moderada, acao: 'entrar' }), 'banido', 'pedido em moderada')
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM pedidos_de_entrada WHERE uid = :u', { u: x.membro.uid }).n, 0, 'o banimento apagou o pedido pendente')
  x.avancar(3601)
  const fechada = x.comunidade(x.dono, { acesso: 'fechada' })
  x.gestao(x.dono, fechada, x.membro, 'convidar')
  x.gestao(x.dono, fechada, x.membro, 'banir', 'spam')
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM convites WHERE uid = :u', { u: x.membro.uid }).n, 0, 'o banimento apagou o convite')
  assert.equal(x.cod(x.membro, 'comunidade-adesao', { comunidade: fechada, acao: 'aceitar-convite' }), 'nao_encontrado')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: fechada, alvo: x.membro.uid, acao: 'convidar', motivo: null }), 'banido')
  assert.deepEqual(x.s.registroDaComunidade(x.c, {}).itens.map((r) => [r.acao, r.motivo, r.por, r.alvo.uid]), [['banimento', 'assedio', 'moderador', x.membro.uid]])
  assert.deepEqual(x.s.banidosDa(x.c, { credencial: x.como(x.mod1) }).itens.map((b) => [b.rover.uid, b.motivo, b.por]), [[x.membro.uid, 'assedio', 'moderador']])
  x.gestao(x.dono, x.c, x.membro, 'desbanir')
  assert.equal(x.ok(x.membro, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }).resultado, 'membro')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: x.c, alvo: x.m1.uid, acao: 'desbanir', motivo: null }), 'nao_encontrado')
})

test('banir quem nunca foi membro vale (o banido não entra), e quem é banido não age em comunidade nenhuma que o baniu', () => {
  const x = comMods()
  const estranho = x.rover()
  x.gestao(x.mod1, x.c, estranho, 'banir', 'spam')
  assert.equal(x.cod(estranho, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }), 'banido')
  assert.equal(x.cod(estranho, 'topico', { comunidade: x.c, categoria: null, titulo: 'Quero postar', texto: 'oi pessoal', tags: [], enquete: null }), 'banido')
})

test('moderador de uma comunidade não age em outra: sem papel, "nao_e_membro" (pública) ou "nao_encontrado" (fechada)', () => {
  const x = comMods()
  const outra = x.comunidade(x.m3, { acesso: 'aberta' })
  const fechada = x.comunidade(x.m3, { acesso: 'fechada' })
  assert.equal(x.cod(x.mod1, 'comunidade-gestao', { comunidade: outra, alvo: x.dono.uid, acao: 'banir', motivo: 'spam' }), 'nao_e_membro')
  assert.equal(x.cod(x.mod1, 'comunidade-gestao', { comunidade: fechada, alvo: x.dono.uid, acao: 'banir', motivo: 'spam' }), 'nao_encontrado')
  assert.equal(x.cod(x.mod1, 'comunidade-atualizar', { comunidade: outra, nome: 'Tomada', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'nao_e_membro')
  assert.equal(x.cod(x.mod1, 'comunidade-posse', { comunidade: x.c, acao: 'encerrar', novoDono: null }), 'sem_permissao', 'moderador não encerra a própria')
})

test('um rover não age sobre o dono, nem o moderador se faz de dono: posse, acesso e atualização', () => {
  const x = comMods()
  assert.equal(x.cod(x.mod1, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.mod1.uid }), 'esquema')
  assert.equal(x.cod(x.mod1, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.mod2.uid }), 'sem_permissao')
  assert.equal(x.cod(x.mod1, 'comunidade-atualizar', { comunidade: x.c, nome: x.s.comunidade(x.c).nome, descricao: 'nova', regras: 'novas', tema: 'rovers', acesso: 'fechada', categorias: [] }), 'sem_permissao', 'moderador não muda o acesso')
  assert.equal(x.faz(x.mod1, 'comunidade-atualizar', { comunidade: x.c, nome: x.s.comunidade(x.c).nome, descricao: 'nova', regras: 'novas', tema: 'rovers', acesso: 'aberta', categorias: ['Geral'] }).estado, 'aceito', 'mas muda o resto')
  assert.equal(x.cod(x.membro, 'comunidade-atualizar', { comunidade: x.c, nome: 'Nome novo', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'sem_permissao')
})

// ---------- posse ----------

test('transferir a posse: o novo dono é membro; o antigo vira moderador; aviso de posse; o antigo perde o poder do dono', () => {
  const x = comMods()
  assert.equal(x.cod(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.rover().uid }), 'nao_encontrado', 'quem não é membro')
  x.ok(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.mod1.uid })
  assert.equal(x.s.papel(x.c, x.mod1.uid), 'dono')
  assert.equal(x.s.papel(x.c, x.dono.uid), 'moderador')
  assert.equal(x.s.comunidade(x.c).dono, x.mod1.uid)
  assert.deepEqual(avisos(x, x.mod1).slice(0, 1), ['posse-recebida'])
  assert.equal(x.cod(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'encerrar', novoDono: null }), 'sem_permissao')
  assert.equal(x.cod(x.dono, 'comunidade-gestao', { comunidade: x.c, alvo: x.mod1.uid, acao: 'banir', motivo: 'spam' }), 'sem_permissao')
  assert.equal(x.s.comunidadeDetalhe(x.c, {}).dono.uid, x.mod1.uid)
})

test('a posse exige aprovação humana: sem ela, "sem_aprovacao"', () => {
  const x = comMods()
  assert.equal(x.cod(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'transferir', novoDono: x.mod1.uid }, { aprovada: false }), 'sem_aprovacao')
})

test('encerrar: a comunidade some de lista, detalhe, tópicos, busca e perfil; o conteúdo fica oculto; nada volta', () => {
  const x = comMods()
  const t = x.topico(x.mod1, x.c, { titulo: 'Tópico que vai embora' })
  x.ok(x.dono, 'comunidade-posse', { comunidade: x.c, acao: 'encerrar', novoDono: null })
  assert.deepEqual(x.s.comunidadesListadas({}).itens, [])
  assert.equal(codigoDe(() => x.s.comunidadeDetalhe(x.c, {})), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.topicosDa(x.c, {})), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.topicoDetalhe(t, {})), 'nao_encontrado')
  assert.equal(codigoDe(() => x.rele.objeto(t)), 'nao_encontrado')
  assert.deepEqual(x.s.comunidadesDoRover(x.dono.uid, {}).itens, [])
  assert.equal(x.s.buscar({ q: 'Tópico' }, x.m.relogio.agora).topicos.length, 0)
  assert.equal(x.cod(x.m3, 'comunidade-adesao', { comunidade: x.c, acao: 'entrar' }), 'nao_encontrado')
  assert.notEqual(x.m.armazem.objeto(t).oculto_em, null)
  x.avancar(31 * DIA)
  x.rele.limpar()
  assert.equal(x.m.armazem.objeto(t).envelope, null, 'passados 30 dias o envelope é apagado')
})

test('o dono sai da rede: a posse vai para o moderador mais antigo, depois o membro mais antigo; sem ninguém, encerra', () => {
  const x = comMods()
  x.ok(x.dono, 'remocao-pelo-autor', { alvo: x.rele.perfil(x.dono.uid).perfil.id })
  assert.equal(x.s.papel(x.c, x.m1.uid), 'dono', 'o moderador mais antigo (entrou primeiro)')
  assert.equal(x.s.comunidade(x.c).dono, x.m1.uid)
  assert.deepEqual(avisos(x, x.m1).slice(0, 1), ['posse-recebida'])
  const so = x.rover()
  const ca = x.comunidade(so)
  x.ok(so, 'remocao-pelo-autor', { alvo: x.rele.perfil(so.uid).perfil.id })
  assert.equal(x.s.comunidade(ca), null, 'sem herdeiro, encerra')
})

// ---------- atualizar ----------

test('atualizar: troca o estado todo; categorias que saem não apagam o histórico; virar fechada tira da lista na hora', () => {
  const x = comMods()
  const antes = x.s.comunidade(x.c)
  x.ok(x.mod1, 'comunidade-atualizar', { comunidade: x.c, nome: antes.nome, descricao: 'Nova descrição', regras: 'Regras novas', tema: 'planilhas', acesso: 'aberta', categorias: ['Geral'] })
  const d = x.s.comunidadeDetalhe(x.c, {})
  assert.deepEqual([d.descricao, d.regras, d.tema, d.categorias], ['Nova descrição', 'Regras novas', 'planilhas', ['Geral']])
  assert.notEqual(d.envelope.objeto.id, x.c, 'o envelope servido é o da versão atual')
  assert.equal(d.envelope.objeto.tipo, 'comunidade-atualizar')
  assert.equal(x.s.comunidadesListadas({ tema: 'planilhas' }).itens.length, 1)
  assert.equal(x.s.comunidadesListadas({ tema: 'rovers' }).itens.length, 0)
  x.ok(x.dono, 'comunidade-atualizar', { comunidade: x.c, nome: antes.nome, descricao: 'x', regras: 'y', tema: 'planilhas', acesso: 'fechada', categorias: [] })
  assert.deepEqual(x.s.comunidadesListadas({}).itens, [])
  assert.equal(codigoDe(() => x.s.comunidadeDetalhe(x.c, {})), 'nao_encontrado')
  assert.equal(x.s.comunidadeDetalhe(x.c, { credencial: x.como(x.membro) }).acesso, 'fechada')
})

test('atualizar: o nome continua único entre as listadas, inclusive ao deixar de ser fechada', () => {
  const x = base()
  x.comunidade(x.dono, { nome: 'Nome disputado' })
  const f = x.comunidade(x.m1, { nome: 'Nome disputado', acesso: 'fechada' })
  assert.equal(x.cod(x.m1, 'comunidade-atualizar', { comunidade: f, nome: 'Nome disputado', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'ja_existe')
  const outra = x.comunidade(x.m2, { nome: 'Outro nome' })
  assert.equal(x.cod(x.m2, 'comunidade-atualizar', { comunidade: outra, nome: 'nome disputado', descricao: '', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }), 'ja_existe')
  assert.equal(x.faz(x.m2, 'comunidade-atualizar', { comunidade: outra, nome: 'Outro nome', descricao: 'mudei só a descrição', regras: '', tema: 'rovers', acesso: 'aberta', categorias: [] }).estado, 'aceito', 'manter o próprio nome vale')
})

// ---------- leitura ----------

test('lista de comunidades: só as listadas, filtros por tema e acesso, ordens por criação e por atividade, cursor sem repetir', () => {
  const x = base()
  const ids = []
  for (let i = 0; i < 4; i++) { ids.push(x.comunidade(x.rover(), { tema: i % 2 ? 'a-um' : 'b-dois', acesso: i === 3 ? 'moderada' : 'aberta' })); x.avancar(1) }
  x.comunidade(x.rover(), { acesso: 'fechada' })
  assert.deepEqual(x.s.comunidadesListadas({}).itens.map((i) => i.id), [...ids].reverse())
  assert.deepEqual(x.s.comunidadesListadas({ tema: 'a-um' }).itens.map((i) => i.id), [ids[3], ids[1]])
  assert.deepEqual(x.s.comunidadesListadas({ acesso: 'moderada' }).itens.map((i) => i.id), [ids[3]])
  assert.equal(codigoDe(() => x.s.comunidadesListadas({ acesso: 'fechada' })), 'esquema', 'a fechada nem é filtro')
  assert.equal(codigoDe(() => x.s.comunidadesListadas({ ordem: 'popular' })), 'esquema')
  const p1 = x.s.comunidadesListadas({ limite: 3 })
  const p2 = x.s.comunidadesListadas({ limite: 3, antes: p1.proximo })
  assert.deepEqual([...p1.itens, ...p2.itens].map((i) => i.id), [...ids].reverse())
  assert.equal(p2.proximo, null)
})

test('detalhe: o convidado de uma fechada lê o cartão mínimo; o membro, tudo; um estranho, 404', () => {
  const x = base()
  const c = x.comunidade(x.dono, { acesso: 'fechada', descricao: 'Só para quem sabe' })
  assert.equal(codigoDe(() => x.s.comunidadeDetalhe(c, {})), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.comunidadeDetalhe(c, { credencial: x.como(x.m1) })), 'nao_encontrado')
  x.gestao(x.dono, c, x.m1, 'convidar')
  const minimo = x.s.comunidadeDetalhe(c, { credencial: x.como(x.m1) })
  assert.deepEqual(Object.keys(minimo).sort(), ['acesso', 'descricao', 'id', 'nome', 'voce'])
  assert.equal(minimo.voce.convidado, true)
  assert.equal(codigoDe(() => x.s.membrosDa(c, { credencial: x.como(x.m1) })), 'nao_encontrado', 'o convidado ainda não lê os membros')
  assert.equal(codigoDe(() => x.s.topicosDa(c, { credencial: x.como(x.m1) })), 'nao_encontrado')
  x.ok(x.m1, 'comunidade-adesao', { comunidade: c, acao: 'aceitar-convite' })
  assert.equal(x.s.comunidadeDetalhe(c, { credencial: x.como(x.m1) }).regras, 'Seja gentil.')
})

test('membros: donos e moderadores primeiro; quem fechou o grafo só aparece para moderador e para si; o cartão conta todos', () => {
  const x = base()
  const fechado = x.rover({ grafo: 'privado' })
  const c = x.comunidade(x.dono)
  for (const r of [x.m1, x.m2, fechado]) x.entra(r, c, { esperar: false })
  x.gestao(x.dono, c, x.m2, 'promover')
  const lista = (cred) => x.s.membrosDa(c, { credencial: cred }).itens.map((i) => [i.rover.uid, i.papel])
  assert.deepEqual(lista(null), [[x.dono.uid, 'dono'], [x.m2.uid, 'moderador'], [x.m1.uid, 'membro']], 'o fechado fica de fora')
  assert.deepEqual(lista(x.como(x.m1)).length, 3)
  assert.equal(lista(x.como(fechado)).some(([u]) => u === fechado.uid), true, 'ele se vê')
  assert.equal(lista(x.como(x.m2)).length, 4, 'moderador vê todos')
  assert.equal(lista(x.como(x.dono)).length, 4)
  assert.equal(x.s.comunidadeDetalhe(c, {}).membros, 4, 'o cartão conta todos')
  const p1 = x.s.membrosDa(c, { limite: 2, credencial: x.como(x.dono) })
  const p2 = x.s.membrosDa(c, { limite: 2, antes: p1.proximo, credencial: x.como(x.dono) })
  assert.equal([...p1.itens, ...p2.itens].length, 4)
  assert.equal(p2.proximo, null)
})

test('rover com grafo fechado: suas comunidades somem do perfil dele para os outros e as fechadas só aparecem para ele', () => {
  const x = base()
  const aberta = x.comunidade(x.dono)
  const fechada = x.comunidade(x.dono, { acesso: 'fechada' })
  x.entra(x.m1, aberta, { esperar: false })
  x.gestao(x.dono, fechada, x.m1, 'convidar')
  x.ok(x.m1, 'comunidade-adesao', { comunidade: fechada, acao: 'aceitar-convite' })
  assert.deepEqual(x.s.comunidadesDoRover(x.m1.uid, { credencial: null }).itens.map((i) => i.comunidade.id), [aberta], 'a fechada não aparece para estranhos')
  assert.deepEqual(x.s.comunidadesDoRover(x.m1.uid, { credencial: x.como(x.m2) }).itens.map((i) => i.comunidade.id), [aberta])
  assert.deepEqual(x.s.comunidadesDoRover(x.m1.uid, { credencial: x.como(x.m1) }).itens.map((i) => i.comunidade.id).sort(), [aberta, fechada].sort())
  assert.equal(x.s.paginaDoRover(x.m1.uid, {}).contagens.comunidades, 1)
  assert.equal(x.s.paginaDoRover(x.m1.uid, { credencial: x.como(x.m1) }).contagens.comunidades, 2)
  const fechado = x.rover({ grafo: 'privado' })
  x.entra(fechado, aberta, { esperar: false })
  assert.equal(codigoDe(() => x.s.comunidadesDoRover(fechado.uid, { credencial: null })), 'grafo_privado')
  assert.equal(x.s.comunidadesDoRover(fechado.uid, { credencial: x.como(fechado) }).itens.length, 1)
})

test('pedidos, convites e banidos: só moderador e dono leem; membro, estranho e anônimo não', () => {
  const x = comMods()
  for (const rota of ['pedidosDe', 'convitesDa', 'banidosDa']) {
    assert.equal(codigoDe(() => x.s[rota](x.c, { credencial: x.como(x.membro) })), 'sem_permissao', `${rota} membro`)
    assert.equal(codigoDe(() => x.s[rota](x.c, { credencial: x.como(x.rover()) })), 'sem_permissao', `${rota} estranho em comunidade pública`)
    assert.equal(codigoDe(() => x.s[rota](x.c, { credencial: null })), 'leitura_nao_autorizada', `${rota} anônimo`)
    assert.equal(x.s[rota](x.c, { credencial: x.como(x.mod1) }).itens.length, 0, `${rota} moderador`)
  }
  const f = x.comunidade(x.dono, { acesso: 'fechada' })
  for (const rota of ['pedidosDe', 'convitesDa', 'banidosDa']) {
    assert.equal(codigoDe(() => x.s[rota](f, { credencial: x.como(x.rover()) })), 'nao_encontrado', `${rota} fechada: estranho`)
    assert.equal(codigoDe(() => x.s[rota](f, { credencial: null })), 'nao_encontrado', `${rota} fechada: anônimo`)
  }
})
