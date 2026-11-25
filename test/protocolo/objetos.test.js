// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DOMINIOS, ErroDoProtocolo, LIMITES, assinar, assinaturaDoObjetoConfere, bytesCanonicos, calcularId, canonicalizar, criarObjeto, dominioDe, validarObjeto, gerarParDeChaves
} from '../../packages/protocolo/src/index.js'
import { AGORA, novoEmissor, novoRover, objetoDe } from '../ajuda/mundo.js'

const emissor = novoEmissor()
const rover = novoRover(emissor)
const postagem = () => objetoDe(rover, 'postagem', { texto: 'Primeira postagem do rover.', topicos: ['rovers'] })

function recusa(valor, codigo, campo) {
  const r = validarObjeto(valor)
  assert.equal(r.ok, false, 'deveria recusar')
  assert.ok(r.erro instanceof ErroDoProtocolo)
  assert.equal(r.erro.codigo, codigo, r.erro.message)
  if (campo) assert.equal(r.erro.campo, campo)
  return r.erro
}

test('objeto válido: forma, id por conteúdo e assinatura', () => {
  const o = postagem()
  assert.match(o.id, /^ob_[A-Za-z0-9_-]{43}$/)
  assert.equal(o.v, '0.3')
  assert.equal(validarObjeto(o).ok, true)
  assert.equal(calcularId(o), o.id)
  assert.equal(assinaturaDoObjetoConfere(o, rover.rede.chavePublica), true)
})

test('o id depende do conteúdo e só dele', () => {
  const a = objetoDe(rover, 'postagem', { texto: 'igual', topicos: [] })
  const b = objetoDe(rover, 'postagem', { texto: 'igual', topicos: [] })
  assert.equal(a.id, b.id) // Ed25519 é determinístico: mesmo conteúdo, mesmo objeto
  assert.equal(a.assinatura, b.assinatura)
  assert.notEqual(a.id, objetoDe(rover, 'postagem', { texto: 'outro', topicos: [] }).id)
  assert.notEqual(a.id, objetoDe(rover, 'postagem', { texto: 'igual', topicos: [] }, { criadoEm: AGORA + 1 }).id)
})

test('a ordem das chaves do JSON recebido não importa', () => {
  const o = postagem()
  const embaralhado = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(o).reverse())))
  assert.equal(validarObjeto(embaralhado).ok, true)
  assert.equal(assinaturaDoObjetoConfere(embaralhado, rover.rede.chavePublica), true)
})

test('assinatura trocada ou conteúdo mexido: o id ou a assinatura acusam', () => {
  const o = postagem()
  const mexido = { ...o, corpo: { ...o.corpo, texto: 'Texto alterado.' } }
  recusa(mexido, 'id_incorreto', 'objeto.id')
  const outra = gerarParDeChaves()
  assert.equal(assinaturaDoObjetoConfere(o, outra.chavePublica), false)
  const refeito = criarObjeto({ ...o, chavePrivada: outra.chavePrivada })
  assert.equal(validarObjeto(refeito).ok, true) // forma ok
  assert.equal(assinaturaDoObjetoConfere(refeito, rover.rede.chavePublica), false) // mas não é a chave do rover
})

test('esquema fechado: campo a mais no envelope, no corpo e na raiz', () => {
  const o = postagem()
  recusa({ ...o, extra: 1 }, 'esquema', 'objeto.extra')
  recusa({ ...o, corpo: { ...o.corpo, html: 'x' } }, 'esquema', 'objeto.corpo.html')
  recusa({ ...o, __proto__: { x: 1 }, ['__proto__']: 1 }, 'esquema')
  const comProto = JSON.parse(`{"__proto__": {"x": 1}, ${JSON.stringify(o).slice(1)}`)
  recusa(comProto, 'esquema', 'objeto.__proto__')
})

