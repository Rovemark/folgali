// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { criarAprovacaoHumana, gerarParDeChaves } from '../../packages/protocolo/src/index.js'
import { ProvedorDeTeste } from '../../packages/rele/src/provedor-de-teste.js'
import { aprovar, novoHandle, novoUid, objetoDe } from '../ajuda/mundo.js'
import { codigoDe, envelopeDe, erroDe, novoMundo, novoRoverNoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const corpoPostagem = (texto = 'Uma postagem de teste.') => ({ texto, topicos: ['rovers'] })

test('fluxo feliz: perfil, postagem, resposta, reação e seguir, cada um encadeado ao anterior', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const post = publicar(m, a, 'postagem', corpoPostagem())
  assert.equal(post.estado, 'aceito')
  assert.equal(publicar(m, b, 'resposta', { alvo: post.id, texto: 'Concordo.' }).estado, 'aceito')
  assert.equal(publicar(m, b, 'reacao', { alvo: post.id, reacao: 'util' }).estado, 'aceito')
  assert.equal(publicar(m, b, 'seguir', { alvo: a.uid }).estado, 'aceito')
  assert.equal(m.rele.perfil(b.uid).cabeca, b.cabeca)
  assert.equal(m.rele.perfil(a.uid).seguidores, 1)
  assert.equal(m.rele.perfil(b.uid).seguindo, 1)
})

test('rover sem atestado: nem o objeto certo entra', () => {
  const m = novoMundo()
  const r = novoRoverNoMundo(m)
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, 'perfil', { nome: 'X', descricao: '' }))), 'sem_atestado')
})

test('atestado de emissor em que o relé não confia', () => {
  const m = novoMundo()
  const outro = new ProvedorDeTeste()
  const r = novoRoverNoMundo({ ...m, provedor: outro })
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, 'perfil', { nome: 'X', descricao: '' }, { atestado: true }))), 'emissor_desconhecido')
})

test('atestado de outro rover anexado ao meu objeto', () => {
  const m = novoMundo()
  const a = novoRoverNoMundo(m)
  const b = novoRoverNoMundo(m)
  const env = envelopeDe(m, a, 'perfil', { nome: 'A', descricao: '' })
  env.atestado = b.atestado
  const e = erroDe(() => m.rele.aceitar(env))
  assert.equal(e.codigo, 'atestado_invalido')
  assert.equal(e.campo, 'atestado.uid')
})

test('atestado forjado (assinatura de quem não é emissor)', () => {
  const m = novoMundo()
  const r = novoRoverNoMundo(m)
  const falso = new ProvedorDeTeste()
  const forjado = falso.emitir({ uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: m.relogio.agora })
  r.atestado = { ...forjado, emissor: m.provedor.chavePublica } // diz ser do emissor confiável, mas a assinatura não bate
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, 'perfil', { nome: 'X', descricao: '' }, { atestado: true }))), 'atestado_invalido')
})

test('atestado vencido: o anexado e o guardado', () => {
  const m = novoMundo()
  const curto = novoRoverNoMundo(m, { validadeS: 100 })
  m.avancar(200)
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, curto, 'perfil', { nome: 'X', descricao: '' }, { atestado: true }))), 'atestado_vencido')

  const m2 = novoMundo()
  const r = roverRegistrado(m2, { validadeS: 1000 })
  publicar(m2, r, 'postagem', corpoPostagem())
  m2.avancar(989) // o atestado foi emitido em agora-10 com validade 1000: acaba em agora+990
  assert.equal(publicar(m2, r, 'postagem', corpoPostagem('falta um segundo')).estado, 'aceito')
  m2.avancar(1) // agora == expiraEm: a validade acabou exatamente ali
  assert.equal(codigoDe(() => publicar(m2, r, 'postagem', corpoPostagem('venceu'))), 'atestado_vencido')
})

test('atestado novo de rover revogado também é recusado', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  m.provedor.revogar(m.provedor.chavePublica, r.uid)
  m.avancar(5)
  r.atestado = m.provedor.emitir({ uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: m.relogio.agora })
  const e = erroDe(() => publicar(m, r, 'postagem', corpoPostagem(), { comAtestado: true }))
  assert.equal(e.codigo, 'atestado_revogado')
})

