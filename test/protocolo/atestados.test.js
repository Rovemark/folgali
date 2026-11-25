// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  criarAtestadoDeHandle, criarAprovacaoHumana, gerarParDeChaves, identificadorDaAprovacao, paraB64u,
  verificarAprovacaoHumana, verificarAtestadoDeHandle
} from '../../packages/protocolo/src/index.js'
import { AGORA, aprovar, novoEmissor, novoRover, novoUid, objetoDe } from '../ajuda/mundo.js'

const emissor = novoEmissor()
const confiaveis = [emissor.chavePublica]
const ctx = (extra = {}) => ({ agora: AGORA, emissoresConfiaveis: confiaveis, ...extra })

function recusaAtestado(a, codigo, extra, campo) {
  const r = verificarAtestadoDeHandle(a, ctx(extra))
  assert.equal(r.ok, false)
  assert.equal(r.erro.codigo, codigo, r.erro.message)
  if (campo) assert.equal(r.erro.campo, campo)
}

test('atestado de handle válido', () => {
  const r = novoRover(emissor)
  const v = verificarAtestadoDeHandle(r.atestado, ctx())
  assert.equal(v.ok, true)
  assert.equal(v.atestado.uid, r.uid)
  assert.match(r.atestado.assinatura, /^[A-Za-z0-9_-]{86}$/)
})

test('emissor fora da lista, assinatura trocada e campo mexido', () => {
  const r = novoRover(emissor)
  recusaAtestado(r.atestado, 'emissor_desconhecido', { emissoresConfiaveis: [] }, 'atestado.emissor')
  recusaAtestado(r.atestado, 'emissor_desconhecido', { emissoresConfiaveis: [gerarParDeChaves().chavePublica] })
  recusaAtestado({ ...r.atestado, handle: 'outro.nome' }, 'atestado_invalido', {}, 'atestado.assinatura')
  recusaAtestado({ ...r.atestado, uid: novoUid() }, 'atestado_invalido', {}, 'atestado.assinatura')
  const falso = novoEmissor()
  const forjado = criarAtestadoDeHandle({
    chavePrivadaDoEmissor: falso.chavePrivada, emissor: emissor.chavePublica, uid: r.uid, handle: r.handle,
    chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: AGORA - 10, expiraEm: AGORA + 1000
  })
  recusaAtestado(forjado, 'atestado_invalido', {}, 'atestado.assinatura')
})

test('esquema fechado do atestado', () => {
  const r = novoRover(emissor)
  recusaAtestado({ ...r.atestado, extra: 1 }, 'esquema', {}, 'atestado.extra')
  const { handle: _h, ...sem } = r.atestado
  recusaAtestado(sem, 'esquema', {}, 'atestado.handle')
  recusaAtestado({ ...r.atestado, handle: 'Maiúsculo' }, 'esquema', {}, 'atestado.handle')
  recusaAtestado({ ...r.atestado, handle: 'ab' }, 'esquema', {}, 'atestado.handle')
  recusaAtestado({ ...r.atestado, uid: 'rvr_x' }, 'esquema', {}, 'atestado.uid')
  recusaAtestado(null, 'atestado_invalido')
  recusaAtestado('x', 'atestado_invalido')
})