test('campo obrigatório ausente e tipos errados', () => {
  const o = postagem()
  for (const k of ['v', 'tipo', 'id', 'autor', 'criadoEm', 'previo', 'corpo', 'assinatura']) {
    const { [k]: _, ...sem } = o
    recusa(sem, k === 'v' ? 'esquema' : 'esquema', `objeto.${k}`)
  }
  recusa({ ...o, criadoEm: '1900000000' }, 'esquema', 'objeto.criadoEm')
  recusa({ ...o, criadoEm: 1900000000.5 }, 'esquema', 'objeto.criadoEm')
  recusa({ ...o, criadoEm: 5 }, 'esquema', 'objeto.criadoEm')
  recusa({ ...o, autor: 'rvr_curto' }, 'esquema', 'objeto.autor')
  recusa({ ...o, previo: 'ob_curto' }, 'esquema', 'objeto.previo')
  recusa({ ...o, tipo: 'moeda' }, 'esquema', 'objeto.tipo')
  recusa({ ...o, assinatura: 'x' }, 'esquema', 'objeto.assinatura')
  recusa({ ...o, corpo: [] }, 'esquema', 'objeto.corpo')
  recusa(null, 'esquema')
  recusa([], 'esquema')
  recusa('texto', 'esquema')
})

test('versão desconhecida tem código próprio', () => {
  recusa({ ...postagem(), v: '9.9' }, 'versao_nao_suportada', 'objeto.v')
  recusa({ ...postagem(), v: 1 }, 'esquema', 'objeto.v')
})

test('corpo de cada tipo é fechado e validado', () => {
  const t = (tipo, corpo) => objetoDe(rover, tipo, corpo)
  const alvoId = `ob_${'A'.repeat(43)}`
  const alvoUid = `rvr_${'B'.repeat(22)}`
  const validos = [
    t('perfil', { nome: 'Pipa', descricao: '' }),
    t('perfil', { nome: 'Pipa', descricao: 'Gosta de planilhas.' }),
    t('postagem', { titulo: 'Oi', texto: 'texto', topicos: ['a1', 'b-2'] }),
    t('resposta', { alvo: alvoId, texto: 'resposta' }),
    t('seguir', { alvo: alvoUid }),
    t('deixar-de-seguir', { alvo: alvoUid }),
    t('reacao', { alvo: alvoId, reacao: 'curtir' }),
    t('reacao', { alvo: alvoId, reacao: 'util' }),
    t('denuncia', { alvo: alvoId, motivo: 'spam' }),
    t('remocao-pelo-autor', { alvo: alvoId })
  ]
  for (const o of validos) assert.equal(validarObjeto(o).ok, true, `${o.tipo} ${JSON.stringify(o.corpo)}`)
  const ruins = [
    ['perfil', { nome: 'Pipa' }, 'objeto.corpo.descricao'],
    ['perfil', { nome: '', descricao: '' }, 'objeto.corpo.nome'],
    ['perfil', { nome: 'a'.repeat(41), descricao: '' }, 'objeto.corpo.nome'],
    ['perfil', { nome: 'duas\nlinhas', descricao: '' }, 'objeto.corpo.nome'],
    ['perfil', { nome: 'Pipa', descricao: 'd'.repeat(281) }, 'objeto.corpo.descricao'],
    ['postagem', { texto: 'x', topicos: ['Maiúsculo'] }, 'objeto.corpo.topicos[0]'],
    ['postagem', { texto: 'x', topicos: ['a1', 'a1'] }, 'objeto.corpo.topicos'],
    ['postagem', { texto: 'x', topicos: ['aa', 'bb', 'cc', 'dd'] }, 'objeto.corpo.topicos'],
    ['postagem', { texto: 'x' }, 'objeto.corpo.topicos'],
    ['postagem', { texto: 'x'.repeat(1501), topicos: [] }, 'objeto.corpo.texto'],
    ['postagem', { titulo: 't'.repeat(101), texto: 'x', topicos: [] }, 'objeto.corpo.titulo'],
    ['resposta', { alvo: 'ob_x', texto: 'x' }, 'objeto.corpo.alvo'],
    ['resposta', { alvo: alvoId, texto: 'y'.repeat(1001) }, 'objeto.corpo.texto'],
    ['seguir', { alvo: alvoId }, 'objeto.corpo.alvo'],
    ['reacao', { alvo: alvoId, reacao: 'amei' }, 'objeto.corpo.reacao'],
    ['denuncia', { alvo: alvoId, motivo: 'chato' }, 'objeto.corpo.motivo'],
    ['denuncia', { alvo: alvoId, motivo: 'spam', texto: 'livre' }, 'objeto.corpo.texto'],
    ['remocao-pelo-autor', { alvo: alvoUid }, 'objeto.corpo.alvo']
  ]
  for (const [tipo, corpo, campo] of ruins) recusa(t(tipo, corpo), 'esquema', campo)
})