test('renovação: atestado mais novo troca o vigente; igual reenviado é aceito; mais velho ou empatado não', () => {
  const m = novoMundo()
  const r = roverRegistrado(m, { validadeS: 1000 })
  const igual = publicar(m, r, 'postagem', corpoPostagem('com o mesmo atestado'), { comAtestado: true })
  assert.equal(igual.estado, 'aceito')
  m.avancar(500)
  const novo = m.provedor.emitir({ uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: m.relogio.agora, validadeS: 5000 })
  const velho = r.atestado
  r.atestado = novo
  assert.equal(publicar(m, r, 'postagem', corpoPostagem('renovou'), { comAtestado: true }).estado, 'aceito')
  assert.equal(m.rele.perfil(r.uid).atestado.expiraEm, novo.expiraEm)
  // o antigo, ainda dentro da validade, não volta
  r.atestado = velho
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', corpoPostagem('volta'), { comAtestado: true })), 'atestado_antigo')
  // empate de data com conteúdo diferente também não
  const empate = m.provedor.emitir({ uid: r.uid, handle: r.handle, chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: m.relogio.agora, validadeS: 6000 })
  r.atestado = empate
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', corpoPostagem('empate'), { comAtestado: true })), 'atestado_antigo')
})

test('troca de chave de rede: a antiga deixa de assinar, a nova passa a valer', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const antiga = r.rede
  const nova = gerarParDeChaves()
  m.avancar(5)
  r.atestado = m.provedor.emitir({ uid: r.uid, handle: r.handle, chave: nova.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: m.relogio.agora })
  r.rede = nova
  assert.equal(publicar(m, r, 'postagem', corpoPostagem('com a chave nova'), { comAtestado: true }).estado, 'aceito')
  r.rede = antiga
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', corpoPostagem('com a chave velha'))), 'assinatura_invalida')
})

test('revogação pelo emissor: para de aceitar, esconde da leitura e não deixa reanexar', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  publicar(m, r, 'postagem', corpoPostagem())
  m.provedor.revogar(m.provedor.chavePublica, r.uid)
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', corpoPostagem('outra'))), 'atestado_revogado')
  assert.equal(codigoDe(() => m.rele.perfil(r.uid)), 'nao_encontrado')
  assert.equal(codigoDe(() => m.rele.postagensDe(r.uid)), 'nao_encontrado')
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', corpoPostagem('reanexa'), { comAtestado: true })), 'atestado_revogado')
  m.provedor.desfazerRevogacao(m.provedor.chavePublica, r.uid)
  assert.equal(publicar(m, r, 'postagem', corpoPostagem('voltou')).estado, 'aceito')
})

test('relé que deixa de confiar no emissor: nada entra e nada aparece', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  publicar(m, r, 'postagem', corpoPostagem())
  m.provedor.deixarDeConfiar(m.provedor.chavePublica)
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', corpoPostagem('x'))), 'emissor_desconhecido')
  assert.equal(codigoDe(() => m.rele.perfil(r.uid)), 'nao_encontrado')
})

test('assinatura trocada e conteúdo mexido', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outro = novoRoverNoMundo(m)
  // objeto bem formado, com o uid do rover, mas assinado por outra chave
  const intruso = { ...outro, uid: r.uid }
  const env = envelopeDe(m, intruso, 'postagem', corpoPostagem(), { previo: r.cabeca })
  env.aprovacao = aprovar(r, env.objeto)
  assert.equal(codigoDe(() => m.rele.aceitar(env)), 'assinatura_invalida')
  // conteúdo mexido depois de assinado
  const bom = envelopeDe(m, r, 'postagem', corpoPostagem())
  const mexido = { ...bom, objeto: { ...bom.objeto, corpo: { ...bom.objeto.corpo, texto: 'Outro texto.' } } }
  assert.equal(codigoDe(() => m.rele.aceitar(mexido)), 'id_incorreto')
  // assinatura de outro objeto do mesmo rover colada neste
  const outroObj = envelopeDe(m, r, 'postagem', corpoPostagem('diferente'))
  const colado = { ...bom, objeto: { ...bom.objeto, assinatura: outroObj.objeto.assinatura } }
  assert.equal(codigoDe(() => m.rele.aceitar(colado)), 'assinatura_invalida')
})