test('validade: vencido, no futuro, longo demais, invertido', () => {
  const r = novoRover(emissor, { validadeS: 100 })
  const base = { uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, chavePrivadaDoEmissor: emissor.chavePrivada, emissor: emissor.chavePublica }
  recusaAtestado(r.atestado, 'atestado_vencido', { agora: AGORA + 1000 }, 'atestado.expiraEm')
  recusaAtestado(r.atestado, 'atestado_vencido', { agora: r.atestado.expiraEm })
  assert.equal(verificarAtestadoDeHandle(r.atestado, ctx({ agora: r.atestado.expiraEm - 1 })).ok, true)
  recusaAtestado(criarAtestadoDeHandle({ ...base, emitidoEm: AGORA + 500, expiraEm: AGORA + 900 }), 'atestado_invalido', {}, 'atestado.emitidoEm')
  assert.equal(verificarAtestadoDeHandle(criarAtestadoDeHandle({ ...base, emitidoEm: AGORA + 120, expiraEm: AGORA + 900 }), ctx()).ok, true)
  recusaAtestado(criarAtestadoDeHandle({ ...base, emitidoEm: AGORA - 10, expiraEm: AGORA - 10 + 90 * 86400 + 1 }), 'atestado_invalido', {}, 'atestado.expiraEm')
  const longo = verificarAtestadoDeHandle(criarAtestadoDeHandle({ ...base, emitidoEm: AGORA - 10, expiraEm: AGORA - 10 + 90 * 86400 + 1 }), ctx())
  assert.match(longo.erro.message, /no máximo 90 dias/)
  assert.equal(verificarAtestadoDeHandle(criarAtestadoDeHandle({ ...base, emitidoEm: AGORA - 10, expiraEm: AGORA - 10 + 90 * 86400 }), ctx()).ok, true)
  recusaAtestado(criarAtestadoDeHandle({ ...base, emitidoEm: AGORA - 10, expiraEm: AGORA - 10 }), 'atestado_invalido', {}, 'atestado.expiraEm')
  recusaAtestado(criarAtestadoDeHandle({ ...base, emitidoEm: AGORA - 10, expiraEm: AGORA + 5000 }), 'atestado_invalido', { validadeMaxS: 1000 }, 'atestado.expiraEm')
})

test('a chave de aprovação tem de ser diferente da chave de rede', () => {
  const r = novoRover(emissor)
  const igual = criarAtestadoDeHandle({
    chavePrivadaDoEmissor: emissor.chavePrivada, emissor: emissor.chavePublica, uid: r.uid, handle: r.handle,
    chave: r.rede.chavePublica, chaveAprovacao: r.rede.chavePublica, emitidoEm: AGORA - 10, expiraEm: AGORA + 1000
  })
  recusaAtestado(igual, 'atestado_invalido', {}, 'atestado.chaveAprovacao')
})

test('chave de ordem pequena é recusada nas duas posições', () => {
  const r = novoRover(emissor)
  const identidade = Buffer.alloc(32); identidade[0] = 1
  const fraca = paraB64u(identidade)
  const mk = (chave, chaveAprovacao) => criarAtestadoDeHandle({
    chavePrivadaDoEmissor: emissor.chavePrivada, emissor: emissor.chavePublica, uid: r.uid, handle: r.handle,
    chave, chaveAprovacao, emitidoEm: AGORA - 10, expiraEm: AGORA + 1000
  })
  recusaAtestado(mk(fraca, r.aprovacao.chavePublica), 'chave_fraca', {}, 'atestado.chave')
  recusaAtestado(mk(r.rede.chavePublica, fraca), 'chave_fraca', {}, 'atestado.chaveAprovacao')
})

// ---------- aprovação humana ----------

function recusaAprovacao(aprovacao, objeto, rover, codigo, extra, campo) {
  const r = verificarAprovacaoHumana(aprovacao, { objeto, chaveDeAprovacao: rover.aprovacao.chavePublica, agora: AGORA, ...extra })
  assert.equal(r.ok, false)
  assert.equal(r.erro.codigo, codigo, r.erro.message)
  if (campo) assert.equal(r.erro.campo, campo)
}

test('aprovação humana válida e de uso identificável', () => {
  const r = novoRover(emissor)
  const o = objetoDe(r, 'postagem', { texto: 'oi', topicos: [] })
  const a = aprovar(r, o)
  assert.equal(verificarAprovacaoHumana(a, { objeto: o, chaveDeAprovacao: r.aprovacao.chavePublica, agora: AGORA }).ok, true)
  assert.equal(identificadorDaAprovacao(a), identificadorDaAprovacao(JSON.parse(JSON.stringify(a))))
  assert.notEqual(identificadorDaAprovacao(a), identificadorDaAprovacao(aprovar(r, o, { nonce: paraB64u(Buffer.alloc(16, 7)) })))
  assert.match(a.nonce, /^[A-Za-z0-9_-]{22}$/)
})

