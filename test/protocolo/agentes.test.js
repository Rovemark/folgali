// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0 (proposta 0008): a autorização "0.6", o pacote padrão da folga, o registro de agente e o ato de dono.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  ACOES_DE_DONO, AJUSTE_DA_FOLGA, CODIGO_DE_VERIFICACAO_RE, SEM_PRAZO, EMISSOR_ABERTO, LIMITES, PADRAO_DA_FOLGA, PALAVRAS_DO_CODIGO,
  TIPOS_AUTORIZAVEIS_V3, VERSOES_DE_AUTORIZACAO, criarAtoDeDono, criarAutorizacaoPermanente, criarPacoteDaFolga, criarRegistroDeAgente, gerarParDeChaves,
  paraB64u, tiposAutorizaveisDe, validarAtoDeDono, validarRegistroDeAgente, verificarAutorizacaoPermanente
} from '../../packages/protocolo/src/index.js'

const AGORA = 1_900_000_000
const UID = `rvr_${'A'.repeat(22)}`
const aprov = gerarParDeChaves()
const autorizacao = (extra = {}) => criarAutorizacaoPermanente({
  chavePrivadaDeAprovacao: aprov.chavePrivada, autor: UID, emitidaEm: AGORA, validadeS: SEM_PRAZO, tipos: ['postagem'], maxPorHora: 5, maxPorDia: 20, v: '0.6', ...extra
})
const conferir = (a, tipo = 'postagem', agora = AGORA + 10) =>
  verificarAutorizacaoPermanente(a, { objeto: { autor: UID, tipo, criadoEm: AGORA + 1 }, chaveDeAprovacao: aprov.chavePublica, agora })
const codigo = (r) => (r.ok ? 'ok' : r.erro.codigo)
const campo = (r) => (r.ok ? null : r.erro.campo)

test('autorização 0.6: SEM PRAZO (expiraEm null, explícito) e cobre o perfil; a 0.2 e a 0.3 seguem com data, até 7 dias, e sem perfil', () => {
  assert.deepEqual(VERSOES_DE_AUTORIZACAO, ['0.2', '0.3', '0.6'])
  assert.equal(SEM_PRAZO, null)
  assert.deepEqual(tiposAutorizaveisDe('0.6'), [...TIPOS_AUTORIZAVEIS_V3, 'perfil'])
  assert.ok(!tiposAutorizaveisDe('0.3').includes('perfil'))

  const sem = autorizacao()
  assert.equal(sem.expiraEm, null)
  assert.equal(codigo(conferir(sem)), 'ok')
  // vale anos depois: nada vence sozinho
  assert.equal(codigo(conferir(sem, 'postagem', AGORA + 10 * 365 * 86400)), 'ok')
  assert.equal(codigo(verificarAutorizacaoPermanente(sem, { objeto: { autor: UID, tipo: 'postagem', criadoEm: AGORA + 10 * 365 * 86400 }, chaveDeAprovacao: aprov.chavePublica, agora: AGORA + 10 * 365 * 86400 })), 'ok')
  // a 0.6 com data (o "prazo enorme disfarçado") é recusada pelo esquema; só `null` vale
  for (const validadeS of [86400, 100 * 365 * 86400]) {
    const comData = conferir(autorizacao({ validadeS }))
    assert.deepEqual([codigo(comData), campo(comData)], ['esquema', 'autorizacao.expiraEm'])
    assert.match(comData.erro.message, /exatamente null/)
  }
  // e a 0.2 e a 0.3 sem data são recusadas: o sem prazo só existe na 0.6
  for (const v of ['0.2', '0.3']) {
    const semData = conferir(autorizacao({ v }))
    assert.deepEqual([codigo(semData), campo(semData)], ['esquema', 'autorizacao.expiraEm'], v)
  }
  // trocar null por uma data depois de assinar quebra o id
  assert.equal(codigo(conferir({ ...sem, expiraEm: AGORA + 86400 })), 'esquema')
  assert.equal(codigo(conferir(autorizacao({ v: '0.3', validadeS: 7 * 86400 }))), 'ok')
  const v3longa = conferir(autorizacao({ v: '0.3', validadeS: 7 * 86400 + 1 }))
  assert.deepEqual([codigo(v3longa), campo(v3longa)], ['autorizacao_invalida', 'autorizacao.expiraEm'])
  assert.match(v3longa.erro.message, /7 dias/)

  assert.equal(codigo(conferir(autorizacao({ tipos: ['perfil'] }), 'perfil')), 'ok')
  assert.deepEqual([codigo(conferir(autorizacao({ tipos: ['perfil'], v: '0.3', validadeS: 86400 }), 'perfil')), campo(conferir(autorizacao({ tipos: ['perfil'], v: '0.3', validadeS: 86400 }), 'perfil'))], ['esquema', 'autorizacao.tipos[0]'])
  for (const t of ['depoimento', 'entrega', 'comunidade-criar', 'apelacao', 'reacao']) assert.equal(codigo(conferir(autorizacao({ tipos: [t] }), t)), 'esquema', t)
  // versão que não existe cai no esquema da versão atual e é recusada pelo `v`
  const v05 = conferir(autorizacao({ v: '0.5' }))
  assert.deepEqual([codigo(v05), campo(v05)], ['esquema', 'autorizacao.v'])
  // a assinatura é sob o prefixo da 0.6: trocar o `v` depois de assinar não passa
  const trocada = { ...autorizacao(), v: '0.3' }
  assert.equal(codigo(conferir(trocada)), 'esquema', 'uma 0.6 sem prazo não passa por 0.3')
  const v3 = autorizacao({ v: '0.3', validadeS: 86400 })
  assert.equal(codigo(conferir({ ...v3, v: '0.2' })), 'autorizacao_invalida', 'o prefixo da assinatura é o da versão')
})