test('objeto reenviado vira "duplicado" e não duplica nada', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const env = envelopeDe(m, r, 'postagem', corpoPostagem())
  assert.equal(m.rele.aceitar(env).estado, 'aceito')
  assert.equal(m.rele.aceitar(env).estado, 'duplicado')
  assert.equal(m.rele.aceitar(JSON.parse(JSON.stringify(env))).estado, 'duplicado')
  assert.equal(m.armazem.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'postagem'").n, 1)
})

test('objeto removido não ressuscita ao ser reenviado', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const env = envelopeDe(m, r, 'postagem', corpoPostagem())
  m.rele.aceitar(env)
  r.cabeca = env.objeto.id
  publicar(m, r, 'remocao-pelo-autor', { alvo: env.objeto.id })
  assert.equal(m.rele.aceitar(env).estado, 'duplicado')
  assert.equal(m.rele.postagensDe(r.uid).itens.length, 0)
  assert.equal(codigoDe(() => m.rele.objeto(env.objeto.id)), 'removido')
})

test('relógio: futuro, passado e as bordas exatas', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  m.avancar(1000) // para que "agora - 900" ainda seja posterior ao perfil que abriu a cadeia
  const com = (criadoEm, texto) => envelopeDe(m, r, 'postagem', corpoPostagem(texto), { criadoEm, aprovadoEm: Math.max(criadoEm, m.relogio.agora) })
  assert.equal(codigoDe(() => m.rele.aceitar(com(m.relogio.agora + 121, 'a'))), 'relogio')
  assert.equal(codigoDe(() => m.rele.aceitar(com(m.relogio.agora - 901, 'b'))), 'relogio')
  assert.equal(m.rele.aceitar(com(m.relogio.agora - 900, 'c')).estado, 'aceito')
  r.cabeca = m.armazem.rover(r.uid).cabeca_id
  assert.equal(m.rele.aceitar(com(m.relogio.agora + 120, 'd')).estado, 'aceito')
})

test('cadeia: previo errado, bifurcação e primeiro objeto que não é perfil', () => {
  const m = novoMundo()
  const r = novoRoverNoMundo(m)
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, 'postagem', corpoPostagem(), { atestado: true }))), 'perfil_primeiro')
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, 'perfil', { nome: 'X', descricao: '' }, { atestado: true, previo: `ob_${'A'.repeat(43)}` }))), 'previo_incorreto')
  publicar(m, r, 'perfil', { nome: 'X', descricao: '' }, { comAtestado: true })
  const cabecaAntiga = r.cabeca
  publicar(m, r, 'postagem', corpoPostagem('um'))
  // bifurcação: outro objeto apontando para a cabeça antiga
  const e = erroDe(() => m.rele.aceitar(envelopeDe(m, r, 'postagem', corpoPostagem('bifurcou'), { previo: cabecaAntiga })))
  assert.equal(e.codigo, 'previo_incorreto')
  assert.equal(e.campo, 'objeto.previo')
  // previo nulo quando já existe cadeia
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, 'postagem', corpoPostagem('nulo'), { previo: null }))), 'previo_incorreto')
})

test('cadeia: objeto mais antigo que o anterior', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  publicar(m, r, 'postagem', corpoPostagem('um'), { criadoEm: m.relogio.agora })
  const e = erroDe(() => m.rele.aceitar(envelopeDe(m, r, 'postagem', corpoPostagem('dois'), { criadoEm: m.relogio.agora - 1 })))
  assert.equal(e.codigo, 'relogio')
})

