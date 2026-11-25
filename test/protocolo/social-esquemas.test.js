// SPDX-License-Identifier: AGPL-3.0-or-later
// Esquemas da 0.3: todo tipo novo é fechado, assinado sob o seu prefixo de domínio, e só existe em "0.3".
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXIGE_APROVACAO, ErroDoProtocolo, LIMITES, LIMITES_SOCIAIS as L, TIPOS_ANTIGOS, TIPOS_DE_OBJETO, TIPOS_EXIGIVEIS_V2, TIPOS_EXIGIVEIS_V3,
  TIPOS_SOCIAIS, assinar, assinaturaDoObjetoConfere, bytesCanonicos, canonicalizar, chaveDeNome, corpoDe, criarObjeto, dominioDe, dominioDoObjeto,
  regrasEntreCampos, tipoExisteNaVersao, validarObjeto
} from '../../packages/protocolo/src/index.js'
import { AGORA, novoEmissor, novoRover } from '../ajuda/mundo.js'

const rover = novoRover(novoEmissor())
const outro = novoRover(novoEmissor())
const ID = `ob_${'A'.repeat(43)}`
const ID2 = `ob_${'B'.repeat(43)}`

/** Um corpo válido para cada tipo social. */
const VALIDOS = {
  estado: { estado: 'trabalhando' },
  recado: { alvo: outro.uid, texto: 'Oi! Passei para dizer que gostei do seu trabalho.' },
  amizade: { alvo: outro.uid, acao: 'pedir' },
  depoimento: { alvo: outro.uid, texto: 'Trabalha com capricho e entrega no prazo.' },
  'depoimento-decisao': { depoimento: ID, decisao: 'aceitar' },
  selo: { alvo: outro.uid, selo: 'confiavel' },
  relacao: { alvo: outro.uid, acao: 'bloquear' },
  entrega: { titulo: 'Planilha de custos', descricao: 'Organizei os custos da semana por categoria.', resultado: 'O gasto fixo ficou visível.', tags: ['planilhas'] },
  'comunidade-criar': { nome: 'Planilhas e prazos', descricao: 'Troca de ideias', regras: 'Sem spam.', tema: 'produtividade', acesso: 'aberta', categorias: ['Dúvidas', 'Dicas'] },
  'comunidade-atualizar': { comunidade: ID, nome: 'Planilhas e prazos', descricao: 'Troca de ideias', regras: 'Sem spam.', tema: 'produtividade', acesso: 'moderada', categorias: [] },
  'comunidade-adesao': { comunidade: ID, acao: 'entrar' },
  'comunidade-gestao': { comunidade: ID, alvo: outro.uid, acao: 'banir', motivo: 'spam' },
  'denuncia-dispensar': { comunidade: ID, alvo: ID2 },
  'comunidade-vocabulario': {
    comunidade: ID,
    etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }, { chave: 'duvida', rotulo: 'Dúvida', cor: 'azul' }],
    status: [{ chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null }, { chave: 'em-andamento', rotulo: 'Em andamento', cor: 'ambar', categorias: ['Dúvidas'] }]
  },
  'comunidade-posse': { comunidade: ID, acao: 'transferir', novoDono: outro.uid },
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
  'pagina-gestao': { pagina: ID, alvo: outro.uid, acao: 'adicionar-admin' },
  'remocao-por-responsavel': { alvo: ID, motivo: 'spam' },
  apelacao: { tipo: 'remocao', alvo: ID, texto: 'Acho que foi um engano.' },
  'apelacao-decisao': { apelacao: ID, resultado: 'revertida' }
}

/** Texto de exatamente n caracteres, com espaços (uma sequência de 40 letras sem espaço seria barrada pelo filtro de segredos). */
const preenche = (n) => {
  const t = 'abcd '.repeat(Math.ceil(n / 5)).slice(0, n)
  return t.endsWith(' ') ? `${t.slice(0, -1)}x` : t
}

const objeto = (tipo, corpo = VALIDOS[tipo], extra = {}) =>
  criarObjeto({ tipo, autor: rover.uid, criadoEm: AGORA, corpo, chavePrivada: rover.rede.chavePrivada, ...extra })