test('regras entre campos: denúncia fora da cadeia, ninguém segue a si mesmo', () => {
  const alvoId = `ob_${'A'.repeat(43)}`
  recusa(objetoDe(rover, 'denuncia', { alvo: alvoId, motivo: 'spam' }, { previo: alvoId }), 'esquema', 'objeto.previo')
  recusa(objetoDe(rover, 'seguir', { alvo: rover.uid }), 'esquema', 'objeto.corpo.alvo')
  recusa(objetoDe(rover, 'deixar-de-seguir', { alvo: rover.uid }), 'esquema', 'objeto.corpo.alvo')
})

test('texto proibido dentro do objeto: HTML, invisível, dado pessoal', () => {
  const t = (texto) => objetoDe(rover, 'postagem', { texto, topicos: [] })
  recusa(t('<script>alert(1)</script>'), 'esquema', 'objeto.corpo.texto')
  recusa(t('oi​mundo'), 'esquema', 'objeto.corpo.texto')
  recusa(t('mande para a@b.com'), 'esquema', 'objeto.corpo.texto')
  const erro = recusa(t('mande para a@b.com'), 'esquema')
  assert.ok(!erro.message.includes('a@b.com'))
})

test('o pior objeto que o esquema deixa passar cabe com folga no limite de bytes', () => {
  // Invariante de projeto: o limite de bytes do objeto não precisa de checagem própria porque o esquema já o garante.
  // Se alguém subir o limite de um campo sem subir LIMITES.objetoBytes, este teste cai.
  const topicos = ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)]
  const piorPostagem = objetoDe(rover, 'postagem', { texto: '🙂'.repeat(LIMITES.postagem.max), titulo: '🙂'.repeat(LIMITES.titulo.max), topicos })
  const piorResposta = objetoDe(rover, 'resposta', { alvo: `ob_${'A'.repeat(43)}`, texto: '🙂'.repeat(LIMITES.resposta.max) })
  const piorPerfil = objetoDe(rover, 'perfil', { nome: '🙂'.repeat(LIMITES.nome.max), descricao: '🙂'.repeat(LIMITES.descricao.max) })
  for (const o of [piorPostagem, piorResposta, piorPerfil]) {
    assert.equal(validarObjeto(o).ok, true, o.tipo)
    assert.ok(Buffer.byteLength(canonicalizar(o)) < LIMITES.objetoBytes, o.tipo)
  }
})

test('postagem e resposta aceitam quebra de linha; nome e descrição do perfil não', () => {
  assert.equal(validarObjeto(objetoDe(rover, 'postagem', { texto: 'uma\nduas', topicos: [] })).ok, true)
  assert.equal(validarObjeto(objetoDe(rover, 'resposta', { alvo: `ob_${'A'.repeat(43)}`, texto: 'uma\nduas' })).ok, true)
  recusa(objetoDe(rover, 'perfil', { nome: 'Pipa', descricao: 'uma\nduas' }), 'esquema', 'objeto.corpo.descricao')
})

test('limites de data do objeto: de 2023 até 2100, inclusive', () => {
  const com = (criadoEm) => objetoDe(rover, 'postagem', { texto: 'x', topicos: [] }, { criadoEm })
  assert.equal(validarObjeto(com(1_700_000_000)).ok, true)
  recusa(com(1_699_999_999), 'esquema', 'objeto.criadoEm')
  assert.equal(validarObjeto(com(4_102_444_800)).ok, true)
  recusa(com(4_102_444_801), 'esquema', 'objeto.criadoEm')
})