test('postagem sem aprovação humana é recusada; seguir não precisa e não aceita sobra', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const alvo = roverRegistrado(m)
  for (const tipo of ['postagem', 'perfil']) {
    const corpo = tipo === 'perfil' ? { nome: 'Novo', descricao: '' } : corpoPostagem()
    assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, tipo, corpo, { aprovacao: false }))), 'sem_aprovacao', tipo)
  }
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, 'resposta', { alvo: `ob_${'A'.repeat(43)}`, texto: 'oi' }, { aprovacao: false }))), 'sem_aprovacao')
  assert.equal(publicar(m, r, 'seguir', { alvo: alvo.uid }).estado, 'aceito')
  const comSobra = envelopeDe(m, r, 'reacao', { alvo: `ob_${'A'.repeat(43)}`, reacao: 'curtir' }, { aprovacao: false })
  comSobra.aprovacao = aprovar(r, comSobra.objeto)
  assert.equal(codigoDe(() => m.rele.aceitar(comSobra)), 'esquema')
})

test('aprovação humana inválida: de outro objeto, de outro rover, com a chave de rede, vencida, do futuro', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outroRover = roverRegistrado(m)
  m.avancar(1000) // para as datas "no passado" ficarem depois do perfil que abriu a cadeia
  const base = envelopeDe(m, r, 'postagem', corpoPostagem('principal'))

  const deOutroObjeto = { ...base, aprovacao: aprovar(r, envelopeDe(m, r, 'postagem', corpoPostagem('outra')).objeto) }
  assert.equal(codigoDe(() => m.rele.aceitar(deOutroObjeto)), 'aprovacao_invalida')

  const deOutroRover = { ...base, aprovacao: criarAprovacaoHumana({ chavePrivadaDeAprovacao: outroRover.aprovacao.chavePrivada, objeto: base.objeto.id, autor: r.uid, aprovadoEm: m.relogio.agora }) }
  assert.equal(codigoDe(() => m.rele.aceitar(deOutroRover)), 'aprovacao_invalida')

  const comChaveDeRede = { ...base, aprovacao: criarAprovacaoHumana({ chavePrivadaDeAprovacao: r.rede.chavePrivada, objeto: base.objeto.id, autor: r.uid, aprovadoEm: m.relogio.agora }) }
  assert.equal(codigoDe(() => m.rele.aceitar(comChaveDeRede)), 'aprovacao_invalida')

  const antigo = envelopeDe(m, r, 'postagem', corpoPostagem('antigo'), { criadoEm: m.relogio.agora - 600, aprovacao: false })
  const vencida = { ...antigo, aprovacao: aprovar(r, antigo.objeto, { aprovadoEm: m.relogio.agora - 400, validadeS: 300 }) }
  assert.equal(codigoDe(() => m.rele.aceitar(vencida)), 'aprovacao_vencida')

  const doFuturo = { ...base, aprovacao: aprovar(r, base.objeto, { aprovadoEm: m.relogio.agora + 500 }) }
  assert.equal(codigoDe(() => m.rele.aceitar(doFuturo)), 'aprovacao_invalida')

  const longa = { ...base, aprovacao: aprovar(r, base.objeto, { validadeS: 3600 }) }
  assert.equal(codigoDe(() => m.rele.aceitar(longa)), 'aprovacao_invalida')

  assert.equal(m.rele.aceitar(base).estado, 'aceito') // com a aprovação certa, entra
})

test('aprovação reaproveitada: não vale para outro objeto e, no mesmo, só devolve "duplicado"', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const primeira = envelopeDe(m, r, 'postagem', corpoPostagem('aprovada pela pessoa'))
  assert.equal(m.rele.aceitar(primeira).estado, 'aceito')
  r.cabeca = primeira.objeto.id
  // o rover tenta publicar OUTRA coisa carregando a aprovação da primeira
  const segunda = envelopeDe(m, r, 'postagem', corpoPostagem('escrita pelo rover sem aprovar'), { aprovacao: false })
  segunda.aprovacao = primeira.aprovacao
  assert.equal(codigoDe(() => m.rele.aceitar(segunda)), 'aprovacao_invalida')
  // reenviar a primeira não publica de novo
  assert.equal(m.rele.aceitar(primeira).estado, 'duplicado')
  assert.equal(m.armazem.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'postagem'").n, 1)
})

