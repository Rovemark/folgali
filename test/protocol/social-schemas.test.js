// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.3 schemas: every new type is closed, signed under its own domain prefix, and exists only in "0.3".
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REQUIRES_APPROVAL, ProtocolError, LIMITS, SOCIAL_LIMITS as L, LEGACY_TYPES, OBJECT_TYPES, REQUIRABLE_TYPES_V2, REQUIRABLE_TYPES_V3,
  SOCIAL_TYPES, signBytes, objectSignatureMatches, canonicalBytes, canonicalize, nameKey, bodyOf, createObject, domainOf, objectDomain,
  crossFieldRules, typeExistsInVersion, validateObject
} from '../../packages/protocol/src/index.js'
import { NOW, newIssuer, newRover } from '../helpers/world.js'

const rover = newRover(newIssuer())
const other = newRover(newIssuer())
const ID = `ob_${'A'.repeat(43)}`
const ID2 = `ob_${'B'.repeat(43)}`

/** A valid body for each social type. */
const VALID = {
  estado: { estado: 'trabalhando' },
  recado: { alvo: other.uid, texto: 'Oi! Passei para dizer que gostei do seu trabalho.' },
  amizade: { alvo: other.uid, acao: 'pedir' },
  depoimento: { alvo: other.uid, texto: 'Trabalha com capricho e entrega no prazo.' },
  'depoimento-decisao': { depoimento: ID, decisao: 'aceitar' },
  selo: { alvo: other.uid, selo: 'confiavel' },
  relacao: { alvo: other.uid, acao: 'bloquear' },
  entrega: { titulo: 'Planilha de custos', descricao: 'Organizei os custos da semana por categoria.', resultado: 'O gasto fixo ficou visível.', tags: ['planilhas'] },
  'comunidade-criar': { nome: 'Planilhas e prazos', descricao: 'Troca de ideias', regras: 'Sem spam.', tema: 'produtividade', acesso: 'aberta', categorias: ['Dúvidas', 'Dicas'] },
  'comunidade-atualizar': { comunidade: ID, nome: 'Planilhas e prazos', descricao: 'Troca de ideias', regras: 'Sem spam.', tema: 'produtividade', acesso: 'moderada', categorias: [] },
  'comunidade-adesao': { comunidade: ID, acao: 'entrar' },
  'comunidade-gestao': { comunidade: ID, alvo: other.uid, acao: 'banir', motivo: 'spam' },
  'denuncia-dispensar': { comunidade: ID, alvo: ID2 },
  'comunidade-vocabulario': {
    comunidade: ID,
    etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }, { chave: 'duvida', rotulo: 'Dúvida', cor: 'azul' }],
    status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }, { chave: 'em-andamento', rotulo: 'Em andamento', cor: 'ambar', categorias: ['Dúvidas'] }]
  },
  'comunidade-posse': { comunidade: ID, acao: 'transferir', novoDono: other.uid },
  topico: { comunidade: ID, categoria: null, titulo: 'Qual a melhor forma de organizar?', texto: 'Uso uma lista só e funciona.', tags: ['organizacao'], enquete: null },
  'topico-editar': { topico: ID, titulo: 'Qual a melhor forma de organizar?', texto: 'Corrigi um erro.', tags: [] },
  'resposta-forum': { topico: ID, em: null, cita: null, texto: 'Eu faço assim, com uma lista.' },
  'topico-gestao': { topico: ID, acao: 'fixar', comunidade: null, categoria: null },
  'topico-marca': { topico: ID, etiquetas: ['bug'], status: 'aberto' },
  'topico-resolvido': { topico: ID, resposta: ID2 },
  voto: { topico: ID, opcao: 1 },
  'pagina-criar': { nome: 'Fãs de planilha', descricao: 'Novidades', tema: 'planilhas' },
  'pagina-atualizar': { pagina: ID, nome: 'Fãs de planilha', descricao: 'Novidades', tema: 'planilhas' },
  'pagina-publicar': { pagina: ID, texto: 'Saiu a versão nova.', tags: [] },
  'pagina-seguir': { pagina: ID, acao: 'seguir' },
  'pagina-gestao': { pagina: ID, alvo: other.uid, acao: 'adicionar-admin' },
  'remocao-por-responsavel': { alvo: ID, motivo: 'spam' },
  apelacao: { tipo: 'remocao', alvo: ID, texto: 'Acho que foi um engano.' },
  'apelacao-decisao': { apelacao: ID, resultado: 'revertida' },
  // 0.10.0 (proposal 0012)
  seta: { alvo: ID, direcao: 'acima' },
  'dono-humano': { rover: other.uid, acao: 'mostrar', prova: { tipo: 'prova-de-dono', pessoa: rover.uid, rover: other.uid, emitidaEm: NOW, assinatura: 'A'.repeat(86) } },
  // 0.11.0 part 2: the whole new content of a publication
  edicao: { alvo: ID, titulo: null, texto: 'Texto corrigido.', tags: [] },
  // 0.11.0 part 4: events
  'evento-criar': { comunidade: null, titulo: 'Piquenique', descricao: 'Tragam fruta.', inicio: NOW + 86400, fim: null, fuso: 'America/Sao_Paulo', online: false, lugar: 'Parque da cidade', capa: null, vagas: null },
  'evento-editar': { evento: ID, titulo: 'Piquenique', descricao: 'Tragam fruta.', inicio: NOW + 86400, fim: null, fuso: 'America/Sao_Paulo', online: false, lugar: 'Parque da cidade', capa: null, vagas: null },
  'evento-cancelar': { evento: ID },
  'evento-presenca': { evento: ID, resposta: 'vou' },
}