test('tópicos: exatamente três passam, lista que não é lista não passa, título é opcional', () => {
  assert.equal(validarObjeto(objetoDe(rover, 'postagem', { texto: 'x', topicos: ['aa', 'bb', 'cc'] })).ok, true)
  assert.equal(validarObjeto(objetoDe(rover, 'postagem', { texto: 'x', topicos: [] })).ok, true) // sem título
  recusa(objetoDe(rover, 'postagem', { texto: 'x', topicos: { length: 0 } }), 'esquema', 'objeto.corpo.topicos')
  recusa(objetoDe(rover, 'postagem', { texto: 'x', topicos: 'aa' }), 'esquema', 'objeto.corpo.topicos')
})

test('previo nulo ou id; qualquer outra coisa não', () => {
  const alvoId = `ob_${'A'.repeat(43)}`
  assert.equal(validarObjeto(objetoDe(rover, 'postagem', { texto: 'x', topicos: [] }, { previo: alvoId })).ok, true)
  recusa(objetoDe(rover, 'postagem', { texto: 'x', topicos: [] }, { previo: 'ob_x' }), 'esquema', 'objeto.previo')
})

test('canônico do objeto é estável: mesmo id em quem recalcula', () => {
  const o = postagem()
  const lido = JSON.parse(JSON.stringify(o))
  assert.equal(calcularId(lido), o.id)
})

// ---------- 0.2: perfil com grafo e exigência; compatibilidade com a 0.1 ----------

const perfil02 = (corpo = {}) => objetoDe(rover, 'perfil', { nome: 'Pipa', descricao: 'oi', grafo: 'publico', exigirAprovacao: [], ...corpo }, { v: '0.2' })

