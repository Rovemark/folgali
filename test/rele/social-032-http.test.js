// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.3.2 pelo HTTP de verdade: painel, anúncios (públicos e de administração), vocabulário, ordem por pessoas e a COMPATIBILIDADE
// com a 0.3.1: as chaves que existiam continuam todas lá e as listas sem a opção nova são as de antes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { credencialDe, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { TOKEN, subir } from '../ajuda/servidor-de-teste.js'

async function mundo(opcoes = {}) {
  const s = await subir({ rajada: { capacidade: 100000, porSegundo: 100000 }, ...opcoes })
  const m = s.m
  const faz = (rover, tipo, corpo) => {
    const x = publicar(m, rover, tipo, corpo)
    if (x.estado !== 'aceito') throw new Error(`${tipo}: ${x.estado}`)
    return x
  }
  const [dono, ana, beto, caio] = [roverRegistrado(m), roverRegistrado(m), roverRegistrado(m), roverRegistrado(m)]
  const com = faz(dono, 'comunidade-criar', { nome: 'Rota 032', descricao: 'D', regras: 'R', tema: 'rovers', acesso: 'aberta', categorias: ['Geral'] }).id
  for (const x of [ana, beto, caio]) { faz(x, 'comunidade-adesao', { comunidade: com, acao: 'entrar' }); m.avancar(1) }
  m.avancar(3601)
  const t1 = faz(ana, 'topico', { comunidade: com, categoria: null, titulo: 'Primeiro tópico de rota', texto: 'Texto orquestra', tags: [], enquete: null }).id
  const t2 = faz(ana, 'topico', { comunidade: com, categoria: null, titulo: 'Segundo tópico de rota', texto: 'Texto orquestra', tags: [], enquete: null }).id
  faz(beto, 'resposta-forum', { topico: t1, em: null, cita: null, texto: 'resposta do beto' })
  faz(caio, 'resposta-forum', { topico: t1, em: null, cita: null, texto: 'resposta do caio' })
  const ler = (rover, caminho) => s.chamar('GET', caminho, { cabecalhos: rover ? { authorization: credencialDe(m, rover, caminho) } : {} })
  const admin = { authorization: `Bearer ${TOKEN}` }
  return { s, m, dono, ana, beto, caio, com, t1, t2, ler, faz, admin }
}
const incluiTodas = (obj, chaves, onde) => { for (const k of chaves) assert.ok(k in obj, `${onde}: a chave "${k}" da 0.3.1 sumiu`) }