/** Text of exactly n characters, with spaces (a sequence of 40 letters without spaces would be blocked by the secrets filter). */
const fills = (n) => {
  const t = 'abcd '.repeat(Math.ceil(n / 5)).slice(0, n)
  return t.endsWith(' ') ? `${t.slice(0, -1)}x` : t
}

const object = (type, body = VALID[type], extra = {}) =>
  createObject({ tipo: type, autor: rover.uid, criadoEm: NOW, corpo: body, chavePrivada: rover.rede.chavePrivada, ...extra })
const refusal = (o, field) => {
  const r = validateObject(o)
  assert.equal(r.ok, false, `should refuse ${field}`)
  assert.ok(r.erro instanceof ProtocolError)
  assert.equal(r.erro.codigo, 'esquema', r.erro.message)
  if (field) assert.equal(r.erro.campo, field)
  return r.erro
}

test('there are exactly 37 social types, all with a sample body, and the type list is the sum of the old and the new ones', () => {
  assert.equal(SOCIAL_TYPES.length, 37) // 0.10.0: seta and dono-humano; 0.11.0: edicao and the four event types
  assert.deepEqual(Object.keys(VALID).sort(), [...SOCIAL_TYPES].sort())
  // 0.5.0: media (proposal 0005) goes at the end, in its own block
  // 0.11.0 part 3: video joins the media block
  assert.deepEqual([...OBJECT_TYPES], [...LEGACY_TYPES, ...SOCIAL_TYPES, 'imagem', 'video'])
  assert.equal(new Set(OBJECT_TYPES).size, OBJECT_TYPES.length)
})

for (const type of SOCIAL_TYPES) {
  test(`${type}: valid body, closed, signed under its own prefix and exists only in 0.3`, () => {
    const o = object(type)
    assert.equal(o.v, '0.3')
    assert.equal(validateObject(o).ok, true, validateObject(o).erro?.message)
    assert.equal(objectSignatureMatches(o, rover.rede.publicKey), true)
    assert.equal(objectSignatureMatches(o, other.rede.publicKey), false)
    // extra field and missing field
    refusal(object(type, { ...VALID[type], extra: 1 }), 'objeto.corpo.extra')
    for (const field of Object.keys(VALID[type])) {
      const { [field]: _x, ...without } = VALID[type]
      refusal(object(type, without), `objeto.corpo.${field}`)
    }
    // the prefix belongs to the type: the same signature is not valid with another domain prefix, nor under the label of another type
    assert.equal(objectDomain('0.3', type), `rover-network/0.3/objeto/${type}\n`)
    const without = (({ assinatura: _a, ...r }) => r)(o)
    for (const domain of [domainOf('0.3', 'objeto'), domainOf('0.2', 'objeto'), objectDomain('0.3', type === 'estado' ? 'recado' : 'estado')]) {
      const swapped = { ...o, assinatura: signBytes(domain, canonicalBytes(without), rover.rede.chavePrivada) }
      assert.equal(objectSignatureMatches(swapped, rover.rede.publicKey), false)
    }
    // in 0.2 and 0.1 the type does not exist
    for (const v of ['0.2', '0.1']) {
      assert.equal(typeExistsInVersion(type, v), false)
      refusal(object(type, VALID[type], { v }), 'objeto.tipo')
    }
    assert.equal(typeExistsInVersion(type, '0.3'), true)
    // the body is not an object, it is a list or null
    for (const bad of [null, [], 'x', 1]) refusal(object(type, bad), 'objeto.corpo')
  })
}

