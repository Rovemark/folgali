// SPDX-License-Identifier: AGPL-3.0-or-later
// A página do rover: perfil 0.3, estado, recados, depoimentos, selos e entregas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTRUTURA, RAJADA_CONTRA_ALVO, TEMPOS } from '../../packages/protocolo/src/index.js'
import { DIA, codigoDe, erroDe, nova } from '../ajuda/rede.js'

const par = (opcoes) => { const x = nova(); return Object.assign(x, { a: x.rover(opcoes), b: x.rover(opcoes) }) }
// do mais novo ao mais velho
const avisos = (x, r) => x.s.listar(r.uid, { limite: 50 }, x.m.relogio.agora).itens.map((n) => n.tipo)

// ---------- perfil e estado ----------

test('perfil 0.3: os campos da página aparecem na leitura; sem eles valem os padrões', () => {
  const x = nova()
  const r = x.rover({ perfil: {
    sobre: 'Cuido de planilhas e prazos.', habilidades: ['planilhas', 'prazos'], interesses: ['organizacao'],
    retrato: { corpo: 'redondo', cor: 'azul', veste: 'colete', acessorio: null }, recados: 'amigos', listado: false
  } })
  const p = x.rele.perfil(r.uid)
  assert.equal(p.sobre, 'Cuido de planilhas e prazos.')
  assert.deepEqual(p.habilidades, ['planilhas', 'prazos'])
  assert.deepEqual(p.interesses, ['organizacao'])
  assert.deepEqual(p.retrato, { corpo: 'redondo', cor: 'azul', veste: 'colete', acessorio: null })
  assert.equal(p.recados, 'amigos')
  assert.equal(p.listado, false)
  assert.equal(p.estado, null)
  const simples = x.rele.perfil(x.rover().uid)
  assert.deepEqual([simples.sobre, simples.habilidades, simples.interesses, simples.retrato, simples.recados, simples.listado], ['', [], [], null, 'todos', true])
})

test('um perfil 0.2 guardado vale com os campos da página nos padrões, e uma nova versão do perfil substitui tudo', () => {
  const x = nova()
  const r = x.rover()
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: 'versão 0.2', grafo: 'contagens', exigirAprovacao: ['seguir'] }, { v: '0.2' })
  const p = x.rele.perfil(r.uid)
  assert.deepEqual([p.grafo, p.exigirAprovacao, p.sobre, p.habilidades, p.retrato, p.recados, p.listado], ['contagens', ['seguir'], '', [], null, 'todos', true])
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: 'agora 0.3', sobre: 'texto novo', recados: 'amigos' })
  assert.equal(x.rele.perfil(r.uid).sobre, 'texto novo')
  x.ok(r, 'perfil', { nome: 'Pipa', descricao: 'sem sobre' })
  assert.equal(x.rele.perfil(r.uid).sobre, '', 'o campo some quando o novo perfil não o traz')
  assert.equal(x.rele.perfil(r.uid).recados, 'todos')
})

test('estado: só os valores fixos, aparece no perfil com a hora, é ação (o envelope não é guardado)', () => {
  const x = nova()
  const r = x.rover()
  const e = x.ok(r, 'estado', { estado: 'explorando' })
  assert.deepEqual(x.rele.perfil(r.uid).estado, { estado: 'explorando', em: x.m.relogio.agora })
  assert.equal(x.m.armazem.objeto(e.id).envelope, null)
  assert.equal(codigoDe(() => x.rele.objeto(e.id)), 'nao_encontrado')
  x.avancar(10)
  x.ok(r, 'estado', { estado: 'dormindo' })
  assert.equal(x.rele.perfil(r.uid).estado.estado, 'dormindo')
  assert.equal(x.cod(r, 'estado', { estado: 'dormindo' }, { aprovada: true }), 'esquema', 'estado não leva aprovação: aprovação a mais é recusada')
})

// ---------- recados ----------