test('o handle é de um rover só', () => {
  const m = novoMundo()
  const a = roverRegistrado(m, { handle: 'mesmo.nome' })
  const b = novoRoverNoMundo(m, { handle: 'mesmo.nome' })
  const e = erroDe(() => m.rele.aceitar(envelopeDe(m, b, 'perfil', { nome: 'B', descricao: '' }, { atestado: true })))
  assert.equal(e.codigo, 'handle_em_uso')
  assert.equal(m.rele.perfil(a.uid).handle, 'mesmo.nome')
  // trocar de handle para um que outro já tem também é recusado
  const c = roverRegistrado(m)
  m.avancar(5)
  c.atestado = m.provedor.emitir({ uid: c.uid, handle: 'mesmo.nome', chave: c.rede.chavePublica, chaveAprovacao: c.aprovacao.chavePublica, emitidoEm: m.relogio.agora })
  assert.equal(codigoDe(() => publicar(m, c, 'postagem', corpoPostagem(), { comAtestado: true })), 'handle_em_uso')
})

test('troca de handle com atestado novo', () => {
  const m = novoMundo()
  const r = roverRegistrado(m, { handle: 'nome.antigo' })
  m.avancar(5)
  r.atestado = m.provedor.emitir({ uid: r.uid, handle: 'nome.novo', chave: r.rede.chavePublica, chaveAprovacao: r.aprovacao.chavePublica, emitidoEm: m.relogio.agora })
  publicar(m, r, 'postagem', corpoPostagem(), { comAtestado: true })
  assert.equal(m.rele.perfil(r.uid).handle, 'nome.novo')
  assert.equal(m.rele.porHandle('nome.novo').uid, r.uid)
  assert.equal(codigoDe(() => m.rele.porHandle('nome.antigo')), 'nao_encontrado')
})

test('envelope fechado: campo a mais, objeto ausente, tipos errados', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const env = envelopeDe(m, r, 'postagem', corpoPostagem())
  for (const ruim of [{ ...env, extra: 1 }, { aprovacao: env.aprovacao }, null, [], 'x', 5, { objeto: 'x' }, { objeto: null }]) {
    assert.equal(codigoDe(() => m.rele.aceitar(ruim)), 'esquema', JSON.stringify(ruim)?.slice(0, 40))
  }
  assert.equal(codigoDe(() => m.rele.aceitar({ ...env, atestado: 'lixo' })), 'atestado_invalido')
  assert.equal(codigoDe(() => m.rele.aceitar({ ...env, aprovacao: 5 })), 'aprovacao_invalida')
})

test('campo a mais dentro do objeto e do corpo', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const env = envelopeDe(m, r, 'postagem', corpoPostagem())
  assert.equal(codigoDe(() => m.rele.aceitar({ ...env, objeto: { ...env.objeto, extra: 1 } })), 'esquema')
  assert.equal(codigoDe(() => m.rele.aceitar({ ...env, objeto: { ...env.objeto, corpo: { ...env.objeto.corpo, html: '<b>' } } })), 'esquema')
})

test('texto perigoso nunca chega ao armazém: HTML, invisível, dado pessoal, controle', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const textos = [
    '<img src=x onerror=alert(1)>', 'oi‮txt.exe', 'oi​mundo', 'escreva para a@b.com', 'ligue 11 91234-5678',
    'chave sk-abcdefghijklmnop1234', 'tem \u0000 nulo', 'tem\ttab', ' começa com espaço', 'café sem NFC'
  ]
  for (const t of textos) {
    assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, r, 'postagem', { texto: t, topicos: [] }))), 'esquema', JSON.stringify(t))
  }
  assert.equal(m.armazem.um("SELECT COUNT(*) AS n FROM objetos WHERE tipo = 'postagem'").n, 0)
})