test('each type has a defined approval rule and the free ones are the 18 requirable plus the eight that are never required', () => {
  for (const t of OBJECT_TYPES) assert.equal(typeof REQUIRES_APPROVAL[t], 'boolean', t)
  assert.equal(REQUIRABLE_TYPES_V3.length, 18)
  assert.deepEqual([...REQUIRABLE_TYPES_V2], ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'])
  for (const t of REQUIRABLE_TYPES_V3) assert.equal(REQUIRES_APPROVAL[t], false, t)
  assert.equal(REQUIRABLE_TYPES_V3.includes('remocao-pelo-autor'), false)
  // 0.3.1 adds a free type that does NOT go into the list that validates the signed person declarations: a 0.3 relay must not
  // start rejecting a policy because of it (the revision only adds).
  assert.equal(REQUIRES_APPROVAL['denuncia-dispensar'], false)
  assert.equal(REQUIRABLE_TYPES_V3.includes('denuncia-dispensar'), false)
  // 0.3.2 does the same with the topic mark (free) and the vocabulary (asks for approval): neither goes into the 18 requirable ones.
  assert.equal(REQUIRES_APPROVAL['topico-marca'], false)
  assert.equal(REQUIRES_APPROVAL['comunidade-vocabulario'], true)
  assert.equal(REQUIRABLE_TYPES_V3.includes('topico-marca'), false)
  assert.equal(REQUIRABLE_TYPES_V3.includes('comunidade-vocabulario'), false)
  const free = OBJECT_TYPES.filter((t) => REQUIRES_APPROVAL[t] === false)
  // 0.10.0: seta and dono-humano are free and, like the 0.3.1 and 0.3.2 additions, stay out of the signed-policy list
  // 0.11.0 (proposal 0013): imagem became free (media needs no approval per use) and stays out of the signed-policy list too
  assert.equal(REQUIRES_APPROVAL.imagem, false)
  assert.equal(REQUIRABLE_TYPES_V3.includes('imagem'), false)
  assert.deepEqual(free.filter((t) => !REQUIRABLE_TYPES_V3.includes(t)).sort(), ['denuncia-dispensar', 'dono-humano', 'evento-presenca', 'imagem', 'remocao-pelo-autor', 'seta', 'topico-marca', 'video'])
  const approve = OBJECT_TYPES.filter((t) => REQUIRES_APPROVAL[t])
  assert.deepEqual(approve.sort(), [
    'apelacao', 'comunidade-atualizar', 'comunidade-criar', 'comunidade-posse', 'comunidade-vocabulario', 'depoimento', 'edicao', 'entrega', 'evento-cancelar', 'evento-criar', 'evento-editar', 'pagina-atualizar', 'pagina-criar',
    'pagina-publicar', 'perfil', 'postagem', 'recado', 'resposta', 'resposta-forum', 'topico', 'topico-editar'
  ].sort())
})

test('the widest object of each text type fits in the 12288 object bytes and in the 16 KiB HTTP body', () => {
  const e = '🙂'
  const full = (n) => e.repeat(n)
  const worst = [
    object('topico', { comunidade: ID, categoria: full(L.categoria.max), titulo: full(L.topicoTitulo.max), texto: full(L.topicoTexto.max), tags: ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24), 'd'.repeat(24), 'e'.repeat(24)], enquete: { opcoes: Array.from({ length: 6 }, (_, i) => full(L.enqueteOpcao.max - 1) + String(i)), encerraEm: NOW + 86400 } }),
    object('topico-editar', { topico: ID, titulo: full(L.topicoTitulo.max), texto: full(L.topicoTexto.max), tags: ['a'.repeat(24)] }),
    object('resposta-forum', { topico: ID, em: ID2, cita: ID, texto: full(L.respostaForum.max) }),
    object('recado', { alvo: other.uid, texto: full(L.recado.max) }),
    object('depoimento', { alvo: other.uid, texto: full(L.depoimento.max) }),
    object('entrega', { titulo: full(L.deliveryTitle.max), descricao: full(L.deliveryDescription.max), resultado: full(L.deliveryResult.max), tags: ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)] }),
    object('comunidade-criar', { nome: full(L.comunidadeNome.max), descricao: full(L.comunidadeDescricao.max), regras: full(L.comunidadeRegras.max), tema: 'a'.repeat(24), acesso: 'fechada', categorias: Array.from({ length: 8 }, (_, i) => full(L.categoria.max - 1) + String(i)) }),
    object('pagina-publicar', { pagina: ID, titulo: full(LIMITS.titulo.max), texto: full(L.pageText.max), tags: ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)] }),
    object('apelacao', { tipo: 'banimento', alvo: ID, texto: full(L.apelacao.max) }),
    object('perfil', { nome: full(LIMITS.nome.max), descricao: full(LIMITS.descricao.max), grafo: 'privado', exigirAprovacao: [...REQUIRABLE_TYPES_V3], sobre: full(L.sobre.max), habilidades: Array.from({ length: 8 }, (_, i) => `${'h'.repeat(23)}${i}`), interesses: Array.from({ length: 8 }, (_, i) => `${'i'.repeat(23)}${i}`), retrato: { corpo: 'a'.repeat(24), cor: 'b'.repeat(24), veste: 'c'.repeat(24), acessorio: 'd'.repeat(24) }, recados: 'amigos', listado: false })
  ]
  for (const o of worst) {
    assert.equal(validateObject(o).ok, true, `${o.tipo}: ${validateObject(o).erro?.message}`)
    const bytes = Buffer.byteLength(canonicalize(o))
    assert.ok(bytes < LIMITS.objetoBytes, `${o.tipo} has ${bytes} bytes`)
    // with the attestation (about 600 bytes) and the approval (about 450) it still fits in the HTTP body
    assert.ok(bytes + 1500 < LIMITS.corpoHttpBytes, `${o.tipo} leaves no room for attestation and approval`)
  }
})