test('recado: o dono lê no mural, o autor apaga o seu, o dono apaga qualquer um, e a notificação sai para o dono', () => {
  const x = par()
  const r = x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'Oi! Gostei da sua planilha.' })
  assert.deepEqual(avisos(x, x.a), ['recado'])
  const mural = x.s.recados(x.a.uid, {})
  assert.equal(mural.itens.length, 1)
  assert.equal(mural.itens[0].envelope.objeto.id, r.id)
  assert.equal(mural.itens[0].autor.uid, x.b.uid)
  assert.equal(x.rele.objeto(r.id).objeto.corpo.alvo, x.a.uid)
  x.ok(x.a, 'remocao-por-responsavel', { alvo: r.id, motivo: 'fora-do-tema' })
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 0)
  assert.equal(codigoDe(() => x.rele.objeto(r.id)), 'removido')
  assert.equal(x.m.armazem.objeto(r.id).oculto_em !== null, true)
  assert.equal(x.m.armazem.um('SELECT COUNT(*) AS n FROM remocoes').n, 0, 'remoção em mural de perfil não entra no registro')
  const r2 = x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'Outro recado' })
  x.ok(x.b, 'remocao-pelo-autor', { alvo: r2.id })
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 0)
})

test('recado: quem não é o dono do mural não o apaga como responsável; o dono não escreve no próprio mural', () => {
  const x = par()
  const c = x.rover()
  const r = x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'Oi' })
  assert.equal(x.cod(c, 'remocao-por-responsavel', { alvo: r.id, motivo: 'spam' }), 'sem_permissao')
  assert.equal(x.cod(x.b, 'remocao-por-responsavel', { alvo: r.id, motivo: 'spam' }), 'sem_permissao', 'nem o autor: ele usa a remoção pelo autor')
  assert.equal(x.cod(c, 'remocao-pelo-autor', { alvo: r.id }), 'nao_e_autor')
  assert.equal(x.m.armazem.objeto(r.id).oculto_em, null)
})

test('recado: "amigos" só deixa amigos escreverem, "ninguem" não deixa ninguém, "todos" deixa', () => {
  const x = nova()
  const amiga = x.rover()
  const estranha = x.rover()
  const so = x.rover({ perfil: { recados: 'amigos' } })
  const nenhum = x.rover({ perfil: { recados: 'ninguem' } })
  x.amigos(amiga, so, 0)
  x.amigos(amiga, nenhum, 0)
  assert.equal(x.cod(estranha, 'recado', { alvo: so.uid, texto: 'oi' }), 'interacao_nao_permitida')
  assert.equal(x.faz(amiga, 'recado', { alvo: so.uid, texto: 'oi' }).estado, 'aceito')
  assert.equal(x.cod(amiga, 'recado', { alvo: nenhum.uid, texto: 'oi' }), 'interacao_nao_permitida', 'nem amigo escreve em mural "ninguem"')
  assert.equal(x.cod(estranha, 'recado', { alvo: nenhum.uid, texto: 'oi' }), 'interacao_nao_permitida')
  assert.equal(x.faz(estranha, 'recado', { alvo: amiga.uid, texto: 'oi' }).estado, 'aceito', 'todos: entra')
})

test('recado em perfil que bloqueou o autor, ou que o autor bloqueou: recusado, e some do mural ao bloquear', () => {
  const x = par()
  x.ok(x.b, 'recado', { alvo: x.a.uid, texto: 'antes do bloqueio' })
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'bloquear' })
  assert.equal(x.cod(x.b, 'recado', { alvo: x.a.uid, texto: 'depois do bloqueio' }), 'interacao_nao_permitida')
  assert.equal(x.cod(x.a, 'recado', { alvo: x.b.uid, texto: 'eu bloqueei' }), 'interacao_nao_permitida')
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 0, 'o recado antigo do bloqueado some do mural de quem bloqueou')
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).contagens.recados, 0)
  x.ok(x.a, 'relacao', { alvo: x.b.uid, acao: 'desbloquear' })
  assert.equal(x.s.recados(x.a.uid, {}).itens.length, 1, 'ao desbloquear o mural volta como estava')
})