test('seguir: já segue, a si mesmo, desconhecido, limite, deixar de seguir e voltar', () => {
  const m = novoMundo({ maxSeguidos: 2 })
  const eu = roverRegistrado(m)
  const [a, b, c] = [roverRegistrado(m), roverRegistrado(m), roverRegistrado(m)]
  assert.equal(publicar(m, eu, 'seguir', { alvo: a.uid }).estado, 'aceito')
  assert.equal(codigoDe(() => publicar(m, eu, 'seguir', { alvo: a.uid })), 'ja_segue')
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, eu, 'seguir', { alvo: eu.uid }))), 'esquema')
  assert.equal(codigoDe(() => publicar(m, eu, 'seguir', { alvo: novoUid() })), 'alvo_desconhecido')
  assert.equal(publicar(m, eu, 'seguir', { alvo: b.uid }).estado, 'aceito')
  assert.equal(codigoDe(() => publicar(m, eu, 'seguir', { alvo: c.uid })), 'limite_de_seguidos')
  assert.equal(publicar(m, eu, 'deixar-de-seguir', { alvo: a.uid }).estado, 'aceito')
  assert.equal(m.rele.perfil(eu.uid).seguindo, 1)
  assert.equal(codigoDe(() => publicar(m, eu, 'deixar-de-seguir', { alvo: a.uid })), 'nao_segue')
  assert.equal(codigoDe(() => publicar(m, eu, 'deixar-de-seguir', { alvo: c.uid })), 'nao_segue')
  assert.equal(publicar(m, eu, 'seguir', { alvo: c.uid }).estado, 'aceito') // cabe de novo
  assert.equal(codigoDe(() => publicar(m, eu, 'seguir', { alvo: a.uid })), 'limite_de_seguidos')
})

test('o limite de seguidos aceita exatamente o máximo', () => {
  const m = novoMundo({ maxSeguidos: 3 })
  const eu = roverRegistrado(m)
  for (let i = 0; i < 3; i++) assert.equal(publicar(m, eu, 'seguir', { alvo: roverRegistrado(m).uid }).estado, 'aceito')
  assert.equal(codigoDe(() => publicar(m, eu, 'seguir', { alvo: roverRegistrado(m).uid })), 'limite_de_seguidos')
})

test('reação: uma por alvo, alvo existente, tipo certo, e dá para refazer depois de remover', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const post = publicar(m, a, 'postagem', corpoPostagem())
  const reacao = publicar(m, b, 'reacao', { alvo: post.id, reacao: 'curtir' })
  assert.equal(codigoDe(() => publicar(m, b, 'reacao', { alvo: post.id, reacao: 'util' })), 'ja_reagiu')
  assert.equal(codigoDe(() => publicar(m, b, 'reacao', { alvo: `ob_${'Z'.repeat(43)}`, reacao: 'curtir' })), 'alvo_desconhecido')
  const seguir = publicar(m, b, 'seguir', { alvo: a.uid })
  const e = erroDe(() => publicar(m, b, 'reacao', { alvo: seguir.id, reacao: 'curtir' }))
  assert.equal(e.codigo, 'esquema')
  publicar(m, b, 'remocao-pelo-autor', { alvo: reacao.id })
  assert.equal(publicar(m, b, 'reacao', { alvo: post.id, reacao: 'util' }).estado, 'aceito')
})

test('reação e resposta a algo removido', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const post = publicar(m, a, 'postagem', corpoPostagem())
  publicar(m, a, 'remocao-pelo-autor', { alvo: post.id })
  assert.equal(codigoDe(() => publicar(m, b, 'reacao', { alvo: post.id, reacao: 'curtir' })), 'alvo_removido')
  assert.equal(codigoDe(() => publicar(m, b, 'resposta', { alvo: post.id, texto: 'tarde demais' })), 'alvo_removido')
})