// ---------- text limits, one by one ----------

const limits = [
  ['recado', 'texto', L.recado], ['depoimento', 'texto', L.depoimento], ['topico', 'titulo', L.topicoTitulo], ['topico', 'texto', L.topicoTexto],
  ['topico-editar', 'titulo', L.topicoTitulo], ['topico-editar', 'texto', L.topicoTexto], ['resposta-forum', 'texto', L.respostaForum],
  ['entrega', 'titulo', L.deliveryTitle], ['entrega', 'descricao', L.deliveryDescription], ['entrega', 'resultado', L.deliveryResult],
  ['comunidade-criar', 'nome', L.comunidadeNome], ['comunidade-criar', 'descricao', L.comunidadeDescricao], ['comunidade-criar', 'regras', L.comunidadeRegras],
  ['pagina-criar', 'nome', L.pageName], ['pagina-criar', 'descricao', L.pageDescription], ['pagina-publicar', 'texto', L.pageText],
  ['apelacao', 'texto', L.apelacao], ['pagina-atualizar', 'nome', L.pageName]
]
for (const [type, field, { min, max }] of limits) {
  test(`${type}.${field}: from ${min} to ${max} characters, at the exact limits`, () => {
    const using = (text) => object(type, { ...VALID[type], [field]: text })
    assert.equal(validateObject(using(fills(max))).ok, true, 'at the maximum')
    refusal(using(fills(max + 1)), `objeto.corpo.${field}`)
    if (min > 0) {
      assert.equal(validateObject(using(fills(min))).ok, true, 'at the minimum')
      refusal(using(fills(min - 1)), `objeto.corpo.${field}`)
    } else assert.equal(validateObject(using('')).ok, true, 'empty is valid')
  })
}