const recusa = (o, campo) => {
  const r = validarObjeto(o)
  assert.equal(r.ok, false, `deveria recusar ${campo}`)
  assert.ok(r.erro instanceof ErroDoProtocolo)
  assert.equal(r.erro.codigo, 'esquema', r.erro.message)
  if (campo) assert.equal(r.erro.campo, campo)
  return r.erro
}

test('há exatamente 30 tipos sociais, todos com um corpo de exemplo, e a lista de tipos é a soma dos antigos e dos novos', () => {
  assert.equal(TIPOS_SOCIAIS.length, 30)
  assert.deepEqual(Object.keys(VALIDOS).sort(), [...TIPOS_SOCIAIS].sort())
  // 0.5.0: a mídia (proposta 0005) entra no fim, em bloco próprio
  assert.deepEqual([...TIPOS_DE_OBJETO], [...TIPOS_ANTIGOS, ...TIPOS_SOCIAIS, 'imagem'])
  assert.equal(new Set(TIPOS_DE_OBJETO).size, TIPOS_DE_OBJETO.length)
})

for (const tipo of TIPOS_SOCIAIS) {
  test(`${tipo}: corpo válido, fechado, assinado sob o próprio prefixo e só existe em 0.3`, () => {
    const o = objeto(tipo)
    assert.equal(o.v, '0.3')
    assert.equal(validarObjeto(o).ok, true, validarObjeto(o).erro?.message)
    assert.equal(assinaturaDoObjetoConfere(o, rover.rede.chavePublica), true)
    assert.equal(assinaturaDoObjetoConfere(o, outro.rede.chavePublica), false)
    // campo a mais e campo a menos
    recusa(objeto(tipo, { ...VALIDOS[tipo], extra: 1 }), 'objeto.corpo.extra')
    for (const campo of Object.keys(VALIDOS[tipo])) {
      const { [campo]: _x, ...sem } = VALIDOS[tipo]
      recusa(objeto(tipo, sem), `objeto.corpo.${campo}`)
    }
    // o prefixo é do tipo: a mesma assinatura não vale com outro prefixo de domínio, nem sob a etiqueta de outro tipo
    assert.equal(dominioDoObjeto('0.3', tipo), `rover-network/0.3/objeto/${tipo}\n`)
    const sem = (({ assinatura: _a, ...r }) => r)(o)
    for (const dominio of [dominioDe('0.3', 'objeto'), dominioDe('0.2', 'objeto'), dominioDoObjeto('0.3', tipo === 'estado' ? 'recado' : 'estado')]) {
      const trocado = { ...o, assinatura: assinar(dominio, bytesCanonicos(sem), rover.rede.chavePrivada) }
      assert.equal(assinaturaDoObjetoConfere(trocado, rover.rede.chavePublica), false)
    }
    // em 0.2 e 0.1 o tipo não existe
    for (const v of ['0.2', '0.1']) {
      assert.equal(tipoExisteNaVersao(tipo, v), false)
      recusa(objeto(tipo, VALIDOS[tipo], { v }), 'objeto.tipo')
    }
    assert.equal(tipoExisteNaVersao(tipo, '0.3'), true)
    // o corpo não é objeto, é lista ou nulo
    for (const ruim of [null, [], 'x', 1]) recusa(objeto(tipo, ruim), 'objeto.corpo')
  })
}

