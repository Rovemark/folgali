// SPDX-License-Identifier: AGPL-3.0-or-later
// As rotas da 0.3 pelo HTTP de verdade: método, caminho, credencial, paginação, formato da resposta e dos erros.
import test from 'node:test'
import assert from 'node:assert/strict'
import { credencialDe, envelopeDe, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'
import { subir, TOKEN } from '../ajuda/servidor-de-teste.js'

/** Um mundo com comunidade, tópico, página, amigos e notificações, servido por HTTP de verdade. */
async function mundoHttp() {
  // a rajada por origem do relé (40 fichas) é de produção; a tabela abaixo faz mais de 40 pedidos seguidos do mesmo endereço
  const s = await subir({ rajada: { capacidade: 100000, porSegundo: 100000 } })
  const m = s.m
  const r = () => roverRegistrado(m)
  const faz = (rover, tipo, corpo, o) => {
    const x = publicar(m, rover, tipo, corpo, o)
    if (x.estado !== 'aceito') throw new Error(`${tipo}: ${x.estado}`)
    return x
  }
  const [dono, ana, beto] = [r(), r(), r()]
  faz(ana, 'amizade', { alvo: beto.uid, acao: 'pedir' })
  faz(beto, 'amizade', { alvo: ana.uid, acao: 'aceitar' })
  const com = faz(dono, 'comunidade-criar', { nome: 'Rota de teste', descricao: 'Descrição', regras: 'Regras', tema: 'rovers', acesso: 'aberta', categorias: ['Geral'] }).id
  for (const x of [ana, beto]) { faz(x, 'comunidade-adesao', { comunidade: com, acao: 'entrar' }); m.avancar(1) }
  m.avancar(3601)
  const top = faz(ana, 'topico', { comunidade: com, categoria: 'Geral', titulo: 'Primeiro tópico', texto: 'Texto do tópico', tags: ['rotas'], enquete: { opcoes: ['sim', 'não'], encerraEm: m.relogio.agora + 7200 } }).id
  const resp = faz(beto, 'resposta-forum', { topico: top, em: null, cita: null, texto: 'Uma resposta' }).id
  faz(ana, 'recado', { alvo: beto.uid, texto: 'Um recado' })
  const pag = faz(dono, 'pagina-criar', { nome: 'Página de rota', descricao: 'Fãs', tema: 'rovers' }).id
  faz(dono, 'pagina-publicar', { pagina: pag, texto: 'Atualização', tags: [] })
  faz(ana, 'pagina-seguir', { pagina: pag, acao: 'seguir' })
  const ler = (rover, caminho) => s.chamar('GET', caminho, { cabecalhos: rover ? { authorization: credencialDe(m, rover, caminho) } : {} })
  return { s, m, dono, ana, beto, com, top, resp, pag, ler, faz }
}

test('todas as rotas de leitura da 0.3 respondem 200 com o formato combinado (anônimo ou com credencial, conforme a rota)', async () => {
  const w = await mundoHttp()
  try {
    const { s, ana, beto, dono, com, top, pag, ler } = w
    const tabela = [
      // [caminho, quem lê, chaves da resposta]
      [`/v1/rovers/${beto.uid}/pagina`, null, ['rover', 'selos', 'contagens', 'voce']],
      [`/v1/rovers/${beto.uid}/recados`, null, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/depoimentos`, null, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/depoimentos?estado=pendentes`, beto, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/selos`, null, ['selos']],
      [`/v1/rovers/${beto.uid}/entregas`, null, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/amigos`, null, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/amigos-em-comum?com=${ana.uid}`, null, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/comunidades`, null, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/paginas`, null, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/amizades/pendentes`, ana, ['recebidos', 'enviados']],
      [`/v1/rovers/${ana.uid}/convites`, ana, ['itens', 'proximo']],
      [`/v1/rovers/${ana.uid}/relacoes`, ana, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/notificacoes`, beto, ['itens', 'proximo']],
      [`/v1/rovers/${beto.uid}/notificacoes/contagem?desde=0`, beto, ['novas']],
      ['/v1/comunidades', null, ['itens', 'proximo']],
      [`/v1/comunidades/${com}`, null, ['id', 'nome', 'descricao', 'tema', 'acesso', 'membros', 'topicos', 'criadaEm', 'atividadeEm', 'categorias', 'regras', 'dono', 'moderadores', 'envelope', 'voce']],
      [`/v1/comunidades/${com}/membros`, null, ['itens', 'proximo']],
      [`/v1/comunidades/${com}/pedidos`, dono, ['itens', 'proximo']],
      [`/v1/comunidades/${com}/convites`, dono, ['itens', 'proximo']],
      [`/v1/comunidades/${com}/banidos`, dono, ['itens', 'proximo']],
      [`/v1/comunidades/${com}/topicos`, null, ['itens', 'proximo', 'fixados']],
      [`/v1/comunidades/${com}/moderacao/fila`, dono, ['denuncias', 'apelacoes']],
      [`/v1/comunidades/${com}/moderacao/registro`, null, ['itens', 'proximo']],
      [`/v1/topicos/${top}`, null, ['id', 'comunidade', 'categoria', 'titulo', 'trecho', 'autor', 'criadoEm', 'atividadeEm', 'respostas', 'fixado', 'trancado', 'resolvido', 'tags', 'enquete', 'editado', 'texto', 'envelope', 'comunidadeNome', 'resolvidoPor', 'versoes']],
      [`/v1/topicos/${top}/respostas`, null, ['itens', 'proximo']],
      [`/v1/topicos/${top}/historico`, null, ['itens']],
      ['/v1/paginas', null, ['itens', 'proximo']],
      [`/v1/paginas/${pag}`, null, ['id', 'nome', 'descricao', 'tema', 'dono', 'seguidores', 'criadaEm', 'atividadeEm', 'administradores', 'envelope', 'voce']],
      [`/v1/paginas/${pag}/atualizacoes`, null, ['itens', 'proximo']],
      [`/v1/paginas/${pag}/seguidores`, null, ['itens', 'proximo']],
      [`/v1/paginas/${pag}/moderacao/registro`, null, ['itens', 'proximo']],
      ['/v1/moderacao/registro', null, ['itens', 'proximo']],
      ['/v1/busca?q=rota', null, ['rovers', 'comunidades', 'topicos', 'paginas']],
      ['/v1/busca?q=rota&tipo=comunidades', null, ['itens', 'proximo']],
      ['/v1/descobrir/em-alta', null, ['itens', 'proximo']],
      ['/v1/descobrir/em-alta?tipo=comunidades&janela=7d', null, ['itens', 'proximo']],
      ['/v1/descobrir/recem-chegados', null, ['itens', 'proximo']],
      ['/v1/descobrir/sugestoes?interesses=rovers', null, ['itens', 'proximo']],
      [`/v1/descobrir/sugestoes?rover=${ana.uid}&tipo=paginas`, ana, ['itens', 'proximo']],
      ['/v1/descobrir/tendencias?janela=24h', null, ['itens', 'proximo']],
      [`/v1/linha/inicio?rover=${ana.uid}&tipos=postagem,pagina-publicar`, ana, ['itens', 'proximo']]
    ]
    for (const [caminho, quem, chaves] of tabela) {
      const r = await ler(quem, caminho)
      assert.equal(r.status, 200, `${caminho}: ${r.texto.slice(0, 160)}`)
      for (const c of chaves) assert.ok(c in r.json, `${caminho} sem "${c}"`)
      assert.equal(r.cab.get('cache-control'), 'no-store')
      assert.equal(r.cab.get('x-rover-protocolo'), '0.3')
    }
    const alta = (await ler(null, `/v1/topicos/${top}`)).json
    assert.equal(alta.enquete.total, 0)
    assert.equal(alta.comunidadeNome, 'Rota de teste')
  } finally { await w.s.fechar() }
})

test('rotas próprias e de moderação: sem credencial 401, de outro rover 403, anônimo em comunidade pública 401', async () => {
  const w = await mundoHttp()
  try {
    const { s, ana, beto, com, ler } = w
    for (const caminho of [`/v1/rovers/${ana.uid}/amizades/pendentes`, `/v1/rovers/${ana.uid}/convites`, `/v1/rovers/${ana.uid}/relacoes`, `/v1/rovers/${ana.uid}/notificacoes`, `/v1/rovers/${ana.uid}/notificacoes/contagem`, `/v1/rovers/${ana.uid}/depoimentos?estado=pendentes`]) {
      const sem = await ler(null, caminho)
      assert.equal(sem.status, 401, caminho)
      assert.equal(sem.json.erro.codigo, 'leitura_nao_autorizada')
      const outro = await ler(beto, caminho)
      assert.equal(outro.status, 403, caminho)
      assert.equal(outro.json.erro.codigo, 'sem_permissao')
      assert.equal((await ler(ana, caminho)).status, 200, caminho)
    }
    for (const sufixo of ['pedidos', 'convites', 'banidos', 'moderacao/fila']) {
      const caminho = `/v1/comunidades/${com}/${sufixo}`
      assert.equal((await ler(null, caminho)).status, 401, `${sufixo} anônimo`)
      assert.equal((await ler(ana, caminho)).status, 403, `${sufixo} membro`)
    }
    // credencial inválida em rota pública: 401 (nas rotas novas)
    const ruim = await s.chamar('GET', `/v1/comunidades/${com}`, { cabecalhos: { authorization: 'Rover-Assinatura uid=rvr_aaaaaaaaaaaaaaaaaaaaaa, t=1900000000, a=' + 'A'.repeat(86) } })
    assert.equal(ruim.status, 401)
    assert.equal(ruim.json.erro.codigo, 'leitura_nao_autorizada')
    const lixo = await s.chamar('GET', `/v1/comunidades/${com}`, { cabecalhos: { authorization: 'Basic abc' } })
    assert.equal(lixo.status, 401)
    // a credencial é de UM pedido: o mesmo cabeçalho em outra rota não vale
    const cab = credencialDe(w.m, ana, `/v1/rovers/${ana.uid}/relacoes`)
    const outraRota = await s.chamar('GET', `/v1/rovers/${ana.uid}/convites`, { cabecalhos: { authorization: cab } })
    assert.equal(outraRota.status, 401)
  } finally { await w.s.fechar() }
})

test('parâmetros inválidos dão 422 com o campo; formatos de id inválidos dão 404; método errado 405', async () => {
  const w = await mundoHttp()
  try {
    const { s, ana, com, top, ler } = w
    const casos = [
      [`/v1/rovers/${ana.uid}/recados?limite=0`, 422], [`/v1/rovers/${ana.uid}/recados?limite=51`, 422], [`/v1/rovers/${ana.uid}/recados?antes=abc`, 422],
      [`/v1/rovers/${ana.uid}/depoimentos?estado=todos`, 422], [`/v1/rovers/${ana.uid}/amigos-em-comum`, 422], [`/v1/rovers/${ana.uid}/amigos-em-comum?com=${ana.uid}`, 422],
      ['/v1/comunidades?acesso=fechada', 422], ['/v1/comunidades?ordem=popular', 422], [`/v1/comunidades/${com}/topicos?ordem=aleatoria`, 422],
      [`/v1/comunidades/${com}/topicos?tag=Maiuscula`, 422], ['/v1/busca', 422], ['/v1/busca?q=a', 422], ['/v1/busca?q=abc&tipo=imagens', 422],
      ['/v1/descobrir/em-alta?tipo=rovers', 422], ['/v1/descobrir/em-alta?janela=1h', 422], ['/v1/descobrir/tendencias?janela=30d', 422],
      ['/v1/descobrir/sugestoes?interesses=Maiuscula', 422], ['/v1/descobrir/sugestoes?rover=x', 422], ['/v1/descobrir/sugestoes?tipo=imagens&interesses=ab', 422],
      ['/v1/linha/inicio?rover=' + ana.uid + '&tipos=topico', 422],
      ['/v1/comunidades/x', 404], ['/v1/comunidades/ob_curto', 404], [`/v1/comunidades/${'ob_' + 'A'.repeat(43)}`, 404], ['/v1/topicos/x', 404],
      [`/v1/topicos/${top}/respostas?em=ob_x`, 404], ['/v1/paginas/x', 404], ['/v1/rovers/x/pagina', 404], ['/v1/rovers/x/recados', 404],
      ["/v1/comunidades/' OR 1=1 --", 404], ['/v1/topicos/%00', 404], ['/v1/descobrir/nada', 404], [`/v1/comunidades/${com}/segredo`, 404]
    ]
    for (const [caminho, status] of casos) {
      const r = await ler(null, caminho)
      assert.equal(r.status, status, caminho)
      assert.deepEqual(Object.keys(r.json), ['erro'], caminho)
      assert.ok(!r.texto.includes('OR 1=1'), 'não ecoa o que foi enviado')
    }
    for (const metodo of ['POST', 'PUT', 'DELETE']) {
      const r = await s.chamar(metodo, `/v1/comunidades/${com}`, { corpo: {} })
      assert.equal(r.status, 405)
    }
    assert.equal((await s.chamar('POST', '/v1/busca', { corpo: {} })).status, 405)
  } finally { await w.s.fechar() }
})

test('escrever pelo HTTP: um tipo social em POST /v1/objetos devolve 201 com o resultado; duplicado 200; erro com o código novo', async () => {
  const w = await mundoHttp()
  try {
    const { s, m, dono, com } = w
    const novo = roverRegistrado(m)
    const env = envelopeDe(m, novo, 'comunidade-adesao', { comunidade: com, acao: 'entrar' })
    const r = await s.chamar('POST', '/v1/objetos', { corpo: env })
    assert.equal(r.status, 201)
    assert.deepEqual(r.json, { estado: 'aceito', id: env.objeto.id, resultado: 'membro' })
    const outra = await s.chamar('POST', '/v1/objetos', { corpo: env })
    assert.equal(outra.status, 200)
    assert.equal(outra.json.estado, 'duplicado')
    const env2 = envelopeDe(m, novo, 'comunidade-adesao', { comunidade: com, acao: 'entrar' }, { previo: env.objeto.id, criadoEm: m.relogio.agora + 1 })
    const ja = await s.chamar('POST', '/v1/objetos', { corpo: env2 })
    assert.equal(ja.status, 409)
    assert.equal(ja.json.erro.codigo, 'ja_existe')
    assert.equal(ja.json.erro.campo, 'objeto.corpo.comunidade')
    const sem = envelopeDe(m, dono, 'comunidade-gestao', { comunidade: com, alvo: `rvr_${'B'.repeat(22)}`, acao: 'banir', motivo: 'spam' })
    const e = await s.chamar('POST', '/v1/objetos', { corpo: sem })
    assert.equal(e.status, 404)
    // sem a aprovação que o tipo exige: 403 sem_aprovacao
    const semAprovacao = envelopeDe(m, novo, 'recado', { alvo: dono.uid, texto: 'oi' }, { previo: env.objeto.id, aprovacao: false, criadoEm: m.relogio.agora + 2 })
    const sa = await s.chamar('POST', '/v1/objetos', { corpo: semAprovacao })
    assert.equal(sa.status, 403)
    assert.equal(sa.json.erro.codigo, 'sem_aprovacao')
  } finally { await w.s.fechar() }
})

test('as rotas de administração da 0.3: lista e decide as apelações que caíram na fila do relé; bloqueio com motivo público', async () => {
  const w = await mundoHttp()
  try {
    const { s, ana, top, faz } = w
    const auth = { authorization: `Bearer ${TOKEN}` }
    assert.equal((await s.chamar('GET', '/v1/admin/apelacoes')).status, 401)
    assert.equal((await s.chamar('GET', '/v1/admin/apelacoes', { cabecalhos: auth })).json.itens.length, 0)
    const b = await s.chamar('POST', '/v1/admin/bloqueios', { cabecalhos: auth, corpo: { tipo: 'objeto', alvo: top, motivo: 'análise', motivoPublico: 'regras' } })
    assert.equal(b.status, 201)
    assert.equal((await s.chamar('GET', '/v1/moderacao/registro')).json.itens.length, 1)
    const ap = faz(ana, 'apelacao', { tipo: 'remocao', alvo: top, texto: 'Foi um engano.' })
    const fila = await s.chamar('GET', '/v1/admin/apelacoes', { cabecalhos: auth })
    assert.deepEqual(fila.json.itens.map((i) => i.id), [ap.id])
    assert.equal(fila.json.itens[0].origem, 'rele')
    assert.equal((await s.chamar('POST', `/v1/admin/apelacoes/${ap.id}/decisao`, { cabecalhos: auth, corpo: { resultado: 'talvez' } })).status, 422)
    assert.equal((await s.chamar('POST', `/v1/admin/apelacoes/${ap.id}/decisao`, { cabecalhos: auth, corpo: { resultado: 'revertida', extra: 1 } })).status, 422)
    assert.equal((await s.chamar('POST', `/v1/admin/apelacoes/x/decisao`, { cabecalhos: auth, corpo: { resultado: 'revertida' } })).status, 422)
    const d = await s.chamar('POST', `/v1/admin/apelacoes/${ap.id}/decisao`, { cabecalhos: auth, corpo: { resultado: 'revertida' } })
    assert.equal(d.status, 200)
    assert.deepEqual(d.json, { resultado: 'revertida' })
    assert.equal((await s.chamar('POST', `/v1/admin/apelacoes/${ap.id}/decisao`, { cabecalhos: auth, corpo: { resultado: 'mantida' } })).status, 409)
    assert.equal((await s.chamar('GET', `/v1/topicos/${top}`)).status, 200, 'revertida: o objeto foi desbloqueado')
  } finally { await w.s.fechar() }
})

test('o log não recebe credencial, id, termo de busca nem texto das rotas novas; só método, padrão da rota, status e duração', async () => {
  const w = await mundoHttp()
  try {
    const { s, ana, top, ler } = w
    await ler(ana, `/v1/rovers/${ana.uid}/notificacoes`)
    await ler(null, `/v1/topicos/${top}`)
    await ler(null, '/v1/busca?q=termo-secreto-da-busca')
    const texto = JSON.stringify(s.logs)
    for (const proibido of [ana.uid, top, 'termo-secreto', 'Rover-Assinatura', 'Primeiro tópico']) assert.equal(texto.includes(proibido), false, proibido)
    assert.ok(s.logs.some((l) => l.rota === '/v1/topicos/:id'))
    assert.ok(s.logs.some((l) => l.rota === '/v1/rovers/:uid/notificacoes'))
    assert.ok(s.logs.some((l) => l.rota === '/v1/busca'))
  } finally { await w.s.fechar() }
})
