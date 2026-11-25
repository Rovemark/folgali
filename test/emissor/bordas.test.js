// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: as bordas do emissor aberto que o medidor de mutação apontou. Janelas exatas (a hora e o dia de cada limite), as datas que
// impedem um pacote de nascer revogado, a derivação fixa das chaves (trocá-la deixaria todo agente órfão), o emissor sem relé, e a
// leitura da configuração das duas entradas do relé.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { EMISSOR_ABERTO, chavePrivadaDeSemente, chavePublicaDe, criarRegistroDeAgente, criarCredencialDeLeitura, gerarParDeChaves } from '../../packages/protocolo/src/index.js'
import { EmissorAberto } from '../../packages/emissor-aberto/src/emissor.js'
import { lerConfiguracao } from '../../packages/emissor-aberto/src/configuracao.js'
import { autorizacaoPermanenteDe, emissoresDeAgentesDe } from '../../packages/rele/src/operacao.js'
import { EmissorDeDonosDeTeste, segredoDoLink } from '../../packages/emissor-aberto/src/emissor-de-donos-de-teste.js'
import { AGORA, novoHandle } from '../ajuda/mundo.js'
import { codigoAsync, codigoDe, erroAsync, erroDe, novoMundo, publicar } from '../ajuda/rele-de-teste.js'

const HORA = 3600
const DIA = 86400

async function registrar(m, { origem = `o-${randomBytes(4).toString('hex')}`, emissor = m.emissor, agora = m.relogio.agora } = {}) {
  const rede = gerarParDeChaves()
  const registro = criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: novoHandle(), nome: 'Bot', criadoEm: agora })
  const r = await emissor.registrar({ registro }, { origem })
  return { ...r, rede, cabeca: null, segredo: segredoDoLink(r.reivindicar) }
}
const eu = (m, ag, emissor = m.emissor) => {
  const alvo = '/v1/agentes/eu'
  return emissor.eu({ cabecalho: criarCredencialDeLeitura({ chavePrivada: ag.rede.chavePrivada, uid: ag.uid, alvo, t: m.relogio.agora }), metodo: 'GET', alvo })
}
const agir = async (m, dados) => m.emissor.agir({ ato: m.donos.ato(dados) })
async function liberado(m, dono = EmissorDeDonosDeTeste.novoDono()) {
  const ag = await registrar(m)
  await agir(m, { dono, acao: 'reivindicar', reivindicacao: ag.segredo, codigo: ag.codigo })
  return Object.assign(ag, { dono }, eu(m, ag))
}

test('corpo que não é objeto: registro e ato respondem esquema, sem estourar', async () => {
  const m = novoMundo({ emissorAberto: true })
  for (const corpo of [null, 'texto', 3, [], ['registro']]) {
    assert.equal(await codigoAsync(() => m.emissor.registrar(corpo)), 'esquema', JSON.stringify(corpo))
    assert.equal(await codigoAsync(() => m.emissor.agir(corpo)), 'esquema', JSON.stringify(corpo))
  }
})

test('derivação fixa: o mesmo segredo dá a mesma chave de aprovação e o mesmo HMAC de dono, hoje e depois de qualquer mudança no código', async () => {
  const e = new EmissorAberto({ chavePrivada: chavePrivadaDeSemente(Buffer.alloc(32, 1)), segredo: Buffer.alloc(32, 7), emissoresDeDonos: ['B'.repeat(43)], linkDeReivindicacao: 'https://x.test/r/' })
  assert.equal(chavePublicaDe(e._chaveDeAprovacao(`rvr_${'A'.repeat(22)}`)), '-H_9cbvfE7Fz1LKEeCzSojH4bG0KQBEi-ElhuEirtDQ')
  assert.equal(e._donoHash('B'.repeat(43), 'dn_teste_0123456789'), '0gqtMro3tnwsVY_z7v8Q1NQ8m7gruUCMp4I_xGE8lZM')
})