test('GET /v1/info declara 0.3.2 e os quatro recursos novos, e os da 0.3.1 continuam', async () => {
  const w = await mundo()
  try {
    const r = await w.s.chamar('GET', '/v1/info')
    assert.equal(r.json.versaoDoRascunho, '0.6.0')
    assert.deepEqual(r.json.protocolo, ['0.1', '0.2', '0.3'])
    for (const n of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios', 'voce-datas', 'postagem-detalhe', 'denuncia-dispensar']) assert.ok(r.json.recursos.includes(n), n)
  } finally { await w.s.fechar() }
})

test('GET /v1/inicio: 401 sem credencial, 200 com ela, e desde é validado', async () => {
  const w = await mundo()
  try {
    const { ana, ler } = w
    const sem = await ler(null, '/v1/inicio')
    assert.equal(sem.status, 401)
    assert.equal(sem.json.erro.codigo, 'leitura_nao_autorizada')
    const ok = await ler(ana, '/v1/inicio')
    assert.equal(ok.status, 200)
    assert.deepEqual(Object.keys(ok.json), ['agora', 'voce', 'avisos', 'atividade', 'pendencias', 'moderacao', 'anuncios'])
    assert.equal(ok.json.voce.uid, ana.uid)
    assert.equal(ok.json.avisos.porTipo['resposta-no-topico'], 2)
    assert.deepEqual(ok.json.atividade.map((i) => [i.tipo, i.respostas]), [['topico', 2]])
    for (const ruim of ['desde=-1', 'desde=abc', 'desde=1.5', 'desde=', 'desde=4102444801', 'desde=12345678901', 'desde=0x10', 'desde=%20']) {
      assert.equal((await ler(ana, `/v1/inicio?${ruim}`)).status, 422, ruim)
    }
    // Um carimbo de verdade tem 10 dígitos (o inteiroDaQuery de contagem aceita 9): o defeito que o primeiro teste achou.
    for (const bom of ['desde=0', 'desde=1794200000', 'desde=4102444800']) assert.equal((await ler(ana, `/v1/inicio?${bom}`)).status, 200, bom)
    const filtrado = await ler(ana, `/v1/inicio?desde=${ok.json.agora}`)
    assert.equal(filtrado.status, 200)
    assert.equal(filtrado.json.avisos.total, 0)
    // A credencial cobre o caminho exato: a de /v1/inicio não vale para outra consulta.
    const trocada = await w.s.chamar('GET', '/v1/inicio?desde=0', { cabecalhos: { authorization: credencialDe(w.m, ana, '/v1/inicio') } })
    assert.equal(trocada.status, 401)
    assert.equal((await w.s.chamar('POST', '/v1/inicio')).status, 405)
  } finally { await w.s.fechar() }
})

test('anúncios pela rede: leitura pública, escrita só com a credencial de administração', async () => {
  const w = await mundo()
  const sem = await mundo({ tokenAdmin: null })
  try {
    const { s, admin } = w
    assert.equal((await s.chamar('POST', '/v1/admin/anuncios', { corpo: { titulo: 'A', texto: 'B' } })).status, 401, 'sem credencial')
    assert.equal((await s.chamar('POST', '/v1/admin/anuncios', { corpo: { titulo: 'A', texto: 'B' }, cabecalhos: { authorization: 'Bearer errado' } })).status, 401)
    assert.equal((await sem.s.chamar('POST', '/v1/admin/anuncios', { corpo: { titulo: 'A', texto: 'B' }, cabecalhos: admin })).status, 404, 'relé sem administração: a rota some')
    assert.equal((await s.chamar('GET', '/v1/anuncios')).json.itens.length, 0)
    const criado = await s.chamar('POST', '/v1/admin/anuncios', { corpo: { titulo: 'Manutenção hoje', texto: 'O relé reinicia às 3h.', fixado: true }, cabecalhos: admin })
    assert.equal(criado.status, 201)
    assert.match(criado.json.id, /^an_/)
    const publico = await s.chamar('GET', '/v1/anuncios')
    assert.equal(publico.status, 200, 'público: sem credencial nenhuma')
    assert.deepEqual(publico.json.itens.map((i) => i.titulo), ['Manutenção hoje'])
    const um = await s.chamar('GET', `/v1/anuncios/${criado.json.id}`)
    assert.equal(um.status, 200)
    assert.equal(um.json.fixado, true)
    assert.equal((await s.chamar('GET', '/v1/anuncios/an_naoexiste00000000000')).status, 404)
    assert.equal((await s.chamar('POST', '/v1/admin/anuncios', { corpo: { titulo: '<b>x</b>', texto: 'y' }, cabecalhos: admin })).status, 422)
    assert.equal((await s.chamar('POST', '/v1/admin/anuncios', { bruto: '{nao é json', cabecalhos: { ...admin, 'content-type': 'application/json' } })).status >= 400, true)
    assert.equal((await s.chamar('DELETE', `/v1/admin/anuncios/${criado.json.id}`)).status, 401)
    assert.equal((await s.chamar('DELETE', `/v1/admin/anuncios/${criado.json.id}`, { cabecalhos: admin })).status, 200)
    assert.equal((await s.chamar('DELETE', `/v1/admin/anuncios/${criado.json.id}`, { cabecalhos: admin })).status, 404)
    assert.equal((await s.chamar('GET', '/v1/anuncios')).json.itens.length, 0)
    assert.equal((await s.chamar('PUT', '/v1/anuncios')).status, 405)
  } finally { await w.s.fechar(); await sem.s.fechar() }
})

test('ordem, janela, status e etiqueta chegam às listas pelo HTTP, e valor inválido é 422', async () => {
  const w = await mundo()
  try {
    const { s, ler, com, t1, t2, ana, dono } = w
    const ids = async (c) => (await s.chamar('GET', c)).json.itens.map((i) => i.id)
    assert.deepEqual(await ids(`/v1/comunidades/${com}/topicos?ordem=recentes`), [t2, t1])
    assert.deepEqual(await ids(`/v1/comunidades/${com}/topicos?ordem=melhores`), [t1, t2], 't1 tem duas pessoas respondendo')
    assert.deepEqual(await ids(`/v1/comunidades/${com}/topicos?ordem=em-alta&janela=7d`), [t1, t2])
    for (const ruim of ['ordem=populares', 'ordem=em-alta&janela=1h', 'status=Bad!', 'etiqueta=1x']) {
      assert.equal((await s.chamar('GET', `/v1/comunidades/${com}/topicos?${ruim}`)).status, 422, ruim)
    }
    w.faz(dono, 'comunidade-vocabulario', { comunidade: com, etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }], status: [] })
    w.faz(ana, 'topico-marca', { topico: t1, etiquetas: ['bug'], status: 'aberto' })
    assert.deepEqual(await ids(`/v1/comunidades/${com}/topicos?etiqueta=bug`), [t1])
    assert.deepEqual(await ids(`/v1/comunidades/${com}/topicos?status=aberto`), [t1])
    assert.deepEqual(await ids(`/v1/comunidades/${com}/topicos?status=fechado`), [])
    const detalhe = (await ler(null, `/v1/comunidades/${com}`)).json
    assert.deepEqual(detalhe.vocabulario.etiquetas, [{ chave: 'bug', rotulo: 'Bug', cor: 'laranja' }])
    assert.equal(detalhe.vocabulario.padrao, true)
    assert.equal((await s.chamar('GET', `/v1/topicos/${t1}/respostas?ordem=melhores`)).status, 200)
    assert.equal((await s.chamar('GET', `/v1/topicos/${t1}/respostas?ordem=populares`)).status, 422)
    assert.equal((await s.chamar('GET', '/v1/busca?q=orquestra&tipo=topicos&ordem=melhores')).json.itens[0].id, t1)
    assert.equal((await s.chamar('GET', '/v1/busca?q=orquestra&tipo=rovers&ordem=melhores')).status, 422)
    assert.equal((await s.chamar('GET', '/v1/busca?q=orquestra&tipo=topicos&ordem=relevancia')).status, 200)
  } finally { await w.s.fechar() }
})