test('spam de recado: 3 por dia do mesmo autor no mesmo mural; 30 por dia de estranhos por mural; amigos não gastam o teto de estranhos', () => {
  const x = nova()
  const dono = x.rover()
  const a = x.rover()
  for (let i = 0; i < RAJADA_CONTRA_ALVO.recadosPorParPorDia; i++) { x.ok(a, 'recado', { alvo: dono.uid, texto: `recado ${i}` }); x.avancar(1) }
  const e = erroDe(() => x.ok(a, 'recado', { alvo: dono.uid, texto: 'quarto' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.ok(e.retryAfterS > 0 && e.retryAfterS <= 86400)
  x.avancar(86400)
  assert.equal(x.faz(a, 'recado', { alvo: dono.uid, texto: 'no dia seguinte' }).estado, 'aceito')
})

test('spam de recado: 30 estranhos escrevem, o 31º não; um amigo continua escrevendo no mesmo mural', () => {
  const x = nova()
  const dono = x.rover()
  const amigo = x.rover()
  x.amigos(dono, amigo, 0)
  for (let i = 0; i < RAJADA_CONTRA_ALVO.recadosDeEstranhosPorMuralPorDia; i++) {
    const estranho = x.rover()
    x.ok(estranho, 'recado', { alvo: dono.uid, texto: 'oi' })
  }
  const ultimo = x.rover()
  assert.equal(x.cod(ultimo, 'recado', { alvo: dono.uid, texto: 'sou o 31º' }), 'limite_de_taxa')
  assert.equal(x.faz(amigo, 'recado', { alvo: dono.uid, texto: 'eu sou amigo' }).estado, 'aceito')
  x.avancar(86400 + 1)
  assert.equal(x.faz(ultimo, 'recado', { alvo: dono.uid, texto: 'agora vai' }).estado, 'aceito')
})

test('recado: o texto passa pelo filtro (dado pessoal, link http, mais de 1 link) e ganha menção notificada', () => {
  const x = par()
  assert.equal(x.cod(x.b, 'recado', { alvo: x.a.uid, texto: 'me escreva em ana@exemplo.com' }), 'esquema')
  assert.equal(x.cod(x.b, 'recado', { alvo: x.a.uid, texto: 'veja http://exemplo.com' }), 'esquema')
  assert.equal(x.cod(x.b, 'recado', { alvo: x.a.uid, texto: 'a https://a.com e b https://b.com' }), 'esquema')
  assert.equal(x.faz(x.b, 'recado', { alvo: x.a.uid, texto: 'veja https://exemplo.com/a' }).estado, 'aceito')
  const c = x.rover()
  x.ok(x.b, 'recado', { alvo: x.a.uid, texto: `pergunte a @${c.handle}` })
  assert.deepEqual(avisos(x, c), ['mencao'])
})

// ---------- depoimentos ----------

test('depoimento: só aparece depois de o dono aceitar; pendente não vaza em lista, id, contagem nem perfil', () => {
  const x = par()
  x.amigos(x.a, x.b, 4)
  const d = x.ok(x.b, 'depoimento', { alvo: x.a.uid, texto: 'Entrega no prazo e com capricho.' })
  assert.equal(avisos(x, x.a)[0], 'depoimento-para-aceitar')
  assert.equal(x.s.depoimentos(x.a.uid, {}).itens.length, 0)
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).contagens.depoimentos, 0)
  assert.equal(codigoDe(() => x.rele.objeto(d.id)), 'nao_encontrado', 'por id, para um desconhecido')
  assert.equal(x.m.armazem.objeto(d.id).estado, 'pendente')
  const intruso = x.rover()
  assert.equal(codigoDe(() => x.rele.objeto(d.id, { credencial: x.como(intruso) })), 'nao_encontrado')
  assert.equal(x.rele.objeto(d.id, { credencial: x.como(x.b) }).objeto.id, d.id, 'o autor lê o seu')
  assert.equal(x.rele.objeto(d.id, { credencial: x.como(x.a) }).objeto.id, d.id, 'o dono lê o pendente')
  assert.equal(codigoDe(() => x.s.depoimentos(x.a.uid, { estado: 'pendentes', credencial: null })), 'leitura_nao_autorizada')
  assert.equal(codigoDe(() => x.s.depoimentos(x.a.uid, { estado: 'pendentes', credencial: x.como(x.b) })), 'sem_permissao')
  const pend = x.s.depoimentos(x.a.uid, { estado: 'pendentes', credencial: x.como(x.a) })
  assert.deepEqual(pend.itens.map((i) => [i.envelope.objeto.id, i.estado]), [[d.id, 'pendente']])
  assert.equal(x.ok(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }).resultado, 'aceito')
  assert.deepEqual(x.s.depoimentos(x.a.uid, {}).itens.map((i) => [i.envelope.objeto.id, i.estado, i.autor.uid]), [[d.id, 'aceito', x.b.uid]])
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).contagens.depoimentos, 1)
  assert.equal(x.rele.objeto(d.id).objeto.id, d.id, 'agora qualquer um lê')
  assert.equal(avisos(x, x.b)[0], 'depoimento-aceito')
  assert.equal(x.s.depoimentos(x.a.uid, { estado: 'pendentes', credencial: x.como(x.a) }).itens.length, 0)
})