test('limite por origem nas bordas exatas: a hora e o dia contam a partir do registro mais antigo da janela', async () => {
  const m = novoMundo({ emissorAberto: true })
  const origem = 'borda-hora'
  const t0 = m.relogio.agora
  for (const d of [0, 10, 20]) { m.relogio.agora = t0 + d; await registrar(m, { origem }) }
  m.relogio.agora = t0 + 30
  assert.equal((await erroAsync(() => registrar(m, { origem }))).retryAfterS, HORA - 30, 'conta do mais antigo da hora')
  m.relogio.agora = t0 + HORA - 1
  assert.equal((await erroAsync(() => registrar(m, { origem }))).retryAfterS, 1)
  m.relogio.agora = t0 + HORA
  assert.equal((await registrar(m, { origem })).situacao, 'aguardando-dono', 'na hora cheia o mais antigo saiu da janela')

  const dia = 'borda-dia'
  const t1 = m.relogio.agora
  for (let i = 0; i < 10; i++) { m.relogio.agora = t1 + i * HORA; await registrar(m, { origem: dia }) }
  m.relogio.agora = t1 + 10 * HORA
  assert.equal((await erroAsync(() => registrar(m, { origem: dia }))).retryAfterS, DIA - 10 * HORA, 'conta do mais antigo do dia')
  m.relogio.agora = t1 + DIA - 1
  assert.equal((await erroAsync(() => registrar(m, { origem: dia }))).retryAfterS, 1)
  m.relogio.agora = t1 + DIA
  assert.equal((await registrar(m, { origem: dia })).situacao, 'aguardando-dono')
})

test('o mapa de origens em memória tem teto de 100 mil: a mais antiga sai primeiro, nunca antes de passar do teto', async () => {
  const m = novoMundo({ emissorAberto: true })
  for (let i = 0; i < 99_999; i++) m.emissor._origens.set(`velha-${i}`, [m.relogio.agora])
  await registrar(m, { origem: 'nova-1' })
  assert.equal(m.emissor._origens.size, 100_000)
  assert.ok(m.emissor._origens.has('velha-0'), 'no teto exato ninguém sai')
  await registrar(m, { origem: 'nova-2' })
  assert.equal(m.emissor._origens.size, 100_000)
  assert.ok(!m.emissor._origens.has('velha-0'))
  assert.ok(m.emissor._origens.has('velha-1'))
})

test('reivindicações por dono por dia nas bordas: conta da mais antiga, e na volta exata do dia libera', async () => {
  const m = novoMundo({ emissorAberto: true })
  const dono = EmissorDeDonosDeTeste.novoDono()
  const t0 = m.relogio.agora
  for (let i = 0; i < 5; i++) { m.relogio.agora = t0 + i * 10; await liberado(m, dono) }
  m.relogio.agora = t0 + 100
  const ag = await registrar(m)
  assert.equal((await erroAsync(() => agir(m, { dono, acao: 'reivindicar', reivindicacao: ag.segredo, codigo: ag.codigo }))).retryAfterS, DIA - 100)
  m.relogio.agora = t0 + DIA - 1
  const ag2 = await registrar(m)
  assert.equal((await erroAsync(() => agir(m, { dono, acao: 'reivindicar', reivindicacao: ag2.segredo, codigo: ag2.codigo }))).retryAfterS, 1)
  m.relogio.agora = t0 + DIA
  assert.equal((await agir(m, { dono, acao: 'reivindicar', reivindicacao: ag2.segredo, codigo: ag2.codigo })).situacao, 'liberado')
})

test('o registro expirado some exatamente 7 dias depois do fim da reserva', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await registrar(m)
  const existe = () => m.emissor.db.prepare('SELECT COUNT(*) AS n FROM agentes WHERE uid = ?').get(ag.uid).n
  m.relogio.agora = ag.expiraEm + 7 * DIA - 1
  await registrar(m)
  assert.equal(existe(), 1)
  m.relogio.agora = ag.expiraEm + 7 * DIA
  await registrar(m)
  assert.equal(existe(), 0)
})

test('renovação na borda: com exatamente 7 dias restantes não renova; com um segundo a menos, renova', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await liberado(m)
  m.relogio.agora = ag.atestado.expiraEm - EMISSOR_ABERTO.renovarAntesS
  assert.equal(eu(m, ag).atestado.emitidoEm, ag.atestado.emitidoEm)
  m.relogio.agora++
  assert.equal(eu(m, ag).atestado.emitidoEm, m.relogio.agora)
  // o pacote da folga é sem prazo: anos depois, com o atestado renovado, continua o mesmo
  const pacote = eu(m, ag).autorizacoes
  assert.ok(pacote.every((x) => x.expiraEm === null))
  m.relogio.agora += 5 * 365 * DIA
  assert.deepEqual(eu(m, ag).autorizacoes.map((x) => x.id), pacote.map((x) => x.id))
})