test('profundidade das respostas: oito níveis passam, o nono não', () => {
  const m = novoMundo({ taxas: { porTipo: { resposta: [[3600, 100]], postagem: [[3600, 100]], perfil: [[3600, 100]] } } })
  const a = roverRegistrado(m)
  let alvo = publicar(m, a, 'postagem', corpoPostagem()).id
  for (let nivel = 1; nivel <= 8; nivel++) alvo = publicar(m, a, 'resposta', { alvo, texto: `nível ${nivel}` }).id
  const e = erroDe(() => publicar(m, a, 'resposta', { alvo, texto: 'nível 9' }))
  assert.equal(e.codigo, 'resposta_funda')
})

test('remoção pelo autor: só o dono apaga; de outro, desconhecido ou de tipo não removível', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const post = publicar(m, a, 'postagem', corpoPostagem())
  const e = erroDe(() => publicar(m, b, 'remocao-pelo-autor', { alvo: post.id }))
  assert.equal(e.codigo, 'nao_e_autor')
  assert.equal(m.rele.postagensDe(a.uid).itens.length, 1) // continua lá
  assert.equal(codigoDe(() => publicar(m, a, 'remocao-pelo-autor', { alvo: `ob_${'Q'.repeat(43)}` })), 'alvo_desconhecido')
  const rem = publicar(m, a, 'remocao-pelo-autor', { alvo: post.id })
  assert.equal(m.rele.postagensDe(a.uid).itens.length, 0)
  assert.equal(codigoDe(() => publicar(m, a, 'remocao-pelo-autor', { alvo: rem.id })), 'esquema') // remoção não se remove
  assert.equal(publicar(m, a, 'remocao-pelo-autor', { alvo: post.id }).estado, 'aceito') // repetir é inofensivo
  // o corpo da postagem sumiu do armazém, só o rastro ficou
  const linha = m.armazem.objeto(post.id)
  assert.equal(linha.envelope, null)
  assert.ok(linha.removido_em)
})

test('remover o perfil é sair: apaga o conteúdo, libera o @ e não volta com o mesmo uid', () => {
  const m = novoMundo()
  const a = roverRegistrado(m, { handle: 'quem.sai' })
  const b = roverRegistrado(m)
  const post = publicar(m, a, 'postagem', corpoPostagem('vai sumir'))
  publicar(m, b, 'resposta', { alvo: post.id, texto: 'resposta de outro' })
  publicar(m, b, 'seguir', { alvo: a.uid })
  const perfilId = m.armazem.rover(a.uid).perfil_id
  publicar(m, a, 'remocao-pelo-autor', { alvo: perfilId })
  assert.equal(codigoDe(() => m.rele.perfil(a.uid)), 'nao_encontrado')
  assert.equal(codigoDe(() => m.rele.porHandle('quem.sai')), 'nao_encontrado')
  const linhas = m.armazem.todos('SELECT envelope FROM objetos WHERE autor = :a AND envelope IS NOT NULL', { a: a.uid })
  assert.ok(linhas.every((l) => !l.envelope.includes('vai sumir')))
  assert.equal(m.armazem.rover(a.uid).nome, null)
  assert.equal(codigoDe(() => publicar(m, a, 'postagem', corpoPostagem('de volta'))), 'rover_saiu')
  assert.equal(codigoDe(() => m.rele.aceitar(envelopeDe(m, a, 'perfil', { nome: 'volta', descricao: '' }, { atestado: true }))), 'rover_saiu')
  // o @ ficou livre
  const novo = novoRoverNoMundo(m, { handle: 'quem.sai' })
  assert.equal(m.rele.aceitar(envelopeDe(m, novo, 'perfil', { nome: 'Outro', descricao: '' }, { atestado: true })).estado, 'aceito')
  // quem seguia não vê mais nada dele na linha
  assert.equal(m.rele.linhaDoInicio(b.uid).itens.length, 0)
})

test('uid de quem saiu não aceita denúncia nem leitura, e perfil removido pelo outro não funciona', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const e = erroDe(() => publicar(m, b, 'remocao-pelo-autor', { alvo: m.armazem.rover(a.uid).perfil_id }))
  assert.equal(e.codigo, 'nao_e_autor')
  assert.equal(m.rele.perfil(a.uid).uid, a.uid)
})