test('list limits: categories (8), topic tags (5), page tags (3), delivery tags (3), poll options (2 to 6)', () => {
  const cat = (n) => Array.from({ length: n }, (_, i) => `Categoria ${i}`)
  assert.equal(validateObject(object('comunidade-criar', { ...VALID['comunidade-criar'], categorias: cat(8) })).ok, true)
  refusal(object('comunidade-criar', { ...VALID['comunidade-criar'], categorias: cat(9) }), 'objeto.corpo.categorias')
  const tags = (n) => Array.from({ length: n }, (_, i) => `tag-${i}`)
  assert.equal(validateObject(object('topico', { ...VALID.topico, tags: tags(5) })).ok, true)
  refusal(object('topico', { ...VALID.topico, tags: tags(6) }), 'objeto.corpo.tags')
  refusal(object('topico', { ...VALID.topico, tags: ['igual', 'igual'] }), 'objeto.corpo.tags')
  refusal(object('topico', { ...VALID.topico, tags: ['Maiuscula'] }), 'objeto.corpo.tags[0]')
  assert.equal(validateObject(object('pagina-publicar', { ...VALID['pagina-publicar'], tags: tags(3) })).ok, true)
  refusal(object('pagina-publicar', { ...VALID['pagina-publicar'], tags: tags(4) }), 'objeto.corpo.tags')
  assert.equal(validateObject(object('entrega', { ...VALID.entrega, tags: tags(3) })).ok, true)
  refusal(object('entrega', { ...VALID.entrega, tags: tags(4) }), 'objeto.corpo.tags')
  const rawPoll = (n, extra = {}) => ({ opcoes: Array.from({ length: n }, (_, i) => `Opção ${i}`), encerraEm: NOW + 7200, ...extra })
  assert.equal(validateObject(object('topico', { ...VALID.topico, enquete: rawPoll(2) })).ok, true)
  assert.equal(validateObject(object('topico', { ...VALID.topico, enquete: rawPoll(6) })).ok, true)
  refusal(object('topico', { ...VALID.topico, enquete: rawPoll(1) }), 'objeto.corpo.enquete.opcoes')
  refusal(object('topico', { ...VALID.topico, enquete: rawPoll(7) }), 'objeto.corpo.enquete.opcoes')
  refusal(object('topico', { ...VALID.topico, enquete: rawPoll(2, { extra: 1 }) }), 'objeto.corpo.enquete.extra')
})

// ---------- cross-field rules ----------

test('poll: lasts from 1 hour to 30 days, with no repeated options', () => {
  const using = (endsAt, options = ['sim', 'não']) => object('topico', { ...VALID.topico, enquete: { opcoes: options, encerraEm: endsAt } })
  assert.equal(validateObject(using(NOW + 3600)).ok, true)
  assert.equal(validateObject(using(NOW + 30 * 86400)).ok, true)
  refusal(using(NOW + 3599), 'objeto.corpo.enquete.encerraEm')
  refusal(using(NOW + 30 * 86400 + 1), 'objeto.corpo.enquete.encerraEm')
  refusal(using(NOW - 5), 'objeto.corpo.enquete.encerraEm')
  refusal(using(NOW + 7200, ['Sim', 'sim']), 'objeto.corpo.enquete.opcoes')
  refusal(using(NOW + 7200, ['Café', 'cafe']), 'objeto.corpo.enquete.opcoes')
})

test('the categories of a community do not repeat, ignoring case and accents', () => {
  const using = (categories) => object('comunidade-criar', { ...VALID['comunidade-criar'], categorias: categories })
  assert.equal(validateObject(using(['Dúvidas', 'Dicas'])).ok, true)
  refusal(using(['Dúvidas', 'duvidas']), 'objeto.corpo.categorias')
  refusal(using(['Dicas', 'DICAS']), 'objeto.corpo.categorias')
  refusal(object('comunidade-atualizar', { ...VALID['comunidade-atualizar'], categorias: ['A b', 'a-b'] }), 'objeto.corpo.categorias')
  assert.equal(nameKey('Planilhas & Prazos!'), nameKey('planilhas prazos'))
  assert.notEqual(nameKey('Planilhas'), nameKey('Planilha'))
})

test('a rover cannot do this to itself: note, friendship, testimonial, badge, relation, management', () => {
  for (const type of ['recado', 'amizade', 'depoimento', 'selo', 'relacao', 'comunidade-gestao', 'pagina-gestao']) {
    refusal(object(type, { ...VALID[type], alvo: rover.uid }), 'objeto.corpo.alvo')
  }
  refusal(object('comunidade-posse', { ...VALID['comunidade-posse'], novoDono: rover.uid }), 'objeto.corpo.novoDono')
})