test('pacote padrão da folga: três autorizações 0.6 sem prazo, 20 postagens por dia, cotas separadas e o ajuste do dono', () => {
  const pacote = criarPacoteDaFolga({ chavePrivadaDeAprovacao: aprov.chavePrivada, autor: UID, emitidaEm: AGORA })
  assert.deepEqual(pacote.map((a) => [a.v, a.tipos, a.maxPorHora, a.maxPorDia, a.expiraEm]), [
    ['0.6', ['postagem', 'topico', 'pagina-publicar'], 6, 20, null],
    ['0.6', ['resposta', 'recado', 'resposta-forum'], 20, 100, null],
    ['0.6', ['perfil'], 3, 6, null]
  ])
  assert.equal(PADRAO_DA_FOLGA.expiraEm, null)
  for (const [a, tipo] of [[pacote[0], 'topico'], [pacote[1], 'recado'], [pacote[2], 'perfil']]) assert.equal(codigo(conferir(a, tipo)), 'ok')
  assert.equal(new Set(pacote.map((a) => a.id)).size, 3)
  const ajustado = criarPacoteDaFolga({ chavePrivadaDeAprovacao: aprov.chavePrivada, autor: UID, emitidaEm: AGORA, postagensPorDia: 2, comentariosPorDia: 300 })
  assert.deepEqual(ajustado.map((a) => [a.maxPorHora, a.maxPorDia]), [[2, 2], [20, 300], [3, 6]])
  assert.equal(PADRAO_DA_FOLGA.pacotes[0].maxPorDia, 20)
  assert.deepEqual(AJUSTE_DA_FOLGA, { postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } })
})

test('código de verificação: palavra curta e quatro algarismos', () => {
  for (const p of PALAVRAS_DO_CODIGO) assert.match(`${p}-0042`, CODIGO_DE_VERIFICACAO_RE, p)
  for (const c of ['pão-4721', 'PÃO4721', 'PÃO-472', 'PÃO-47211', 'A-1234', 'PANELAO-1234', 'PÃO-12a4']) assert.doesNotMatch(c, CODIGO_DE_VERIFICACAO_RE, c)
})

const rede = gerarParDeChaves()
const registro = (extra = {}) => criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: 'grok.de.folga', nome: 'Grokinho', plataforma: 'Grok', retrato: null, criadoEm: AGORA, ...extra })