test('datas no mesmo segundo: o pacote novo nasce um segundo depois da revogação, e a política anda um segundo por vez', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await liberado(m)
  const t = m.relogio.agora
  publicar(m, ag, 'perfil', { nome: 'Bot', descricao: 'x' }, { comAtestado: true, autorizacao: ag.autorizacoes.find((a) => a.tipos.includes('perfil')) })
  const v = m.emissor.provedor.versao
  await agir(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 3, comentariosPorDia: 3 } })
  assert.equal(eu(m, ag).autorizacoes[0].emitidaEm, t + 1, 'limites no mesmo segundo da reivindicação')
  assert.equal(m.emissor.provedor.versao, v, 'mudar os limites não mexe na lista de revogados')
  const pacoteDosLimites = eu(m, ag).autorizacoes
  await agir(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })
  assert.equal(m.armazem.politica(ag.uid).emitida_em, t)
  // o pacote emitido pela troca de limites (em t + 1) também cai com a pausa no mesmo segundo
  assert.equal(codigoDe(() => publicar(m, ag, 'postagem', { texto: 'pausado', topicos: [] }, { autorizacao: pacoteDosLimites[0] })), 'autorizacao_revogada')
  await agir(m, { dono: ag.dono, acao: 'limites', agente: ag.uid, limites: { postagensPorDia: 4, comentariosPorDia: 4 } })
  await agir(m, { dono: ag.dono, acao: 'retomar', agente: ag.uid })
  assert.equal(m.armazem.politica(ag.uid).emitida_em, t + 1)
  assert.equal(eu(m, ag).autorizacoes[0].emitidaEm, t + 2, 'um segundo depois da revogação de "todas" (feita em t + 1)')
  assert.equal(m.emissor.provedor.versao, v, 'retomar com o relé conhecendo o agente não mexe na lista de revogados')
})

test('pausar antes da primeira publicação revoga exatamente o atestado emitido até ali', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await liberado(m)
  await agir(m, { dono: ag.dono, acao: 'pausar', agente: ag.uid })
  assert.deepEqual(m.emissor.provedor.revogados(), [{ emissor: m.emissor.chavePublica, uid: ag.uid, ate: ag.atestado.emitidoEm + 1 }])
})

test('o nonce de um ato fica guardado até o ato vencer de vez, mesmo com varreduras no meio', async () => {
  const m = novoMundo({ emissorAberto: true })
  const ag = await liberado(m)
  const ato = m.donos.ato({ dono: ag.dono, acao: 'listar' })
  await m.emissor.agir({ ato })
  m.relogio.agora += EMISSOR_ABERTO.atoValidadeS - 1
  await agir(m, { dono: ag.dono, acao: 'listar' }) // varre
  assert.equal(await codigoAsync(() => m.emissor.agir({ ato })), 'ato_repetido')
})

test('info do emissor: o padrão e o ajuste da folga', async () => {
  const m = novoMundo({ emissorAberto: true })
  const i = m.emissor.info()
  assert.deepEqual(i.padrao, { postagensPorDia: 20, comentariosPorDia: 100 })
  assert.deepEqual(i.ajuste, { postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } })
})

test('emissor sem relé ligado: registra, libera e, ao pausar, revoga o atestado (não há relé para receber a política)', async () => {
  const donos = new EmissorDeDonosDeTeste({ relogio: () => AGORA })
  const e = new EmissorAberto({ chavePrivada: gerarParDeChaves().chavePrivada, segredo: randomBytes(32), emissoresDeDonos: [donos.chavePublica], linkDeReivindicacao: 'https://x.test/r/', relogio: () => AGORA })
  const m = { relogio: { agora: AGORA } }
  const ag = await registrar(m, { emissor: e, agora: AGORA })
  const dono = EmissorDeDonosDeTeste.novoDono()
  await e.agir({ ato: donos.ato({ dono, acao: 'reivindicar', reivindicacao: ag.segredo, codigo: ag.codigo }) })
  const estado = eu(m, ag, e)
  assert.equal(estado.situacao, 'liberado')
  await e.agir({ ato: donos.ato({ dono, acao: 'pausar', agente: ag.uid }) })
  assert.deepEqual(e.provedor.revogados(), [{ emissor: e.chavePublica, uid: ag.uid, ate: estado.atestado.emitidoEm + 1 }])
})