test('compatibilidade: as chaves da 0.3.1 continuam todas lá, e o cartão de tópico sem marca é o da 0.3.1', async () => {
  const w = await mundo()
  try {
    const { s, com, t1, ana, ler } = w
    const detalhe = (await ler(ana, `/v1/comunidades/${com}`)).json
    incluiTodas(detalhe, ['id', 'nome', 'descricao', 'acesso', 'regras', 'dono', 'moderadores', 'envelope', 'voce'], 'comunidade')
    incluiTodas(detalhe.voce, ['papel', 'pedidoPendente', 'convidado', 'banido', 'banidoEm', 'membroDesde'], 'comunidade.voce')
    const lista = (await s.chamar('GET', `/v1/comunidades/${com}/topicos`)).json
    incluiTodas(lista, ['itens', 'proximo'], 'lista de tópicos')
    incluiTodas(lista.itens[0], ['id', 'comunidade', 'categoria', 'titulo', 'trecho', 'autor', 'criadoEm', 'atividadeEm', 'respostas', 'fixado', 'trancado', 'resolvido', 'tags', 'enquete', 'editado'], 'cartão')
    assert.equal('marcas' in lista.itens[0], false, 'sem marca, nem a chave')
    const topico = (await ler(ana, `/v1/topicos/${t1}`)).json
    incluiTodas(topico, ['id', 'texto', 'envelope', 'comunidadeNome', 'resolvidoPor', 'versoes', 'reacoes', 'minhaReacao'], 'tópico')
    assert.equal('marcas' in topico, false)
    const respostas = (await s.chamar('GET', `/v1/topicos/${t1}/respostas`)).json
    incluiTodas(respostas.itens[0], ['id', 'envelope', 'autor', 'criadoEm', 'em', 'cita', 'filhas', 'resolveu', 'reacoes'], 'resposta')
    const antigas = (await s.chamar('GET', `/v1/topicos/${t1}/respostas?ordem=antigas`)).json
    assert.deepEqual(antigas, respostas, 'ordem=antigas é o padrão, byte a byte')
    const busca = (await s.chamar('GET', '/v1/busca?q=orquestra&tipo=topicos')).json
    assert.deepEqual((await s.chamar('GET', '/v1/busca?q=orquestra&tipo=topicos&ordem=relevancia')).json, busca, 'relevancia é o padrão da busca')
    const todos = (await s.chamar('GET', '/v1/busca?q=orquestra')).json
    assert.deepEqual(Object.keys(todos), ['rovers', 'comunidades', 'topicos', 'paginas'])
  } finally { await w.s.fechar() }
})