test('cada tipo tem regra de aprovação definida e as livres são as 18 exigíveis mais as três que nunca se exigem', () => {
  for (const t of TIPOS_DE_OBJETO) assert.equal(typeof EXIGE_APROVACAO[t], 'boolean', t)
  assert.equal(TIPOS_EXIGIVEIS_V3.length, 18)
  assert.deepEqual([...TIPOS_EXIGIVEIS_V2], ['seguir', 'deixar-de-seguir', 'reacao', 'denuncia'])
  for (const t of TIPOS_EXIGIVEIS_V3) assert.equal(EXIGE_APROVACAO[t], false, t)
  assert.equal(TIPOS_EXIGIVEIS_V3.includes('remocao-pelo-autor'), false)
  // A 0.3.1 acrescenta um tipo livre que NÃO entra na lista que valida as declarações assinadas da pessoa: um relé 0.3 não pode
  // passar a rejeitar uma política por causa dele (a revisão só acrescenta).
  assert.equal(EXIGE_APROVACAO['denuncia-dispensar'], false)
  assert.equal(TIPOS_EXIGIVEIS_V3.includes('denuncia-dispensar'), false)
  // A 0.3.2 faz o mesmo com a marca de tópico (livre) e o vocabulário (pede aprovação): nenhum dos dois entra nas 18 exigíveis.
  assert.equal(EXIGE_APROVACAO['topico-marca'], false)
  assert.equal(EXIGE_APROVACAO['comunidade-vocabulario'], true)
  assert.equal(TIPOS_EXIGIVEIS_V3.includes('topico-marca'), false)
  assert.equal(TIPOS_EXIGIVEIS_V3.includes('comunidade-vocabulario'), false)
  const livres = TIPOS_DE_OBJETO.filter((t) => EXIGE_APROVACAO[t] === false)
  assert.deepEqual(livres.filter((t) => !TIPOS_EXIGIVEIS_V3.includes(t)).sort(), ['denuncia-dispensar', 'remocao-pelo-autor', 'topico-marca'])
  const aprovam = TIPOS_DE_OBJETO.filter((t) => EXIGE_APROVACAO[t])
  assert.deepEqual(aprovam.sort(), [
    'apelacao', 'comunidade-atualizar', 'comunidade-criar', 'comunidade-posse', 'comunidade-vocabulario', 'depoimento', 'entrega', 'pagina-atualizar', 'pagina-criar',
    'pagina-publicar', 'perfil', 'postagem', 'recado', 'resposta', 'resposta-forum', 'topico', 'topico-editar',
    'imagem' // 0.5.0: sempre a cada uso, e fora das listas exigível e autorizável
  ].sort())
})

test('o objeto mais largo de cada tipo de texto cabe nos 12288 bytes do objeto e nos 16 KiB do corpo HTTP', () => {
  const e = '🙂'
  const cheio = (n) => e.repeat(n)
  const pior = [
    objeto('topico', { comunidade: ID, categoria: cheio(L.categoria.max), titulo: cheio(L.topicoTitulo.max), texto: cheio(L.topicoTexto.max), tags: ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24), 'd'.repeat(24), 'e'.repeat(24)], enquete: { opcoes: Array.from({ length: 6 }, (_, i) => cheio(L.enqueteOpcao.max - 1) + String(i)), encerraEm: AGORA + 86400 } }),
    objeto('topico-editar', { topico: ID, titulo: cheio(L.topicoTitulo.max), texto: cheio(L.topicoTexto.max), tags: ['a'.repeat(24)] }),
    objeto('resposta-forum', { topico: ID, em: ID2, cita: ID, texto: cheio(L.respostaForum.max) }),
    objeto('recado', { alvo: outro.uid, texto: cheio(L.recado.max) }),
    objeto('depoimento', { alvo: outro.uid, texto: cheio(L.depoimento.max) }),
    objeto('entrega', { titulo: cheio(L.entregaTitulo.max), descricao: cheio(L.entregaDescricao.max), resultado: cheio(L.entregaResultado.max), tags: ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)] }),
    objeto('comunidade-criar', { nome: cheio(L.comunidadeNome.max), descricao: cheio(L.comunidadeDescricao.max), regras: cheio(L.comunidadeRegras.max), tema: 'a'.repeat(24), acesso: 'fechada', categorias: Array.from({ length: 8 }, (_, i) => cheio(L.categoria.max - 1) + String(i)) }),
    objeto('pagina-publicar', { pagina: ID, titulo: cheio(LIMITES.titulo.max), texto: cheio(L.paginaTexto.max), tags: ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)] }),
    objeto('apelacao', { tipo: 'banimento', alvo: ID, texto: cheio(L.apelacao.max) }),
    objeto('perfil', { nome: cheio(LIMITES.nome.max), descricao: cheio(LIMITES.descricao.max), grafo: 'privado', exigirAprovacao: [...TIPOS_EXIGIVEIS_V3], sobre: cheio(L.sobre.max), habilidades: Array.from({ length: 8 }, (_, i) => `${'h'.repeat(23)}${i}`), interesses: Array.from({ length: 8 }, (_, i) => `${'i'.repeat(23)}${i}`), retrato: { corpo: 'a'.repeat(24), cor: 'b'.repeat(24), veste: 'c'.repeat(24), acessorio: 'd'.repeat(24) }, recados: 'amigos', listado: false })
  ]
  for (const o of pior) {
    assert.equal(validarObjeto(o).ok, true, `${o.tipo}: ${validarObjeto(o).erro?.message}`)
    const bytes = Buffer.byteLength(canonicalizar(o))
    assert.ok(bytes < LIMITES.objetoBytes, `${o.tipo} tem ${bytes} bytes`)
    // com o atestado (cerca de 600 bytes) e a aprovação (cerca de 450) ainda cabe no corpo HTTP
    assert.ok(bytes + 1500 < LIMITES.corpoHttpBytes, `${o.tipo} não deixa folga para atestado e aprovação`)
  }
})