test('configuração do serviço: tudo conferido, e nada de segredo na mensagem', () => {
  const chave = 'a'.repeat(64)
  const ok = {
    EMISSOR_CHAVE: chave, EMISSOR_SEGREDO: 'b'.repeat(64), EMISSOR_DONOS: ` ${'C'.repeat(43)} ,, ${'D'.repeat(43)} `,
    EMISSOR_LINK: 'https://folgali.com/reivindicar/', EMISSOR_RELE: 'https://folgali.com/'
  }
  const c = lerConfiguracao(ok)
  assert.equal(chavePublicaDe(c.chavePrivada), chavePublicaDe(chavePrivadaDeSemente(Buffer.from(chave, 'hex'))))
  assert.deepEqual(c.segredo, Buffer.from('b'.repeat(64), 'hex'))
  assert.deepEqual(c.emissoresDeDonos, ['C'.repeat(43), 'D'.repeat(43)])
  assert.equal(c.linkDeReivindicacao, 'https://folgali.com/reivindicar/')
  assert.equal(c.rele, 'https://folgali.com')
  assert.deepEqual([c.banco, c.porta, c.endereco, c.confiarProxy, c.intervaloDeEntregasS], ['/dados/emissor-aberto.sqlite', 4848, '127.0.0.1', false, 60])
  const outro = lerConfiguracao({ ...ok, EMISSOR_BANCO: '/x.sqlite', EMISSOR_PORTA: '9000', EMISSOR_ENDERECO: '0.0.0.0', EMISSOR_CONFIAR_PROXY: 'sim', EMISSOR_ENTREGAS_INTERVALO_S: '5', EMISSOR_LINK: 'https://folgali.com/', EMISSOR_RELE: 'http://127.0.0.1:4747' })
  assert.deepEqual([outro.banco, outro.porta, outro.endereco, outro.confiarProxy, outro.intervaloDeEntregasS, outro.linkDeReivindicacao, outro.rele], ['/x.sqlite', 9000, '0.0.0.0', true, 5, 'https://folgali.com/', 'http://127.0.0.1:4747'])
  assert.equal(lerConfiguracao({ ...ok, EMISSOR_RELE: 'http://localhost' }).rele, 'http://localhost')
  const ruins = [
    [{ EMISSOR_CHAVE: undefined }, /EMISSOR_CHAVE/],
    [{ EMISSOR_CHAVE: 'a'.repeat(63) }, /EMISSOR_CHAVE/],
    [{ EMISSOR_CHAVE: `x${'a'.repeat(63)}` }, /EMISSOR_CHAVE/],
    [{ EMISSOR_CHAVE: `${'a'.repeat(64)}0` }, /EMISSOR_CHAVE/],
    [{ EMISSOR_SEGREDO: undefined }, /EMISSOR_SEGREDO/],
    [{ EMISSOR_SEGREDO: 'A'.repeat(64) }, /diferente/],
    [{ EMISSOR_DONOS: undefined }, /EMISSOR_DONOS/],
    [{ EMISSOR_DONOS: ' , ' }, /EMISSOR_DONOS/],
    [{ EMISSOR_DONOS: `${'C'.repeat(43)},curta` }, /EMISSOR_DONOS/],
    [{ EMISSOR_DONOS: 'C'.repeat(44) }, /EMISSOR_DONOS/],
    [{ EMISSOR_LINK: undefined }, /EMISSOR_LINK/],
    [{ EMISSOR_LINK: 'http://folgali.com/r/' }, /EMISSOR_LINK/],
    [{ EMISSOR_LINK: 'https://folgali.com/r' }, /EMISSOR_LINK/],
    [{ EMISSOR_LINK: 'https://folgali.com/r/?x=1/' }, /EMISSOR_LINK/],
    [{ EMISSOR_LINK: 'https://u@folgali.com/r/' }, /EMISSOR_LINK/],
    [{ EMISSOR_LINK: 'xhttps://folgali.com/r/' }, /EMISSOR_LINK/],
    [{ EMISSOR_RELE: undefined }, /EMISSOR_RELE/],
    [{ EMISSOR_RELE: 'http://folgali.com' }, /EMISSOR_RELE/],
    [{ EMISSOR_RELE: 'https://folgali.com/v1' }, /EMISSOR_RELE/],
    [{ EMISSOR_RELE: 'https://u@folgali.com' }, /EMISSOR_RELE/],
    [{ EMISSOR_RELE: 'http://127.0.0.2' }, /EMISSOR_RELE/],
    [{ EMISSOR_CONFIAR_PROXY: 'talvez' }, /EMISSOR_CONFIAR_PROXY/],
    [{ EMISSOR_PORTA: '0' }, /EMISSOR_PORTA/],
    [{ EMISSOR_PORTA: '70000' }, /EMISSOR_PORTA/],
    [{ EMISSOR_PORTA: '1.5' }, /EMISSOR_PORTA/],
    [{ EMISSOR_ENTREGAS_INTERVALO_S: '4' }, /EMISSOR_ENTREGAS_INTERVALO_S/]
  ]
  for (const [troca, erro] of ruins) {
    assert.throws(() => lerConfiguracao({ ...ok, ...troca }), (e) => erro.test(e.message) && !e.message.includes('b'.repeat(64)) && !e.message.includes(chave), JSON.stringify(troca))
  }
})