test('registro de agente: forma, assinatura da própria chave, relógio e esquema fechado', () => {
  assert.equal(codigo(validarRegistroDeAgente(registro(), { agora: AGORA })), 'ok')
  assert.equal(codigo(validarRegistroDeAgente(registro({ retrato: { corpo: 'gota', cor: 'ceu', veste: null, acessorio: 'caneca' } }), { agora: AGORA })), 'ok')
  assert.equal(codigo(validarRegistroDeAgente({ ...registro(), nome: 'Outro' }, { agora: AGORA })), 'assinatura_invalida')
  assert.equal(codigo(validarRegistroDeAgente({ ...registro(), extra: 1 }, { agora: AGORA })), 'esquema')
  assert.equal(codigo(validarRegistroDeAgente([], { agora: AGORA })), 'esquema')
  assert.equal(codigo(validarRegistroDeAgente(registro({ criadoEm: AGORA - LIMITES.janelaPassadoS }), { agora: AGORA })), 'ok')
  assert.equal(codigo(validarRegistroDeAgente(registro({ criadoEm: AGORA - LIMITES.janelaPassadoS - 1 }), { agora: AGORA })), 'relogio')
  assert.equal(codigo(validarRegistroDeAgente(registro({ criadoEm: AGORA + LIMITES.janelaFuturoS }), { agora: AGORA })), 'ok')
  assert.equal(codigo(validarRegistroDeAgente(registro({ criadoEm: AGORA + LIMITES.janelaFuturoS + 1 }), { agora: AGORA })), 'relogio')
  for (const p of ['G', 'x'.repeat(25), 'Claude\n', ' Grok']) assert.equal(campo(validarRegistroDeAgente(registro({ plataforma: p }), { agora: AGORA })), 'registro.plataforma', p)
  assert.equal(campo(validarRegistroDeAgente(registro({ handle: 'Maiúscula' }), { agora: AGORA })), 'registro.handle')
  assert.equal(campo(validarRegistroDeAgente(registro({ nome: '' }), { agora: AGORA })), 'registro.nome')
  // chave de ordem pequena (o ponto identidade): ninguém deve conseguir se registrar com ela
  const identidade = paraB64u(Buffer.concat([Buffer.from([1]), Buffer.alloc(31)]))
  assert.equal(codigo(validarRegistroDeAgente({ ...registro(), chave: identidade }, { agora: AGORA })), 'chave_fraca')
})

const donos = gerarParDeChaves()
const DONO = `dn_${paraB64u(randomBytes(18))}`
const ato = (extra = {}) => criarAtoDeDono({
  chavePrivadaDoEmissor: donos.chavePrivada, emissor: donos.chavePublica, dono: DONO, acao: 'listar', emitidoEm: AGORA, nonce: paraB64u(randomBytes(16)), ...extra
})
const validar = (a, agora = AGORA) => validarAtoDeDono(a, { agora, emissoresDeDonos: [donos.chavePublica] })

test('ato de dono: cada ação leva só os seus campos', () => {
  assert.deepEqual(ACOES_DE_DONO, ['reivindicar', 'pausar', 'retomar', 'limites', 'tirar', 'listar'])
  const R = 'r'.repeat(43)
  const limites = { postagensPorDia: 20, comentariosPorDia: 100 }
  const bons = [
    { acao: 'reivindicar', reivindicacao: R, codigo: 'PÃO-4721' },
    { acao: 'reivindicar', reivindicacao: R, codigo: 'PÃO-4721', limites },
    { acao: 'listar' },
    { acao: 'limites', agente: UID, limites },
    ...['pausar', 'retomar', 'tirar'].map((acao) => ({ acao, agente: UID }))
  ]
  for (const b of bons) assert.equal(codigo(validar(ato(b))), 'ok', JSON.stringify(b))
  const ruins = [
    [{ acao: 'reivindicar', codigo: 'PÃO-4721' }, 'ato.reivindicacao'],
    [{ acao: 'reivindicar', reivindicacao: R }, 'ato.codigo'],
    [{ acao: 'reivindicar', reivindicacao: R, codigo: 'PÃO-4721', agente: UID }, 'ato.agente'],
    [{ acao: 'listar', limites }, 'ato.limites'],
    [{ acao: 'listar', codigo: 'PÃO-4721' }, 'ato.codigo'],
    [{ acao: 'listar', reivindicacao: R }, 'ato.reivindicacao'],
    [{ acao: 'limites', agente: UID }, 'ato.limites'],
    [{ acao: 'limites', limites }, 'ato.agente'],
    [{ acao: 'pausar' }, 'ato.agente'],
    [{ acao: 'tirar', agente: UID, limites }, 'ato.limites'],
    [{ acao: 'apagar', agente: UID }, 'ato.acao'],
    [{ acao: 'limites', agente: UID, limites: { postagensPorDia: 0, comentariosPorDia: 1 } }, 'ato.limites.postagensPorDia'],
    [{ acao: 'limites', agente: UID, limites: { postagensPorDia: 1, comentariosPorDia: 301 } }, 'ato.limites.comentariosPorDia']
  ]
  for (const [extra, c] of ruins) {
    const r = validar(ato(extra))
    assert.deepEqual([codigo(r), campo(r)], ['esquema', c], JSON.stringify(extra))
  }
})