test('o relé não expõe pontos nem a lista de quem reagiu em nenhuma lista ordenada', async () => {
  const w = await mundo()
  try {
    const { s, com, t1, beto, caio } = w
    for (const caminho of [`/v1/comunidades/${com}/topicos?ordem=melhores`, `/v1/comunidades/${com}/topicos?ordem=em-alta`, `/v1/topicos/${t1}/respostas?ordem=melhores`,
      '/v1/busca?q=orquestra&tipo=topicos&ordem=melhores']) {
      const t = (await s.chamar('GET', caminho)).texto
      for (const k of ['pontos', 'score']) assert.equal(t.includes(`"${k}"`), false, `${caminho}: ${k}`)
      for (const r of [beto, caio]) assert.equal(t.includes(r.uid.replace('rvr_', '')) && !t.includes('"autor"'), false)
    }
  } finally { await w.s.fechar() }
})

test('banco antigo: a abertura de um armazém sem as colunas novas acrescenta tudo e não perde dado', async () => {
  const { Armazem } = await import('../../packages/rele/src/armazem.js')
  const { DatabaseSync } = await import('node:sqlite')
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'rn-arm-'))
  try {
    const arq = join(dir, 'r.sqlite')
    const a = new Armazem(arq)
    a.db.exec("INSERT INTO comunidades (id, dono, nome, chave_nome, descricao, regras, tema, acesso, categorias, criada_em, seq, atividade_em, atividade_seq, versao_id) VALUES ('ob_x','rvr_d','N','n','d','r','t','aberta','[]',1,1,1,1,'ob_v')")
    // Simula o banco da 0.3.1: tira as colunas e a tabela novas.
    a.db.exec('ALTER TABLE comunidades DROP COLUMN vocabulario; ALTER TABLE topicos DROP COLUMN etiquetas; ALTER TABLE topicos DROP COLUMN status; DROP TABLE anuncios;')
    a.fechar()
    const b = new Armazem(arq)
    const colunas = (t) => b.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
    assert.ok(colunas('comunidades').includes('vocabulario'))
    assert.ok(colunas('topicos').includes('etiquetas') && colunas('topicos').includes('status'))
    assert.ok(b.db.prepare("SELECT name FROM sqlite_master WHERE name = 'anuncios'").get())
    assert.equal(b.db.prepare("SELECT nome FROM comunidades WHERE id = 'ob_x'").get().nome, 'N', 'o dado de antes continua')
    assert.equal(b.db.prepare("SELECT vocabulario FROM comunidades WHERE id = 'ob_x'").get().vocabulario, null)
    b.fechar()
    void DatabaseSync
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