test('relé: RELE_EMISSORES_DE_AGENTES só aceita chaves que o relé já confia', () => {
  const a = 'A'.repeat(43)
  const b = 'B'.repeat(43)
  assert.deepEqual(emissoresDeAgentesDe({}, [a]), [])
  assert.deepEqual(emissoresDeAgentesDe({ RELE_EMISSORES_DE_AGENTES: '' }, [a]), [])
  assert.deepEqual(emissoresDeAgentesDe({ RELE_EMISSORES_DE_AGENTES: ` ${a} , ${a} ` }, [a, b]), [a])
  assert.throws(() => emissoresDeAgentesDe({ RELE_EMISSORES_DE_AGENTES: b }, [a]), /não está em RELE_EMISSORES/)
  assert.throws(() => emissoresDeAgentesDe({ RELE_EMISSORES_DE_AGENTES: 'curta' }, [a]), /43 caracteres/)
})

test('RELE_AUTORIZACAO_PERMANENTE: ausente, vazia e sim ligam; nao desliga; o resto é erro', async () => {
  for (const v of [undefined, '', 'sim']) assert.equal(autorizacaoPermanenteDe({ RELE_AUTORIZACAO_PERMANENTE: v }), true)
  assert.equal(autorizacaoPermanenteDe({ RELE_AUTORIZACAO_PERMANENTE: 'nao' }), false)
  assert.equal(autorizacaoPermanenteDe({}), true)
  for (const v of ['NAO', 'false', '0', 'talvez']) assert.throws(() => autorizacaoPermanenteDe({ RELE_AUTORIZACAO_PERMANENTE: v }), /aceita só/)
})

test('o registro aceito na borda do dia guarda o mais antigo: o próximo, no mesmo instante, ainda o conta', async () => {
  const m = novoMundo({ emissorAberto: true })
  const origem = 'borda-guardada'
  const t0 = m.relogio.agora
  for (let i = 0; i < 9; i++) { m.relogio.agora = t0 + i * HORA; await registrar(m, { origem }) }
  m.relogio.agora = t0 + DIA - 1
  await registrar(m, { origem })
  assert.equal((await erroAsync(() => registrar(m, { origem }))).retryAfterS, 1, 'o de t0 tem 86399 segundos e ainda vale')
})

test('o relógio padrão do emissor é o do sistema, em segundos', async () => {
  const donos = new EmissorDeDonosDeTeste()
  const e = new EmissorAberto({ chavePrivada: gerarParDeChaves().chavePrivada, segredo: randomBytes(32), emissoresDeDonos: [donos.chavePublica], linkDeReivindicacao: 'https://x.test/r/' })
  const agora = Math.floor(Date.now() / 1000)
  const r = await registrar({ relogio: { agora } }, { emissor: e, agora })
  assert.ok(Math.abs(r.expiraEm - EMISSOR_ABERTO.reservaS - agora) <= 2)
})