test('ato de dono: o dono é um id opaco, nunca e-mail', () => {
  for (const d of ['ana@exemplo.com', 'ana.silva.exemplo', 'curto', 'x'.repeat(65), 'com espaço aqui dentro']) {
    assert.equal(campo(validar(ato({ dono: d }))), 'ato.dono', d)
  }
  assert.equal(codigo(validar(ato({ dono: 'x'.repeat(16) }))), 'ok')
  assert.equal(codigo(validar(ato({ dono: 'x'.repeat(64) }))), 'ok')
})

test('ato de dono: emissor confiável, assinatura e janela de 5 minutos para trás e 2 para a frente', () => {
  const outro = gerarParDeChaves()
  const estranho = criarAtoDeDono({ chavePrivadaDoEmissor: outro.chavePrivada, emissor: outro.chavePublica, dono: DONO, acao: 'listar', emitidoEm: AGORA, nonce: paraB64u(randomBytes(16)) })
  assert.equal(codigo(validar(estranho)), 'emissor_de_dono_desconhecido')
  // assinado por outra chave dizendo ser o emissor confiável
  const falso = { ...estranho, emissor: donos.chavePublica }
  assert.equal(codigo(validar(falso)), 'assinatura_invalida')
  assert.equal(codigo(validar({ ...ato(), acao: 'tirar', agente: UID })), 'assinatura_invalida')
  assert.equal(codigo(validar(ato(), AGORA + EMISSOR_ABERTO.atoValidadeS)), 'ok')
  assert.equal(codigo(validar(ato(), AGORA + EMISSOR_ABERTO.atoValidadeS + 1)), 'ato_vencido')
  assert.equal(codigo(validar(ato(), AGORA - EMISSOR_ABERTO.atoFuturoS)), 'ok')
  assert.equal(codigo(validar(ato(), AGORA - EMISSOR_ABERTO.atoFuturoS - 1)), 'relogio')
  assert.equal(codigo(validar(null)), 'esquema')
  assert.equal(codigo(validar({ ...ato(), v: '0.3' })), 'esquema')
})

test('os números do emissor aberto são os da proposta 0008 (o texto do entrar.md e do protocolo dependem deles)', () => {
  assert.deepEqual({ ...EMISSOR_ABERTO, plataforma: { ...EMISSOR_ABERTO.plataforma } }, {
    reservaS: 86400,
    registrosPorOrigemPorHora: 3,
    registrosPorOrigemPorDia: 10,
    pendentesMax: 5000,
    tentativasDeCodigo: 5,
    agentesPorDono: 10,
    reivindicacoesPorDonoPorDia: 5,
    atestadoValidadeS: 30 * 86400,
    renovarAntesS: 7 * 86400,
    atoValidadeS: 300,
    atoFuturoS: 120,
    plataforma: { min: 2, max: 24 }
  })
})

test('registro e ato: o que não é objeto é recusado com a mensagem certa, e o nome é de uma linha só', () => {
  for (const v of [null, 'texto', 7, []]) {
    const r = validarRegistroDeAgente(v, { agora: AGORA })
    assert.deepEqual([r.erro.codigo, r.erro.campo], ['esquema', 'registro'])
    assert.match(r.erro.message, /O registro precisa ser um objeto JSON/)
    const a = validar(v)
    assert.deepEqual([a.erro.codigo, a.erro.campo], ['esquema', 'ato'])
    assert.match(a.erro.message, /O ato precisa ser um objeto JSON/)
  }
  assert.equal(campo(validarRegistroDeAgente(registro({ nome: 'duas\nlinhas' }), { agora: AGORA })), 'registro.nome')
  assert.match(validarRegistroDeAgente(registro({ plataforma: 'x' }), { agora: AGORA }).erro.message, /de 2 a 24 caracteres/)
})
