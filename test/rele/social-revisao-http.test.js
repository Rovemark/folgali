// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.3.1 pelo HTTP de verdade: as rotas novas, as opções novas, a validação e a COMPATIBILIDADE com a 0.3.
// A prova de compatibilidade congela as chaves que a 0.3 devolvia e exige que todas continuem lá: a revisão só acrescenta.
import test from 'node:test'
import assert from 'node:assert/strict'
import { credencialDe, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { subir } from '../ajuda/servidor-de-teste.js'

async function mundo() {
  const s = await subir({ rajada: { capacidade: 100000, porSegundo: 100000 } })
  const m = s.m
  const faz = (rover, tipo, corpo) => {
    const x = publicar(m, rover, tipo, corpo)
    if (x.estado !== 'aceito') throw new Error(`${tipo}: ${x.estado}`)
    return x
  }
  const [dono, ana, beto] = [roverRegistrado(m), roverRegistrado(m), roverRegistrado(m)]
  const com = faz(dono, 'comunidade-criar', { nome: 'Rota nova', descricao: 'D', regras: 'R', tema: 'rovers', acesso: 'aberta', categorias: ['Geral'] }).id
  for (const x of [ana, beto]) { faz(x, 'comunidade-adesao', { comunidade: com, acao: 'entrar' }); m.avancar(1) }
  m.avancar(3601)
  const top = faz(ana, 'topico', { comunidade: com, categoria: null, titulo: 'Tópico da rota', texto: 'Texto', tags: [], enquete: null }).id
  const resp = faz(beto, 'resposta-forum', { topico: top, em: null, cita: null, texto: 'Uma resposta' }).id
  const post = faz(ana, 'postagem', { texto: 'postagem da rota', topicos: [] }).id
  faz(beto, 'reacao', { alvo: post, reacao: 'curtir' })
  faz(beto, 'resposta', { alvo: post, texto: 'resposta à postagem' })
  const pag = faz(dono, 'pagina-criar', { nome: 'Página da rota', descricao: 'Fãs', tema: 'rovers' }).id
  faz(dono, 'pagina-publicar', { pagina: pag, texto: 'Atualização', tags: [] })
  faz(ana, 'pagina-seguir', { pagina: pag, acao: 'seguir' })
  const ler = (rover, caminho) => s.chamar('GET', caminho, { cabecalhos: rover ? { authorization: credencialDe(m, rover, caminho) } : {} })
  return { s, m, dono, ana, beto, com, top, resp, post, pag, ler, faz }
}

const incluiTodas = (obj, chaves, onde) => {
  for (const k of chaves) assert.ok(k in obj, `${onde}: a chave "${k}" da 0.3 sumiu`)
}

test('GET /v1/info declara a revisão e os recursos, sem mexer nas versões de objeto aceitas', async () => {
  const w = await mundo()
  try {
    const r = await w.s.chamar('GET', '/v1/info')
    assert.equal(r.json.versaoDoRascunho, '0.6.0')
    assert.deepEqual(r.json.protocolo, ['0.1', '0.2', '0.3'])
    assert.equal(r.cab.get('x-rover-protocolo'), '0.3', 'o objeto continua 0.3')
    for (const nome of ['voce-datas', 'avisos-com-nomes', 'depoimentos-enviados', 'removidos', 'fila-com-topico', 'denuncia-dispensar', 'reacoes-do-topico',
      'topicos-sem-categoria', 'respostas-recentes', 'lista-completa', 'temas-de-paginas', 'pessoas-em-alta', 'postagem-detalhe',
      // 0.3.2: os recursos da 0.3.1 continuam, e a 0.3.2 acrescenta quatro
      'inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios']) {
      assert.ok(r.json.recursos.includes(nome), nome)
    }
  } finally { await w.s.fechar() }
})

test('as rotas novas respondem 200 com o formato combinado, e a ordem da tabela deixa /paginas/temas antes de /paginas/:id', async () => {
  const w = await mundo()
  try {
    const { ana, beto, top, post, pag, com, ler } = w
    const tabela = [
      [`/v1/postagens/${post}`, null, ['envelope', 'autor', 'contagens', 'minhaReacao']],
      [`/v1/postagens/${post}/respostas`, null, ['itens', 'proximo']],
      ['/v1/paginas/temas', null, ['itens']],
      [`/v1/rovers/${ana.uid}/removidos`, ana, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/depoimentos?estado=enviados`, ana, ['itens', 'proximo']],
      [`/v1/topicos/${top}`, beto, ['reacoes', 'minhaReacao']],
      [`/v1/topicos/${top}/respostas?ordem=recentes`, null, ['itens', 'proximo']],
      [`/v1/comunidades/${com}/topicos?categoria=-`, null, ['itens', 'proximo']],
      [`/v1/paginas/${pag}/atualizacoes?completo=1`, beto, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/postagens?completo=1`, beto, ['itens', 'proximo']],
      [`/v1/linha/inicio?rover=${beto.uid}&tipos=postagem,pagina-publicar&completo=1`, beto, ['itens', 'proximo']]
    ]
    for (const [caminho, quem, chaves] of tabela) {
      const r = await ler(quem, caminho)
      assert.equal(r.status, 200, `${caminho} -> ${r.status} ${r.texto.slice(0, 120)}`)
      incluiTodas(r.json, chaves, caminho)
    }
    const temas = await ler(null, '/v1/paginas/temas')
    assert.deepEqual(temas.json.itens, [{ tema: 'rovers', paginas: 1 }], 'não é lido como o id "temas"')
    const completo = await ler(beto, `/v1/rovers/${ana.uid}/postagens?completo=1`)
    assert.equal(completo.json.itens[0].minhaReacao, 'curtir')
    assert.deepEqual(completo.json.itens[0].contagens, { respostas: 1, reacoes: { curtir: 1, util: 0 } })
  } finally { await w.s.fechar() }
})

test('validação: completo só aceita 1, ordem só aceita as duas, estado só aceita os três; e as rotas próprias pedem credencial', async () => {
  const w = await mundo()
  try {
    const { ana, beto, top, post, ler } = w
    for (const caminho of [
      `/v1/rovers/${ana.uid}/postagens?completo=2`, `/v1/rovers/${ana.uid}/postagens?completo=sim`, `/v1/rovers/${ana.uid}/postagens?completo=`,
      `/v1/topicos/${top}/respostas?ordem=aleatoria`, `/v1/postagens/${post}/respostas?ordem=aleatoria`
    ]) {
      const r = await ler(null, caminho)
      assert.equal(r.status, 422, caminho)
    }
    assert.equal((await ler(ana, `/v1/rovers/${ana.uid}/depoimentos?estado=todos`)).status, 422)
    assert.equal((await ler(null, `/v1/rovers/${ana.uid}/removidos`)).status, 401, 'sem credencial')
    assert.equal((await ler(beto, `/v1/rovers/${ana.uid}/removidos`)).status, 403, 'credencial de outro rover')
    assert.equal((await ler(null, `/v1/rovers/${ana.uid}/depoimentos?estado=enviados`)).status, 401)
    assert.equal((await ler(null, `/v1/postagens/x`)).status, 404)
    assert.equal((await ler(null, `/v1/postagens/${top}`)).status, 404, 'um tópico não é uma postagem')
    const adulterada = await w.s.chamar('GET', `/v1/rovers/${ana.uid}/postagens?completo=1`, { cabecalhos: { authorization: credencialDe(w.m, beto, `/v1/rovers/${ana.uid}/postagens`) } })
    assert.equal(adulterada.status, 401, 'a credencial cobre o pedido exato, com a consulta')
  } finally { await w.s.fechar() }
})

test('compatibilidade: as chaves que a 0.3 devolvia continuam todas lá, e as listas sem a opção nova são as da 0.3', async () => {
  const w = await mundo()
  try {
    const { ana, beto, top, com, pag, post, ler } = w
    const perfil = (await ler(null, `/v1/rovers/${ana.uid}`)).json
    incluiTodas(perfil, ['atestado', 'cabeca', 'chave', 'chaveAprovacao', 'descricao', 'desde', 'emissor', 'estado', 'exigirAprovacao', 'grafo', 'habilidades', 'handle',
      'interesses', 'listado', 'nome', 'perfil', 'recados', 'retrato', 'seguidores', 'seguindo', 'sobre', 'uid'], 'perfil')
    const pagina = (await ler(beto, `/v1/rovers/${ana.uid}/pagina`)).json
    incluiTodas(pagina, ['rover', 'selos', 'contagens', 'voce'], 'pagina')
    incluiTodas(pagina.contagens, ['amigos', 'comunidades', 'depoimentos', 'entregas', 'paginas', 'recados'], 'pagina.contagens')
    incluiTodas(pagina.voce, ['amigo', 'pedidoEnviado', 'pedidoRecebido', 'euBloqueei', 'euSilenciei', 'papel'], 'pagina.voce')
    const comunidade = (await ler(beto, `/v1/comunidades/${com}`)).json
    incluiTodas(comunidade.voce, ['papel', 'pedidoPendente', 'convidado', 'banido'], 'comunidade.voce')
    const topico = (await ler(beto, `/v1/topicos/${top}`)).json
    incluiTodas(topico, ['id', 'comunidade', 'categoria', 'titulo', 'trecho', 'autor', 'criadoEm', 'atividadeEm', 'respostas', 'fixado', 'trancado', 'resolvido', 'tags',
      'enquete', 'editado', 'texto', 'envelope', 'comunidadeNome', 'resolvidoPor', 'versoes'], 'topico')
    const aviso = (await ler(ana, `/v1/rovers/${ana.uid}/notificacoes`)).json.itens[0]
    incluiTodas(aviso, ['seq', 'tipo', 'em', 'origem', 'objeto', 'comunidade', 'pagina'], 'aviso')
    // sem a opção, as listas são de envelopes, como na 0.3
    const postagens = (await ler(null, `/v1/rovers/${ana.uid}/postagens`)).json
    assert.ok(postagens.itens[0].objeto && postagens.itens[0].objeto.id === post, 'postagens sem completo: envelopes')
    assert.equal('contagens' in postagens.itens[0], false)
    const atualizacoes = (await ler(null, `/v1/paginas/${pag}/atualizacoes`)).json
    assert.ok(atualizacoes.itens[0].objeto, 'atualizações sem completo: envelopes')
    const linha = (await ler(beto, `/v1/linha/inicio?rover=${beto.uid}`)).json
    assert.ok(Array.isArray(linha.itens))
    const respostas = (await ler(null, `/v1/topicos/${top}/respostas`)).json
    incluiTodas(respostas.itens[0], ['id', 'envelope', 'autor', 'criadoEm', 'em', 'cita', 'filhas', 'resolveu', 'reacoes'], 'resposta')
  } finally { await w.s.fechar() }
})

test('privacidade pelo HTTP: nada de lista de quem reagiu, e a resposta de leitura não carrega credencial nem identificador de quem lê', async () => {
  const w = await mundo()
  try {
    const { ana, beto, post, ler } = w
    const r = await ler(beto, `/v1/postagens/${post}`)
    const texto = r.texto
    assert.equal(texto.includes(beto.uid), false, 'o uid de quem lê não volta na resposta')
    assert.equal(/reagiu|reatores|quemReagiu/i.test(texto), false)
    const cab = JSON.stringify(Object.fromEntries(r.cab.entries()))
    assert.equal(cab.includes(beto.uid), false)
    assert.equal(r.json.autor.uid, ana.uid)
  } finally { await w.s.fechar() }
})