test('community management: kick and ban require a reason; the other actions carry no reason', () => {
  const g = (action, reason) => object('comunidade-gestao', { comunidade: ID, alvo: other.uid, acao: action, motivo: reason })
  for (const a of ['expulsar', 'banir']) {
    assert.equal(validateObject(g(a, 'assedio')).ok, true, a)
    refusal(g(a, null), 'objeto.corpo.motivo')
  }
  for (const a of ['convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'desbanir', 'promover', 'rebaixar']) {
    assert.equal(validateObject(g(a, null)).ok, true, a)
    refusal(g(a, 'spam'), 'objeto.corpo.motivo')
  }
  refusal(g('banir', 'texto livre'), 'objeto.corpo.motivo')
  refusal(g('banir', 'outra coisa'), 'objeto.corpo.motivo')
  refusal(g('apagar', null), 'objeto.corpo.acao')
})

test('ownership: transfer requires the new owner, closing does not carry one', () => {
  const p = (action, newOwner) => object('comunidade-posse', { comunidade: ID, acao: action, novoDono: newOwner })
  assert.equal(validateObject(p('transferir', other.uid)).ok, true)
  assert.equal(validateObject(p('encerrar', null)).ok, true)
  refusal(p('transferir', null), 'objeto.corpo.novoDono')
  refusal(p('encerrar', other.uid), 'objeto.corpo.novoDono')
  refusal(p('vender', null), 'objeto.corpo.acao')
})

test('topic management: move carries a community (and category); the other actions carry neither', () => {
  const g = (action, community, category) => object('topico-gestao', { topico: ID, acao: action, comunidade: community, categoria: category })
  assert.equal(validateObject(g('mover', ID2, null)).ok, true)
  assert.equal(validateObject(g('mover', ID2, 'Dicas')).ok, true)
  refusal(g('mover', null, null), 'objeto.corpo.comunidade')
  for (const a of ['fixar', 'desafixar', 'trancar', 'destrancar']) {
    assert.equal(validateObject(g(a, null, null)).ok, true, a)
    refusal(g(a, ID2, null), 'objeto.corpo.comunidade')
    refusal(g(a, null, 'Dicas'), 'objeto.corpo.comunidade')
  }
})

test('vote: option from 0 to 5, an integer', () => {
  for (const ok of [0, 5]) assert.equal(validateObject(object('voto', { topico: ID, opcao: ok })).ok, true)
  for (const bad of [-1, 6, '1', null]) refusal(object('voto', { topico: ID, opcao: bad }), 'objeto.corpo.opcao')
})

test('closed enums: status, badge, access, actions, reasons, decisions, appeal types', () => {
  refusal(object('estado', { estado: 'feliz' }), 'objeto.corpo.estado')
  refusal(object('selo', { alvo: other.uid, selo: 'sexy' }), 'objeto.corpo.selo')
  refusal(object('comunidade-criar', { ...VALID['comunidade-criar'], acesso: 'secreta' }), 'objeto.corpo.acesso')
  refusal(object('amizade', { alvo: other.uid, acao: 'seguir' }), 'objeto.corpo.acao')
  refusal(object('relacao', { alvo: other.uid, acao: 'ignorar' }), 'objeto.corpo.acao')
  refusal(object('depoimento-decisao', { depoimento: ID, decisao: 'talvez' }), 'objeto.corpo.decisao')
  refusal(object('remocao-por-responsavel', { alvo: ID, motivo: 'golpe' }), 'objeto.corpo.motivo')
  refusal(object('apelacao', { tipo: 'outro', alvo: ID, texto: 'x' }), 'objeto.corpo.tipo')
  refusal(object('apelacao-decisao', { apelacao: ID, resultado: 'adiada' }), 'objeto.corpo.resultado')
  refusal(object('pagina-seguir', { pagina: ID, acao: 'deixar-de-seguir' }), 'objeto.corpo.acao')
  refusal(object('pagina-gestao', { pagina: ID, alvo: other.uid, acao: 'transferir' }), 'objeto.corpo.acao')
  for (const s of ['confiavel', 'caprichoso', 'rapido', 'divertido']) assert.equal(validateObject(object('selo', { alvo: other.uid, selo: s })).ok, true)
  for (const e of ['trabalhando', 'explorando', 'dormindo', 'disponivel', 'ausente']) assert.equal(validateObject(object('estado', { estado: e })).ok, true)
})

test('malformed ids and uids are refused in every reference field', () => {
  for (const [type, field] of [['depoimento-decisao', 'depoimento'], ['comunidade-adesao', 'comunidade'], ['topico', 'comunidade'], ['topico-editar', 'topico'], ['pagina-seguir', 'pagina'], ['remocao-por-responsavel', 'alvo'], ['apelacao', 'alvo'], ['apelacao-decisao', 'apelacao']]) {
    for (const bad of ['ob_curto', '', null, `rvr_${'A'.repeat(22)}`, `ob_${'A'.repeat(44)}`]) refusal(object(type, { ...VALID[type], [field]: bad }), `objeto.corpo.${field}`)
  }
  for (const [type, field] of [['recado', 'alvo'], ['amizade', 'alvo'], ['selo', 'alvo'], ['comunidade-gestao', 'alvo']]) {
    for (const bad of ['rvr_curto', '', null, ID]) refusal(object(type, { ...VALID[type], [field]: bad }), `objeto.corpo.${field}`)
  }
  refusal(object('resposta-forum', { ...VALID['resposta-forum'], em: 'ob_x' }), 'objeto.corpo.em')
  refusal(object('resposta-forum', { ...VALID['resposta-forum'], cita: 'ob_x' }), 'objeto.corpo.cita')
  refusal(object('topico-resolvido', { topico: ID, resposta: 'ob_x' }), 'objeto.corpo.resposta')
})

test('crossFieldRules returns null for the types with no cross-field rule', () => {
  for (const t of ['estado', 'recado', 'topico-editar', 'pagina-criar']) assert.equal(crossFieldRules({ tipo: t, autor: rover.uid, criadoEm: NOW, corpo: t === 'recado' ? VALID.recado : VALID[t] }), null, t)
})

test('the old bodies stay the same in 0.1 and 0.2 (only the profile changed), and the 0.3 ones use the new validator', () => {
  assert.notEqual(bodyOf('postagem', '0.3'), bodyOf('postagem', '0.2'))
  assert.equal(bodyOf('postagem', '0.2'), bodyOf('postagem', '0.1'))
  assert.equal(bodyOf('seguir', '0.3'), bodyOf('seguir', '0.2'))
  assert.equal(bodyOf('remocao-pelo-autor', '0.3'), bodyOf('remocao-pelo-autor', '0.1'))
  assert.notEqual(bodyOf('perfil', '0.3'), bodyOf('perfil', '0.2'))
})

// ---------- text fields: line breaks and links, field by field ----------

const BASES = {
  ...VALID,
  perfil: { nome: 'Pipa', descricao: 'oi', grafo: 'publico', exigirAprovacao: [] },
  postagem: { texto: 'um texto', topicos: [] },
  resposta: { alvo: ID, texto: 'um texto' }
}
// [type, field, accepts line breaks, how many links it accepts]
const TEXT_FIELDS = [
  ['perfil', 'nome', false, 0], ['perfil', 'descricao', false, 0], ['perfil', 'sobre', true, 1],
  ['postagem', 'titulo', false, 0], ['postagem', 'texto', true, 2], ['resposta', 'texto', true, 2],
  ['recado', 'texto', true, 1], ['depoimento', 'texto', true, 0],
  ['entrega', 'titulo', false, 0], ['entrega', 'descricao', true, 0], ['entrega', 'resultado', true, 0],
  ['comunidade-criar', 'nome', false, 0], ['comunidade-criar', 'descricao', true, 0], ['comunidade-criar', 'regras', true, 0],
  ['comunidade-atualizar', 'nome', false, 0], ['comunidade-atualizar', 'descricao', true, 0], ['comunidade-atualizar', 'regras', true, 0],
  ['topico', 'titulo', false, 0], ['topico', 'texto', true, 2], ['topico-editar', 'titulo', false, 0], ['topico-editar', 'texto', true, 2],
  ['resposta-forum', 'texto', true, 2],
  ['pagina-criar', 'nome', false, 0], ['pagina-criar', 'descricao', true, 0], ['pagina-atualizar', 'nome', false, 0], ['pagina-atualizar', 'descricao', true, 0],
  ['pagina-publicar', 'titulo', false, 0], ['pagina-publicar', 'texto', true, 2], ['apelacao', 'texto', true, 0]
]

for (const [type, field, multiline, links] of TEXT_FIELDS) {
  test(`${type}.${field}: ${multiline ? 'accepts' : 'refuses'} line breaks and accepts exactly ${links} link(s)`, () => {
    const using = (text) => object(type, { ...BASES[type], [field]: text })
    const breaks = using('uma linha\noutra linha')
    if (multiline) assert.equal(validateObject(breaks).ok, true, 'line break')
    else refusal(breaks, `objeto.corpo.${field}`)
    const link = (n) => Array.from({ length: n }, (_, i) => `https://exemplo.com/p${i}`).join(' e ')
    if (links > 0) assert.equal(validateObject(using(`veja ${link(links)}`)).ok, true, `${links} link(s)`)
    refusal(using(`veja ${link(links + 1)}`), `objeto.corpo.${field}`)
    // only https and no tracker are valid in every 0.3 text
    if (links > 0) {
      refusal(using('veja http://exemplo.com/a'), `objeto.corpo.${field}`)
      refusal(using('veja https://exemplo.com/a?utm_source=x'), `objeto.corpo.${field}`)
    }
    // too many mentions and hashtags, extended personal data
    refusal(using('@aaa @bbb @ccc @ddd @eee @fff'), `objeto.corpo.${field}`)
    refusal(using('#a1 #b2 #c3 #d4 #e5 #f6'), `objeto.corpo.${field}`)
    refusal(using('moro no 01310-100'), `objeto.corpo.${field}`)
  })
}

test('profile 0.3: unique and limited lists, portrait with fixed parts, typed notes and listed, and the new fields are optional', () => {
  const p = (extra) => object('perfil', { ...BASES.perfil, ...extra })
  assert.equal(validateObject(p({})).ok, true, 'with no new field')
  const tags = (n) => Array.from({ length: n }, (_, i) => `tag-${i}`)
  for (const field of ['habilidades', 'interesses']) {
    assert.equal(validateObject(p({ [field]: tags(8) })).ok, true, `${field} 8`)
    refusal(p({ [field]: tags(9) }), `objeto.corpo.${field}`)
    refusal(p({ [field]: ['igual', 'igual'] }), `objeto.corpo.${field}`)
    refusal(p({ [field]: ['Maiuscula'] }), `objeto.corpo.${field}[0]`)
    refusal(p({ [field]: 'texto' }), `objeto.corpo.${field}`)
  }
  refusal(p({ exigirAprovacao: ['selo', 'selo'] }), 'objeto.corpo.exigirAprovacao')
  refusal(p({ exigirAprovacao: ['perfil'] }), 'objeto.corpo.exigirAprovacao[0]')
  refusal(p({ exigirAprovacao: ['remocao-pelo-autor'] }), 'objeto.corpo.exigirAprovacao[0]')
  assert.equal(validateObject(p({ exigirAprovacao: [...REQUIRABLE_TYPES_V3] })).ok, true, 'the 18')
  refusal(p({ exigirAprovacao: [...REQUIRABLE_TYPES_V3, 'perfil'] }), 'objeto.corpo.exigirAprovacao')
  const r = (extra) => p({ retrato: { corpo: 'redondo', cor: 'azul', veste: null, acessorio: null, ...extra } })
  assert.equal(validateObject(r({})).ok, true)
  assert.equal(validateObject(r({ veste: 'colete', acessorio: 'oculos' })).ok, true)
  for (const field of ['corpo', 'cor']) refusal(r({ [field]: 'Maiuscula' }), `objeto.corpo.retrato.${field}`)
  for (const field of ['veste', 'acessorio']) refusal(r({ [field]: 'Com Espaço' }), `objeto.corpo.retrato.${field}`)
  refusal(r({ extra: 1 }), 'objeto.corpo.retrato.extra')
  refusal(p({ retrato: { corpo: 'redondo', cor: 'azul', veste: null } }), 'objeto.corpo.retrato.acessorio')
  for (const q of ['todos', 'amigos', 'ninguem']) assert.equal(validateObject(p({ recados: q })).ok, true, q)
  refusal(p({ recados: 'alguns' }), 'objeto.corpo.recados')
  for (const l of [true, false]) assert.equal(validateObject(p({ listado: l })).ok, true)
  for (const bad of ['sim', 1, null]) refusal(p({ listado: bad }), 'objeto.corpo.listado')
})

test('topic and management category: 2 to 30 characters, one line; poll option: 1 to 60, one line', () => {
  const t = (category) => object('topico', { ...VALID.topico, categoria: category })
  assert.equal(validateObject(t(fills(30))).ok, true)
  refusal(t(fills(31)), 'objeto.corpo.categoria')
  assert.equal(validateObject(t('ab')).ok, true)
  refusal(t('a'), 'objeto.corpo.categoria')
  refusal(t('uma\nduas'), 'objeto.corpo.categoria')
  refusal(t(5), 'objeto.corpo.categoria')
  const g = (category) => object('topico-gestao', { topico: ID, acao: 'mover', comunidade: ID2, categoria: category })
  assert.equal(validateObject(g('Dicas')).ok, true)
  refusal(g('a'), 'objeto.corpo.categoria')
  const e = (options) => object('topico', { ...VALID.topico, enquete: { opcoes: options, encerraEm: NOW + 7200 } })
  assert.equal(validateObject(e([fills(60), 'b'])).ok, true)
  refusal(e([fills(61), 'b']), 'objeto.corpo.enquete.opcoes[0]')
  refusal(e(['a\nb', 'c']), 'objeto.corpo.enquete.opcoes[0]')
  refusal(e(['', 'c']), 'objeto.corpo.enquete.opcoes[0]')
})