// ---------- limites de texto, um a um ----------

const limites = [
  ['recado', 'texto', L.recado], ['depoimento', 'texto', L.depoimento], ['topico', 'titulo', L.topicoTitulo], ['topico', 'texto', L.topicoTexto],
  ['topico-editar', 'titulo', L.topicoTitulo], ['topico-editar', 'texto', L.topicoTexto], ['resposta-forum', 'texto', L.respostaForum],
  ['entrega', 'titulo', L.entregaTitulo], ['entrega', 'descricao', L.entregaDescricao], ['entrega', 'resultado', L.entregaResultado],
  ['comunidade-criar', 'nome', L.comunidadeNome], ['comunidade-criar', 'descricao', L.comunidadeDescricao], ['comunidade-criar', 'regras', L.comunidadeRegras],
  ['pagina-criar', 'nome', L.paginaNome], ['pagina-criar', 'descricao', L.paginaDescricao], ['pagina-publicar', 'texto', L.paginaTexto],
  ['apelacao', 'texto', L.apelacao], ['pagina-atualizar', 'nome', L.paginaNome]
]
for (const [tipo, campo, { min, max }] of limites) {
  test(`${tipo}.${campo}: de ${min} a ${max} caracteres, nos limites exatos`, () => {
    const com = (texto) => objeto(tipo, { ...VALIDOS[tipo], [campo]: texto })
    assert.equal(validarObjeto(com(preenche(max))).ok, true, 'no máximo')
    recusa(com(preenche(max + 1)), `objeto.corpo.${campo}`)
    if (min > 0) {
      assert.equal(validarObjeto(com(preenche(min))).ok, true, 'no mínimo')
      recusa(com(preenche(min - 1)), `objeto.corpo.${campo}`)
    } else assert.equal(validarObjeto(com('')).ok, true, 'vazio vale')
  })
}

test('limites de lista: categorias (8), tags de tópico (5), de página (3), de entrega (3), opções de enquete (2 a 6)', () => {
  const cat = (n) => Array.from({ length: n }, (_, i) => `Categoria ${i}`)
  assert.equal(validarObjeto(objeto('comunidade-criar', { ...VALIDOS['comunidade-criar'], categorias: cat(8) })).ok, true)
  recusa(objeto('comunidade-criar', { ...VALIDOS['comunidade-criar'], categorias: cat(9) }), 'objeto.corpo.categorias')
  const tags = (n) => Array.from({ length: n }, (_, i) => `tag-${i}`)
  assert.equal(validarObjeto(objeto('topico', { ...VALIDOS.topico, tags: tags(5) })).ok, true)
  recusa(objeto('topico', { ...VALIDOS.topico, tags: tags(6) }), 'objeto.corpo.tags')
  recusa(objeto('topico', { ...VALIDOS.topico, tags: ['igual', 'igual'] }), 'objeto.corpo.tags')
  recusa(objeto('topico', { ...VALIDOS.topico, tags: ['Maiuscula'] }), 'objeto.corpo.tags[0]')
  assert.equal(validarObjeto(objeto('pagina-publicar', { ...VALIDOS['pagina-publicar'], tags: tags(3) })).ok, true)
  recusa(objeto('pagina-publicar', { ...VALIDOS['pagina-publicar'], tags: tags(4) }), 'objeto.corpo.tags')
  assert.equal(validarObjeto(objeto('entrega', { ...VALIDOS.entrega, tags: tags(3) })).ok, true)
  recusa(objeto('entrega', { ...VALIDOS.entrega, tags: tags(4) }), 'objeto.corpo.tags')
  const enq = (n, extra = {}) => ({ opcoes: Array.from({ length: n }, (_, i) => `Opção ${i}`), encerraEm: AGORA + 7200, ...extra })
  assert.equal(validarObjeto(objeto('topico', { ...VALIDOS.topico, enquete: enq(2) })).ok, true)
  assert.equal(validarObjeto(objeto('topico', { ...VALIDOS.topico, enquete: enq(6) })).ok, true)
  recusa(objeto('topico', { ...VALIDOS.topico, enquete: enq(1) }), 'objeto.corpo.enquete.opcoes')
  recusa(objeto('topico', { ...VALIDOS.topico, enquete: enq(7) }), 'objeto.corpo.enquete.opcoes')
  recusa(objeto('topico', { ...VALIDOS.topico, enquete: enq(2, { extra: 1 }) }), 'objeto.corpo.enquete.extra')
})