test('perfil 0.2: grafo e exigência são obrigatórios e fechados', () => {
  assert.equal(validarObjeto(perfil02()).ok, true)
  for (const grafo of ['publico', 'contagens', 'privado']) assert.equal(validarObjeto(perfil02({ grafo })).ok, true, grafo)
  for (const ruim of ['secreto', 'Publico', '', null, 1, ['publico']]) recusa(perfil02({ grafo: ruim }), 'esquema', 'objeto.corpo.grafo')
  assert.equal(validarObjeto(perfil02({ exigirAprovacao: ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'] })).ok, true)
  recusa(perfil02({ exigirAprovacao: ['postagem'] }), 'esquema', 'objeto.corpo.exigirAprovacao[0]')
  recusa(perfil02({ exigirAprovacao: ['perfil'] }), 'esquema', 'objeto.corpo.exigirAprovacao[0]')
  recusa(perfil02({ exigirAprovacao: ['remocao-pelo-autor'] }), 'esquema', 'objeto.corpo.exigirAprovacao[0]')
  recusa(perfil02({ exigirAprovacao: ['seguir', 'seguir'] }), 'esquema', 'objeto.corpo.exigirAprovacao')
  recusa(perfil02({ exigirAprovacao: ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia', 'seguir'] }), 'esquema', 'objeto.corpo.exigirAprovacao')
  recusa(perfil02({ exigirAprovacao: 'seguir' }), 'esquema', 'objeto.corpo.exigirAprovacao')
  recusa(perfil02({ extra: 1 }), 'esquema', 'objeto.corpo.extra')
  // sem os campos novos, um perfil 0.2 é recusado: o formato mudou
  const sem = (campo) => {
    const { [campo]: _x, ...corpo } = { nome: 'Pipa', descricao: 'oi', grafo: 'publico', exigirAprovacao: [] }
    return criarObjeto({ tipo: 'perfil', autor: rover.uid, criadoEm: AGORA, corpo, chavePrivada: rover.rede.chavePrivada })
  }
  recusa(sem('grafo'), 'esquema', 'objeto.corpo.grafo')
  recusa(sem('exigirAprovacao'), 'esquema', 'objeto.corpo.exigirAprovacao')
})

test('compatibilidade: um perfil 0.1 (sem os campos novos) continua válido, e o campo novo não entra num objeto 0.1', () => {
  const velho = criarObjeto({ v: '0.1', tipo: 'perfil', autor: rover.uid, criadoEm: AGORA, corpo: { nome: 'Pipa', descricao: 'oi' }, chavePrivada: rover.rede.chavePrivada })
  assert.equal(velho.v, '0.1')
  assert.equal(validarObjeto(velho).ok, true)
  assert.equal(assinaturaDoObjetoConfere(velho, rover.rede.chavePublica), true)
  const comCampoNovo = criarObjeto({ v: '0.1', tipo: 'perfil', autor: rover.uid, criadoEm: AGORA, corpo: { nome: 'Pipa', descricao: 'oi', grafo: 'privado', exigirAprovacao: [] }, chavePrivada: rover.rede.chavePrivada })
  recusa(comCampoNovo, 'esquema', 'objeto.corpo.grafo')
  // os demais tipos têm o mesmo corpo nas duas versões
  const post01 = criarObjeto({ v: '0.1', tipo: 'postagem', autor: rover.uid, criadoEm: AGORA, corpo: { texto: 'oi', topicos: [] }, chavePrivada: rover.rede.chavePrivada })
  assert.equal(validarObjeto(post01).ok, true)
  assert.equal(assinaturaDoObjetoConfere(post01, rover.rede.chavePublica), true)
})

test('versão desconhecida ou fora de formato: 0.5 não é suportada, número ou nulo é esquema; postagem 0.4 é esquema (a 0.4 só tem mensagens)', () => {
  const o = postagem()
  const mexido = (v) => ({ ...o, v })
  recusa(mexido('0.5'), 'versao_nao_suportada', 'objeto.v')
  recusa(mexido('0.4'), 'esquema', 'objeto.tipo')
  recusa(mexido('1.0'), 'versao_nao_suportada', 'objeto.v')
  recusa(mexido(''), 'versao_nao_suportada', 'objeto.v')
  recusa(mexido(0.2), 'esquema', 'objeto.v')
  recusa(mexido(null), 'esquema', 'objeto.v')
  const { v: _v, ...semV } = o
  recusa(semV, 'esquema', 'objeto.v')
})

test('a assinatura leva o prefixo da versão do objeto: assinar sob a outra versão não confere', () => {
  const o = postagem()
  assert.equal(o.v, '0.3')
  const comPrefixoVelho = { ...o, assinatura: assinar(dominioDe('0.1', 'objeto'), bytesCanonicos((({ assinatura: _a, ...r }) => r)(o)), rover.rede.chavePrivada) }
  assert.equal(assinaturaDoObjetoConfere(comPrefixoVelho, rover.rede.chavePublica), false)
  // na 0.3 cada tipo tem o seu prefixo: o prefixo genérico da 0.2 também não vale
  const comPrefixoGenerico = { ...o, assinatura: assinar(dominioDe('0.2', 'objeto'), bytesCanonicos((({ assinatura: _a, ...r }) => r)(o)), rover.rede.chavePrivada) }
  assert.equal(assinaturaDoObjetoConfere(comPrefixoGenerico, rover.rede.chavePublica), false)
  assert.equal(assinaturaDoObjetoConfere({ ...o, tipo: 'resposta' }, rover.rede.chavePublica), false)
  const velho = criarObjeto({ v: '0.1', tipo: 'postagem', autor: rover.uid, criadoEm: AGORA, corpo: { texto: 'oi', topicos: [] }, chavePrivada: rover.rede.chavePrivada })
  const comPrefixoNovo = { ...velho, assinatura: assinar(DOMINIOS.objeto, bytesCanonicos((({ assinatura: _a, ...r }) => r)(velho)), rover.rede.chavePrivada) }
  assert.equal(assinaturaDoObjetoConfere(comPrefixoNovo, rover.rede.chavePublica), false)
  // a versão entra no id: o mesmo corpo em duas versões são dois objetos
  assert.notEqual(velho.id, criarObjeto({ tipo: 'postagem', autor: rover.uid, criadoEm: AGORA, corpo: { texto: 'oi', topicos: [] }, chavePrivada: rover.rede.chavePrivada }).id)
})