test('aprovação amarrada ao objeto e ao rover', () => {
  const r = novoRover(emissor)
  const outro = novoRover(emissor)
  const o1 = objetoDe(r, 'postagem', { texto: 'um', topicos: [] })
  const o2 = objetoDe(r, 'postagem', { texto: 'dois', topicos: [] })
  recusaAprovacao(aprovar(r, o1), o2, r, 'aprovacao_invalida', {}, 'aprovacao.objeto')
  const deOutro = criarAprovacaoHumana({ chavePrivadaDeAprovacao: outro.aprovacao.chavePrivada, objeto: o1.id, autor: outro.uid, aprovadoEm: AGORA })
  recusaAprovacao(deOutro, o1, r, 'aprovacao_invalida', {}, 'aprovacao.autor')
  // com o uid certo mas assinada pela chave de aprovação de outro rover
  const roubada = criarAprovacaoHumana({ chavePrivadaDeAprovacao: outro.aprovacao.chavePrivada, objeto: o1.id, autor: r.uid, aprovadoEm: AGORA })
  recusaAprovacao(roubada, o1, r, 'aprovacao_invalida', {}, 'aprovacao.assinatura')
  // a chave de REDE do rover não pode aprovar: ela é do rover, não da pessoa
  const doRover = criarAprovacaoHumana({ chavePrivadaDeAprovacao: r.rede.chavePrivada, objeto: o1.id, autor: r.uid, aprovadoEm: AGORA })
  recusaAprovacao(doRover, o1, r, 'aprovacao_invalida', {}, 'aprovacao.assinatura')
  // conteúdo mexido depois de assinar
  const a = aprovar(r, o1)
  recusaAprovacao({ ...a, expiraEm: a.expiraEm + 1 }, o1, r, 'aprovacao_invalida', {}, 'aprovacao.assinatura')
})

test('janela da aprovação: vencida, futura, anterior ao objeto, longa demais', () => {
  const r = novoRover(emissor)
  const o = objetoDe(r, 'postagem', { texto: 'oi', topicos: [] }, { criadoEm: AGORA })
  const a = aprovar(r, o, { aprovadoEm: AGORA, validadeS: 300 })
  recusaAprovacao(a, o, r, 'aprovacao_vencida', { agora: AGORA + 301 }, 'aprovacao.expiraEm')
  assert.equal(verificarAprovacaoHumana(a, { objeto: o, chaveDeAprovacao: r.aprovacao.chavePublica, agora: AGORA + 300 }).ok, true)
  recusaAprovacao(aprovar(r, o, { aprovadoEm: AGORA + 500 }), o, r, 'aprovacao_invalida', {}, 'aprovacao.aprovadoEm')
  assert.equal(verificarAprovacaoHumana(aprovar(r, o, { aprovadoEm: AGORA + 120 }), { objeto: o, chaveDeAprovacao: r.aprovacao.chavePublica, agora: AGORA }).ok, true)
  recusaAprovacao(aprovar(r, o, { aprovadoEm: AGORA - 1 }), o, r, 'aprovacao_invalida', {}, 'aprovacao.aprovadoEm')
  recusaAprovacao(aprovar(r, o, { validadeS: 601 }), o, r, 'aprovacao_invalida', {}, 'aprovacao.expiraEm')
  const longa = verificarAprovacaoHumana(aprovar(r, o, { validadeS: 601 }), { objeto: o, chaveDeAprovacao: r.aprovacao.chavePublica, agora: AGORA })
  assert.match(longa.erro.message, /no máximo 10 minutos/)
  assert.equal(verificarAprovacaoHumana(aprovar(r, o, { validadeS: 600 }), { objeto: o, chaveDeAprovacao: r.aprovacao.chavePublica, agora: AGORA }).ok, true)
  recusaAprovacao(aprovar(r, o, { validadeS: 0 }), o, r, 'aprovacao_invalida', {}, 'aprovacao.expiraEm')
})

test('fora do modo ao vivo (réplica) o relógio de quem recebe não conta, a janela própria continua', () => {
  const r = novoRover(emissor)
  const o = objetoDe(r, 'postagem', { texto: 'oi', topicos: [] })
  const a = aprovar(r, o)
  assert.equal(verificarAprovacaoHumana(a, { objeto: o, chaveDeAprovacao: r.aprovacao.chavePublica, agora: AGORA + 10 ** 6, aoVivo: false }).ok, true)
  recusaAprovacao(aprovar(r, o, { validadeS: 9999 }), o, r, 'aprovacao_invalida', { aoVivo: false }, 'aprovacao.expiraEm')
})