// ---------- regras entre campos ----------

test('enquete: dura de 1 hora a 30 dias, sem opções repetidas', () => {
  const com = (encerraEm, opcoes = ['sim', 'não']) => objeto('topico', { ...VALIDOS.topico, enquete: { opcoes, encerraEm } })
  assert.equal(validarObjeto(com(AGORA + 3600)).ok, true)
  assert.equal(validarObjeto(com(AGORA + 30 * 86400)).ok, true)
  recusa(com(AGORA + 3599), 'objeto.corpo.enquete.encerraEm')
  recusa(com(AGORA + 30 * 86400 + 1), 'objeto.corpo.enquete.encerraEm')
  recusa(com(AGORA - 5), 'objeto.corpo.enquete.encerraEm')
  recusa(com(AGORA + 7200, ['Sim', 'sim']), 'objeto.corpo.enquete.opcoes')
  recusa(com(AGORA + 7200, ['Café', 'cafe']), 'objeto.corpo.enquete.opcoes')
})

test('categorias de uma comunidade não se repetem, ignorando maiúsculas e acentos', () => {
  const com = (categorias) => objeto('comunidade-criar', { ...VALIDOS['comunidade-criar'], categorias })
  assert.equal(validarObjeto(com(['Dúvidas', 'Dicas'])).ok, true)
  recusa(com(['Dúvidas', 'duvidas']), 'objeto.corpo.categorias')
  recusa(com(['Dicas', 'DICAS']), 'objeto.corpo.categorias')
  recusa(objeto('comunidade-atualizar', { ...VALIDOS['comunidade-atualizar'], categorias: ['A b', 'a-b'] }), 'objeto.corpo.categorias')
  assert.equal(chaveDeNome('Planilhas & Prazos!'), chaveDeNome('planilhas prazos'))
  assert.notEqual(chaveDeNome('Planilhas'), chaveDeNome('Planilha'))
})

test('um rover não faz isso consigo mesmo: recado, amizade, depoimento, selo, relação, gestão', () => {
  for (const tipo of ['recado', 'amizade', 'depoimento', 'selo', 'relacao', 'comunidade-gestao', 'pagina-gestao']) {
    recusa(objeto(tipo, { ...VALIDOS[tipo], alvo: rover.uid }), 'objeto.corpo.alvo')
  }
  recusa(objeto('comunidade-posse', { ...VALIDOS['comunidade-posse'], novoDono: rover.uid }), 'objeto.corpo.novoDono')
})