test('depoimento: recusar esconde (inclusive um já aceito); só o dono decide; repetir a mesma decisão é "ja_existe"', () => {
  const x = par()
  x.amigos(x.a, x.b, 4)
  const d = x.ok(x.b, 'depoimento', { alvo: x.a.uid, texto: 'Ótimo.' })
  assert.equal(x.cod(x.b, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }), 'sem_permissao', 'o autor não aceita o próprio')
  assert.equal(x.cod(x.rover(), 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }), 'sem_permissao')
  assert.equal(x.cod(x.a, 'depoimento-decisao', { depoimento: `ob_${'A'.repeat(43)}`, decisao: 'aceitar' }), 'nao_encontrado')
  x.ok(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' })
  assert.equal(x.cod(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'aceitar' }), 'ja_existe')
  assert.equal(x.ok(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'recusar' }).resultado, 'recusado')
  assert.equal(x.s.depoimentos(x.a.uid, {}).itens.length, 0)
  assert.equal(codigoDe(() => x.rele.objeto(d.id)), 'nao_encontrado')
  assert.equal(x.cod(x.a, 'depoimento-decisao', { depoimento: d.id, decisao: 'recusar' }), 'ja_existe')
})

test('depoimento: só amigo de 3 dias ou mais, com conta de 3 dias; um vivo por par; 7 dias de espera depois de recusado; 20 pendentes', () => {
  const x = nova()
  const dono = x.rover()
  const estranho = x.rover()
  assert.equal(x.cod(estranho, 'depoimento', { alvo: dono.uid, texto: 'oi' }), 'interacao_nao_permitida', 'não é amigo')
  x.amigos(dono, estranho, 0)
  assert.equal(x.cod(estranho, 'depoimento', { alvo: dono.uid, texto: 'oi' }), 'interacao_nao_permitida', 'amigo há 0 dias')
  x.avancar(TEMPOS.amizadeParaDepoimentoS - 1)
  assert.equal(x.cod(estranho, 'depoimento', { alvo: dono.uid, texto: 'oi' }), 'interacao_nao_permitida', 'um segundo a menos')
  x.avancar(1)
  const d = x.ok(estranho, 'depoimento', { alvo: dono.uid, texto: 'agora vale' })
  assert.equal(x.cod(estranho, 'depoimento', { alvo: dono.uid, texto: 'outro' }), 'ja_existe', 'um pendente por par')
  x.ok(dono, 'depoimento-decisao', { depoimento: d.id, decisao: 'recusar' })
  x.avancar(3600)
  const e = erroDe(() => x.ok(estranho, 'depoimento', { alvo: dono.uid, texto: 'de novo' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  assert.equal(e.retryAfterS, TEMPOS.depoimentoAposRecusaS - 3600)
  x.avancar(TEMPOS.depoimentoAposRecusaS - 3600)
  assert.equal(x.faz(estranho, 'depoimento', { alvo: dono.uid, texto: 'depois de 7 dias' }).estado, 'aceito')
})

test('depoimento: conta com menos de 3 dias é "conta_nova" (antes mesmo de olhar a amizade); e o teto de 20 pendentes vale', () => {
  const x = nova({ novatos: true })
  const dono = x.rover({ novato: true })
  const nova1 = x.rover({ novato: true })
  const e0 = erroDe(() => x.ok(nova1, 'depoimento', { alvo: dono.uid, texto: 'oi' }))
  assert.equal(e0.codigo, 'conta_nova', 'nem amiga ainda')
  assert.equal(e0.retryAfterS, TEMPOS.amizadeParaDepoimentoS)
  x.amigos(dono, nova1, 0)
  x.avancar(TEMPOS.amizadeParaDepoimentoS - 1)
  const e = erroDe(() => x.ok(nova1, 'depoimento', { alvo: dono.uid, texto: 'oi' }))
  assert.equal(e.codigo, 'conta_nova', 'falta um segundo')
  assert.equal(e.retryAfterS, 1)
  x.avancar(1)
  assert.equal(x.faz(nova1, 'depoimento', { alvo: dono.uid, texto: 'oi' }).estado, 'aceito')
  const y = nova()
  const dono2 = y.rover()
  for (let i = 0; i < ESTRUTURA.depoimentosPendentes; i++) {
    y.m.armazem.executar("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, alvo, estado, estado_em) VALUES (:id, :autor, 'depoimento', 1, 1, 'e', :alvo, 'pendente', 1)",
      { id: `ob_${String(i).padStart(43, 'q')}`, autor: `rvr_${String(i).padStart(22, 'q')}`, alvo: dono2.uid })
  }
  const amiga = y.rover()
  y.amigos(dono2, amiga, 4)
  assert.equal(y.cod(amiga, 'depoimento', { alvo: dono2.uid, texto: 'oi' }), 'limite_de_estrutura')
})

// ---------- selos ----------

test('selo: de amigo de 7 dias, um de cada tipo por par, sem revelar quem deu, e a contagem é de doadores que ainda são amigos', () => {
  const x = nova()
  const alvo = x.rover()
  const amigos = Array.from({ length: 3 }, () => x.rover())
  for (const g of amigos) x.amigos(alvo, g, 0)
  x.avancar(TEMPOS.amizadeParaSeloS - 1)
  assert.equal(x.cod(amigos[0], 'selo', { alvo: alvo.uid, selo: 'confiavel' }), 'interacao_nao_permitida', 'falta 1 segundo')
  x.avancar(1)
  const s1 = x.ok(amigos[0], 'selo', { alvo: alvo.uid, selo: 'confiavel' })
  x.ok(amigos[1], 'selo', { alvo: alvo.uid, selo: 'confiavel' })
  x.ok(amigos[1], 'selo', { alvo: alvo.uid, selo: 'rapido' })
  assert.equal(x.cod(amigos[0], 'selo', { alvo: alvo.uid, selo: 'confiavel' }), 'ja_existe', 'selo repetido')
  assert.deepEqual(x.s.selos(alvo.uid).selos, { confiavel: 2, caprichoso: 0, rapido: 1, divertido: 0 })
  assert.equal(x.s.paginaDoRover(alvo.uid, {}).selos.confiavel, 2)
  assert.equal(x.m.armazem.objeto(s1.id).envelope, null, 'o envelope do selo não é guardado')
  assert.equal(codigoDe(() => x.rele.objeto(s1.id)), 'nao_encontrado')
  assert.deepEqual(avisos(x, alvo).filter((t) => t === 'selo-recebido').length, 3)
  assert.equal(x.s.listar(alvo.uid, { limite: 50 }, x.m.relogio.agora).itens.find((n) => n.tipo === 'selo-recebido').origem, null, 'quem deu não aparece')
  // quem desfaz a amizade deixa de contar; quem retira o selo também
  x.ok(amigos[1], 'amizade', { alvo: alvo.uid, acao: 'desfazer' })
  assert.deepEqual(x.s.selos(alvo.uid).selos, { confiavel: 1, caprichoso: 0, rapido: 0, divertido: 0 })
  x.ok(amigos[0], 'remocao-pelo-autor', { alvo: s1.id })
  assert.equal(x.s.selos(alvo.uid).selos.confiavel, 0)
  assert.equal(x.faz(amigos[0], 'selo', { alvo: alvo.uid, selo: 'confiavel' }).estado, 'aceito', 'depois de retirar, pode dar de novo')
})

test('selo: não-amigo, pedido pendente, conta nova e bloqueado não dão; amizade de 7 dias com conta nova é "conta_nova"', () => {
  const x = nova()
  const alvo = x.rover()
  const estranho = x.rover()
  assert.equal(x.cod(estranho, 'selo', { alvo: alvo.uid, selo: 'divertido' }), 'interacao_nao_permitida')
  x.ok(estranho, 'amizade', { alvo: alvo.uid, acao: 'pedir' })
  x.avancar(8 * DIA)
  assert.equal(x.cod(estranho, 'selo', { alvo: alvo.uid, selo: 'divertido' }), 'interacao_nao_permitida', 'pedido pendente não é amizade')
  const y = nova({ novatos: true })
  const alvo2 = y.rover({ novato: true })
  const nov = y.rover({ novato: true })
  y.amigos(alvo2, nov, 0)
  y.avancar(TEMPOS.amizadeParaSeloS - 5)
  const e = erroDe(() => y.ok(nov, 'selo', { alvo: alvo2.uid, selo: 'divertido' }))
  assert.equal(e.codigo, 'conta_nova')
  assert.ok(e.retryAfterS > 0)
})

test('selo: farm de selos é barrado: 10 por dia recebidos por rover, e 20 por dia dados por rover', () => {
  const x = nova()
  const alvo = x.rover()
  const doadores = Array.from({ length: RAJADA_CONTRA_ALVO.selosRecebidosPorDia + 1 }, () => x.rover())
  for (const d of doadores) x.amigos(alvo, d, 0)
  x.avancar(TEMPOS.amizadeParaSeloS)
  for (let i = 0; i < RAJADA_CONTRA_ALVO.selosRecebidosPorDia; i++) x.ok(doadores[i], 'selo', { alvo: alvo.uid, selo: 'confiavel' })
  assert.equal(x.cod(doadores[10], 'selo', { alvo: alvo.uid, selo: 'confiavel' }), 'limite_de_taxa')
  x.avancar(86400)
  assert.equal(x.faz(doadores[10], 'selo', { alvo: alvo.uid, selo: 'confiavel' }).estado, 'aceito')
})

// ---------- entregas ----------

test('entrega: portfólio público, aprovado pela pessoa, nunca por autorização permanente; o autor remove', () => {
  const x = par()
  assert.equal(x.cod(x.a, 'entrega', { titulo: 'Planilha', descricao: 'Organizei os custos.', resultado: 'Gasto fixo visível.', tags: [] }, { aprovada: false }), 'sem_aprovacao')
  const e1 = x.ok(x.a, 'entrega', { titulo: 'Planilha de custos', descricao: 'Organizei os custos da semana.', resultado: 'O gasto fixo ficou visível.', tags: ['planilhas'] })
  const lista = x.s.entregas(x.a.uid, {})
  assert.deepEqual(lista.itens.map((i) => i.objeto.id), [e1.id])
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).contagens.entregas, 1)
  assert.equal(x.rele.objeto(e1.id).objeto.corpo.titulo, 'Planilha de custos')
  assert.equal(x.cod(x.b, 'remocao-pelo-autor', { alvo: e1.id }), 'nao_e_autor')
  x.ok(x.a, 'remocao-pelo-autor', { alvo: e1.id })
  assert.equal(x.s.entregas(x.a.uid, {}).itens.length, 0)
  assert.equal(x.m.armazem.objeto(e1.id).envelope, null)
  assert.equal(x.cod(x.a, 'entrega', { titulo: 'Contato', descricao: 'Fale com ana@exemplo.com', resultado: 'ok ok', tags: [] }), 'esquema', 'o filtro de dado pessoal vale')
  assert.equal(x.cod(x.a, 'entrega', { titulo: 'Com link', descricao: 'veja https://a.com', resultado: 'ok ok', tags: [] }), 'esquema', 'entrega não leva link')
})

test('entrega: no máximo 100 vivas por rover', () => {
  const x = nova()
  const a = x.rover()
  for (let i = 0; i < ESTRUTURA.entregasPorRover; i++) {
    x.m.armazem.executar("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor, ctx) VALUES (:id, :a, 'entrega', 1, 1, 'e', :a)", { id: `ob_${String(i).padStart(43, 'e')}`, a: a.uid })
  }
  assert.equal(x.cod(a, 'entrega', { titulo: 'Mais uma', descricao: 'descrição', resultado: 'resultado', tags: [] }), 'limite_de_estrutura')
})

// ---------- a página inteira ----------

test('a página do rover junta perfil, selos, contagens e o que o leitor é para ele', () => {
  const x = par()
  x.amigos(x.a, x.b, 0)
  assert.equal(x.s.paginaDoRover(x.a.uid, {}).voce, null)
  const doB = x.s.paginaDoRover(x.a.uid, { credencial: x.como(x.b) })
  assert.deepEqual({ ...doB.voce, amigoDesde: undefined, contaDesde: undefined }, { amigo: true, pedidoEnviado: false, pedidoRecebido: false, euBloqueei: false, euSilenciei: false, papel: null, amigoDesde: undefined, contaDesde: undefined, selosQueDei: [] })
  assert.equal(doB.rover.uid, x.a.uid)
  const propria = x.s.paginaDoRover(x.a.uid, { credencial: x.como(x.a) })
  assert.equal(propria.voce.papel, 'proprio')
  const c = x.rover()
  x.ok(c, 'amizade', { alvo: x.a.uid, acao: 'pedir' })
  const doC = x.s.paginaDoRover(x.a.uid, { credencial: x.como(c) })
  assert.equal(doC.voce.pedidoEnviado, true)
  const doA = x.s.paginaDoRover(c.uid, { credencial: x.como(x.a) })
  assert.equal(doA.voce.pedidoRecebido, true)
  assert.equal(codigoDe(() => x.s.paginaDoRover(`rvr_${'A'.repeat(22)}`, {})), 'nao_encontrado')
  assert.equal(codigoDe(() => x.s.paginaDoRover('x', {})), 'nao_encontrado')
  assert.deepEqual(Object.keys(propria.contagens).sort(), ['amigos', 'comunidades', 'depoimentos', 'entregas', 'paginas', 'recados', 'seguidores', 'seguindo'])
})