test('esquema fechado da aprovação', () => {
  const r = novoRover(emissor)
  const o = objetoDe(r, 'postagem', { texto: 'oi', topicos: [] })
  const a = aprovar(r, o)
  recusaAprovacao({ ...a, extra: 1 }, o, r, 'esquema', {}, 'aprovacao.extra')
  recusaAprovacao({ ...a, nonce: 'curto' }, o, r, 'esquema', {}, 'aprovacao.nonce')
  recusaAprovacao(null, o, r, 'aprovacao_invalida')
  recusaAprovacao([], o, r, 'aprovacao_invalida')
})

test('aprovação criada sem validade explícita vale 5 minutos', () => {
  const r = novoRover(emissor)
  const o = objetoDe(r, 'postagem', { texto: 'oi', topicos: [] })
  const a = criarAprovacaoHumana({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, objeto: o.id, autor: r.uid, aprovadoEm: AGORA })
  assert.equal(a.expiraEm - a.aprovadoEm, 300)
})

// ---------- compatibilidade 0.1 e 0.2 ----------

test('atestado de handle 0.1 e 0.2 continuam válidos, assinados sob o prefixo da própria versão; a 0.4 não existe', () => {
  const r = novoRover(emissor)
  const base = {
    chavePrivadaDoEmissor: emissor.chavePrivada, emissor: emissor.chavePublica, uid: r.uid, handle: r.handle,
    chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: AGORA - 10, expiraEm: AGORA + 1000
  }
  const velho = criarAtestadoDeHandle({ ...base, v: '0.1' })
  assert.equal(velho.v, '0.1')
  assert.equal(verificarAtestadoDeHandle(velho, ctx()).ok, true)
  assert.equal(criarAtestadoDeHandle(base).v, '0.3')
  const v02 = criarAtestadoDeHandle({ ...base, v: '0.2' })
  assert.equal(verificarAtestadoDeHandle(v02, ctx()).ok, true)
  // trocar a etiqueta da versão sem reassinar quebra a assinatura (o prefixo de domínio acompanha a versão)
  recusaAtestado({ ...velho, v: '0.2' }, 'atestado_invalido', {}, 'atestado.assinatura')
  recusaAtestado({ ...velho, v: '0.3' }, 'atestado_invalido', {}, 'atestado.assinatura')
  recusaAtestado({ ...criarAtestadoDeHandle(base), v: '0.1' }, 'atestado_invalido', {}, 'atestado.assinatura')
  recusaAtestado({ ...v02, v: '0.3' }, 'atestado_invalido', {}, 'atestado.assinatura')
  recusaAtestado({ ...velho, v: '0.4' }, 'esquema', {}, 'atestado.v')
})

test('aprovação humana 0.1 continua válida, assinada sob o prefixo 0.1', () => {
  const r = novoRover(emissor)
  const o = objetoDe(r, 'postagem', { texto: 'oi', topicos: [] })
  const v = (aprovacao) => verificarAprovacaoHumana(aprovacao, { objeto: o, chaveDeAprovacao: r.aprovacao.chavePublica, agora: AGORA })
  const velha = criarAprovacaoHumana({ chavePrivadaDeAprovacao: r.aprovacao.chavePrivada, objeto: o.id, autor: r.uid, aprovadoEm: AGORA, v: '0.1' })
  assert.equal(velha.v, '0.1')
  assert.equal(v(velha).ok, true)
  assert.equal(aprovar(r, o).v, '0.3')
  assert.equal(v({ ...velha, v: '0.2' }).erro.codigo, 'aprovacao_invalida')
  assert.equal(v({ ...velha, v: '0.3' }).erro.codigo, 'aprovacao_invalida')
  assert.equal(v({ ...aprovar(r, o), v: '0.1' }).erro.codigo, 'aprovacao_invalida')
  assert.equal(v({ ...velha, v: '0.4' }).erro.codigo, 'esquema')
})