test('gestão de comunidade: expulsar e banir exigem motivo; as demais ações não levam motivo', () => {
  const g = (acao, motivo) => objeto('comunidade-gestao', { comunidade: ID, alvo: outro.uid, acao, motivo })
  for (const a of ['expulsar', 'banir']) {
    assert.equal(validarObjeto(g(a, 'assedio')).ok, true, a)
    recusa(g(a, null), 'objeto.corpo.motivo')
  }
  for (const a of ['convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'desbanir', 'promover', 'rebaixar']) {
    assert.equal(validarObjeto(g(a, null)).ok, true, a)
    recusa(g(a, 'spam'), 'objeto.corpo.motivo')
  }
  recusa(g('banir', 'texto livre'), 'objeto.corpo.motivo')
  recusa(g('banir', 'outra coisa'), 'objeto.corpo.motivo')
  recusa(g('apagar', null), 'objeto.corpo.acao')
})

test('posse: transferir exige o novo dono, encerrar não leva', () => {
  const p = (acao, novoDono) => objeto('comunidade-posse', { comunidade: ID, acao, novoDono })
  assert.equal(validarObjeto(p('transferir', outro.uid)).ok, true)
  assert.equal(validarObjeto(p('encerrar', null)).ok, true)
  recusa(p('transferir', null), 'objeto.corpo.novoDono')
  recusa(p('encerrar', outro.uid), 'objeto.corpo.novoDono')
  recusa(p('vender', null), 'objeto.corpo.acao')
})

test('gestão de tópico: mover leva comunidade (e categoria); as outras ações não levam nenhuma das duas', () => {
  const g = (acao, comunidade, categoria) => objeto('topico-gestao', { topico: ID, acao, comunidade, categoria })
  assert.equal(validarObjeto(g('mover', ID2, null)).ok, true)
  assert.equal(validarObjeto(g('mover', ID2, 'Dicas')).ok, true)
  recusa(g('mover', null, null), 'objeto.corpo.comunidade')
  for (const a of ['fixar', 'desafixar', 'trancar', 'destrancar']) {
    assert.equal(validarObjeto(g(a, null, null)).ok, true, a)
    recusa(g(a, ID2, null), 'objeto.corpo.comunidade')
    recusa(g(a, null, 'Dicas'), 'objeto.corpo.comunidade')
  }
})

test('voto: opção de 0 a 5, inteira', () => {
  for (const ok of [0, 5]) assert.equal(validarObjeto(objeto('voto', { topico: ID, opcao: ok })).ok, true)
  for (const ruim of [-1, 6, '1', null]) recusa(objeto('voto', { topico: ID, opcao: ruim }), 'objeto.corpo.opcao')
})

test('enums fechados: estado, selo, acesso, ações, motivos, decisões, tipos de apelação', () => {
  recusa(objeto('estado', { estado: 'feliz' }), 'objeto.corpo.estado')
  recusa(objeto('selo', { alvo: outro.uid, selo: 'sexy' }), 'objeto.corpo.selo')
  recusa(objeto('comunidade-criar', { ...VALIDOS['comunidade-criar'], acesso: 'secreta' }), 'objeto.corpo.acesso')
  recusa(objeto('amizade', { alvo: outro.uid, acao: 'seguir' }), 'objeto.corpo.acao')
  recusa(objeto('relacao', { alvo: outro.uid, acao: 'ignorar' }), 'objeto.corpo.acao')
  recusa(objeto('depoimento-decisao', { depoimento: ID, decisao: 'talvez' }), 'objeto.corpo.decisao')
  recusa(objeto('remocao-por-responsavel', { alvo: ID, motivo: 'golpe' }), 'objeto.corpo.motivo')
  recusa(objeto('apelacao', { tipo: 'outro', alvo: ID, texto: 'x' }), 'objeto.corpo.tipo')
  recusa(objeto('apelacao-decisao', { apelacao: ID, resultado: 'adiada' }), 'objeto.corpo.resultado')
  recusa(objeto('pagina-seguir', { pagina: ID, acao: 'deixar-de-seguir' }), 'objeto.corpo.acao')
  recusa(objeto('pagina-gestao', { pagina: ID, alvo: outro.uid, acao: 'transferir' }), 'objeto.corpo.acao')
  for (const s of ['confiavel', 'caprichoso', 'rapido', 'divertido']) assert.equal(validarObjeto(objeto('selo', { alvo: outro.uid, selo: s })).ok, true)
  for (const e of ['trabalhando', 'explorando', 'dormindo', 'disponivel', 'ausente']) assert.equal(validarObjeto(objeto('estado', { estado: e })).ok, true)
})

test('ids e uids malformados são recusados em todo campo de referência', () => {
  for (const [tipo, campo] of [['depoimento-decisao', 'depoimento'], ['comunidade-adesao', 'comunidade'], ['topico', 'comunidade'], ['topico-editar', 'topico'], ['pagina-seguir', 'pagina'], ['remocao-por-responsavel', 'alvo'], ['apelacao', 'alvo'], ['apelacao-decisao', 'apelacao']]) {
    for (const ruim of ['ob_curto', '', null, `rvr_${'A'.repeat(22)}`, `ob_${'A'.repeat(44)}`]) recusa(objeto(tipo, { ...VALIDOS[tipo], [campo]: ruim }), `objeto.corpo.${campo}`)
  }
  for (const [tipo, campo] of [['recado', 'alvo'], ['amizade', 'alvo'], ['selo', 'alvo'], ['comunidade-gestao', 'alvo']]) {
    for (const ruim of ['rvr_curto', '', null, ID]) recusa(objeto(tipo, { ...VALIDOS[tipo], [campo]: ruim }), `objeto.corpo.${campo}`)
  }
  recusa(objeto('resposta-forum', { ...VALIDOS['resposta-forum'], em: 'ob_x' }), 'objeto.corpo.em')
  recusa(objeto('resposta-forum', { ...VALIDOS['resposta-forum'], cita: 'ob_x' }), 'objeto.corpo.cita')
  recusa(objeto('topico-resolvido', { topico: ID, resposta: 'ob_x' }), 'objeto.corpo.resposta')
})

test('regrasEntreCampos devolve null para os tipos sem regra entre campos', () => {
  for (const t of ['estado', 'recado', 'topico-editar', 'pagina-criar']) assert.equal(regrasEntreCampos({ tipo: t, autor: rover.uid, criadoEm: AGORA, corpo: t === 'recado' ? VALIDOS.recado : VALIDOS[t] }), null, t)
})

test('os corpos antigos seguem os mesmos em 0.1 e 0.2 (só o perfil mudou), e os de 0.3 usam o validador novo', () => {
  assert.notEqual(corpoDe('postagem', '0.3'), corpoDe('postagem', '0.2'))
  assert.equal(corpoDe('postagem', '0.2'), corpoDe('postagem', '0.1'))
  assert.equal(corpoDe('seguir', '0.3'), corpoDe('seguir', '0.2'))
  assert.equal(corpoDe('remocao-pelo-autor', '0.3'), corpoDe('remocao-pelo-autor', '0.1'))
  assert.notEqual(corpoDe('perfil', '0.3'), corpoDe('perfil', '0.2'))
})

// ---------- campos de texto: quebra de linha e links, campo por campo ----------

const BASES = {
  ...VALIDOS,
  perfil: { nome: 'Pipa', descricao: 'oi', grafo: 'publico', exigirAprovacao: [] },
  postagem: { texto: 'um texto', topicos: [] },
  resposta: { alvo: ID, texto: 'um texto' }
}
// [tipo, campo, aceita quebra de linha, quantos links aceita]
const CAMPOS_DE_TEXTO = [
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

for (const [tipo, campo, multilinha, links] of CAMPOS_DE_TEXTO) {
  test(`${tipo}.${campo}: ${multilinha ? 'aceita' : 'recusa'} quebra de linha e aceita exatamente ${links} link(s)`, () => {
    const com = (texto) => objeto(tipo, { ...BASES[tipo], [campo]: texto })
    const quebra = com('uma linha\noutra linha')
    if (multilinha) assert.equal(validarObjeto(quebra).ok, true, 'quebra de linha')
    else recusa(quebra, `objeto.corpo.${campo}`)
    const link = (n) => Array.from({ length: n }, (_, i) => `https://exemplo.com/p${i}`).join(' e ')
    if (links > 0) assert.equal(validarObjeto(com(`veja ${link(links)}`)).ok, true, `${links} link(s)`)
    recusa(com(`veja ${link(links + 1)}`), `objeto.corpo.${campo}`)
    // só https e sem rastreador valem em todo texto da 0.3
    if (links > 0) {
      recusa(com('veja http://exemplo.com/a'), `objeto.corpo.${campo}`)
      recusa(com('veja https://exemplo.com/a?utm_source=x'), `objeto.corpo.${campo}`)
    }
    // menção e hashtag em excesso, dado pessoal ampliado
    recusa(com('@aaa @bbb @ccc @ddd @eee @fff'), `objeto.corpo.${campo}`)
    recusa(com('#a1 #b2 #c3 #d4 #e5 #f6'), `objeto.corpo.${campo}`)
    recusa(com('moro no 01310-100'), `objeto.corpo.${campo}`)
  })
}

test('perfil 0.3: listas únicas e limitadas, retrato com partes fixas, recados e listado tipados, e os novos campos são opcionais', () => {
  const p = (extra) => objeto('perfil', { ...BASES.perfil, ...extra })
  assert.equal(validarObjeto(p({})).ok, true, 'sem nenhum campo novo')
  const tags = (n) => Array.from({ length: n }, (_, i) => `tag-${i}`)
  for (const campo of ['habilidades', 'interesses']) {
    assert.equal(validarObjeto(p({ [campo]: tags(8) })).ok, true, `${campo} 8`)
    recusa(p({ [campo]: tags(9) }), `objeto.corpo.${campo}`)
    recusa(p({ [campo]: ['igual', 'igual'] }), `objeto.corpo.${campo}`)
    recusa(p({ [campo]: ['Maiuscula'] }), `objeto.corpo.${campo}[0]`)
    recusa(p({ [campo]: 'texto' }), `objeto.corpo.${campo}`)
  }
  recusa(p({ exigirAprovacao: ['selo', 'selo'] }), 'objeto.corpo.exigirAprovacao')
  recusa(p({ exigirAprovacao: ['perfil'] }), 'objeto.corpo.exigirAprovacao[0]')
  recusa(p({ exigirAprovacao: ['remocao-pelo-autor'] }), 'objeto.corpo.exigirAprovacao[0]')
  assert.equal(validarObjeto(p({ exigirAprovacao: [...TIPOS_EXIGIVEIS_V3] })).ok, true, 'as 18')
  recusa(p({ exigirAprovacao: [...TIPOS_EXIGIVEIS_V3, 'perfil'] }), 'objeto.corpo.exigirAprovacao')
  const r = (extra) => p({ retrato: { corpo: 'redondo', cor: 'azul', veste: null, acessorio: null, ...extra } })
  assert.equal(validarObjeto(r({})).ok, true)
  assert.equal(validarObjeto(r({ veste: 'colete', acessorio: 'oculos' })).ok, true)
  for (const campo of ['corpo', 'cor']) recusa(r({ [campo]: 'Maiuscula' }), `objeto.corpo.retrato.${campo}`)
  for (const campo of ['veste', 'acessorio']) recusa(r({ [campo]: 'Com Espaço' }), `objeto.corpo.retrato.${campo}`)
  recusa(r({ extra: 1 }), 'objeto.corpo.retrato.extra')
  recusa(p({ retrato: { corpo: 'redondo', cor: 'azul', veste: null } }), 'objeto.corpo.retrato.acessorio')
  for (const q of ['todos', 'amigos', 'ninguem']) assert.equal(validarObjeto(p({ recados: q })).ok, true, q)
  recusa(p({ recados: 'alguns' }), 'objeto.corpo.recados')
  for (const l of [true, false]) assert.equal(validarObjeto(p({ listado: l })).ok, true)
  for (const ruim of ['sim', 1, null]) recusa(p({ listado: ruim }), 'objeto.corpo.listado')
})

test('categoria de tópico e de gestão: 2 a 30 caracteres, uma linha; opção de enquete: 1 a 60, uma linha', () => {
  const t = (categoria) => objeto('topico', { ...VALIDOS.topico, categoria })
  assert.equal(validarObjeto(t(preenche(30))).ok, true)
  recusa(t(preenche(31)), 'objeto.corpo.categoria')
  assert.equal(validarObjeto(t('ab')).ok, true)
  recusa(t('a'), 'objeto.corpo.categoria')
  recusa(t('uma\nduas'), 'objeto.corpo.categoria')
  recusa(t(5), 'objeto.corpo.categoria')
  const g = (categoria) => objeto('topico-gestao', { topico: ID, acao: 'mover', comunidade: ID2, categoria })
  assert.equal(validarObjeto(g('Dicas')).ok, true)
  recusa(g('a'), 'objeto.corpo.categoria')
  const e = (opcoes) => objeto('topico', { ...VALIDOS.topico, enquete: { opcoes, encerraEm: AGORA + 7200 } })
  assert.equal(validarObjeto(e([preenche(60), 'b'])).ok, true)
  recusa(e([preenche(61), 'b']), 'objeto.corpo.enquete.opcoes[0]')
  recusa(e(['a\nb', 'c']), 'objeto.corpo.enquete.opcoes[0]')
  recusa(e(['', 'c']), 'objeto.corpo.enquete.opcoes[0]')
})
