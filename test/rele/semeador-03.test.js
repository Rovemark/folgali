// SPDX-License-Identifier: AGPL-3.0-or-later
// O semeador da rede social e do fórum (protocolo 0.3) contra o relé de verdade, em HTTP, com o RELÓGIO NA MÃO: o relé real manda no
// tempo (conta de 1 dia para criar comunidade, amizade de 3 dias para depoimento, de 7 para selo, carência na comunidade), e o semeador
// não força nada: adia e diz quando voltar. Aqui o relógio anda por etapas e cada etapa prova o que amadureceu.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { criarObjeto, validarObjeto } from '../../packages/protocolo/src/index.js'
import { Armazem } from '../../packages/rele/src/armazem.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import { ProvedorEstatico } from '../../packages/rele/src/provedor.js'
import { Rele } from '../../packages/rele/src/rele.js'
import { CATALOGO } from '../../packages/rele/scripts/demo/catalogo.mjs'
import { emissorDe, roverDe } from '../../packages/rele/scripts/demo/chaves-demo.mjs'
import { ErroDeSemeadura, FASES, novoLedger, semear } from '../../packages/rele/scripts/demo/semeador.mjs'

const CLI = new URL('../../packages/rele/scripts/semear-demo.mjs', import.meta.url).pathname
const T0 = 1_900_000_000
const DIA = 86400
const fechados = []

/** Um relé em HTTP com relógio que o teste controla, que confia só no emissor desta semente. Contas nascem com idade zero. */
async function subirRele({ semFatorDeIdade = true } = {}) {
  const semente = randomBytes(32)
  const emissor = emissorDe(semente)
  const relogio = { agora: T0 }
  const rele = new Rele({
    armazem: new Armazem(':memory:'), provedor: new ProvedorEstatico({ emissores: [emissor.chavePublica], nome: 'teste' }),
    relogio: () => relogio.agora, segredoDeDenuncias: randomBytes(32), semFatorDeIdade
  })
  const servidor = criarServidor({ rele, registrar: () => {}, rajada: { capacidade: 1_000_000, porSegundo: 1_000_000 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${servidor.address().port}`
  const fechar = () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) })
  fechados.push(fechar)
  const get = async (caminho) => { const r = await fetch(url + caminho); return { status: r.status, json: await r.json().catch(() => null) } }
  const ledger = novoLedger()
  const rodar = (extra = {}) => semear({ url, semente, intervaloMs: 0, relogio: () => relogio.agora, ledger, ...extra })
  const avancar = (s) => { relogio.agora += s }
  return { url, semente, relogio, rele, get, ledger, rodar, avancar, fechar }
}
test.after(async () => { for (const f of fechados) await f().catch(() => {}) })

const porFase = (lista) => { const o = {}; for (const a of lista) o[a.fase] = (o[a.fase] ?? 0) + 1; return o }
const idDeRef = (ref) => `ob_${createHash('sha256').update(ref).digest('base64url').slice(0, 43)}`

// ------------------------------------------------------------------------------------------------------------------------------
// O catálogo: tudo precisa ser publicável e coerente antes de ir ao relé
// ------------------------------------------------------------------------------------------------------------------------------

test('catálogo 0.3: o corpo de cada item de cada fase passa no validador do protocolo, e a chave de cada item é única por autor', () => {
  const semente = randomBytes(32)
  const ctx = { uidDe: (slug) => roverDe(semente, slug).uid, idDe: idDeRef, agora: () => T0, pedir: async () => ({ status: 200, json: { itens: [] } }) }
  let itens = 0
  for (const fase of FASES.filter((f) => f.exige === '0.3')) {
    const vistas = new Set()
    for (const item of fase.itens(CATALOGO)) {
      const slug = fase.autor(item)
      const k = roverDe(semente, slug)
      const corpo = fase.corpo(item, ctx)
      const o = criarObjeto({ tipo: fase.tipo, autor: k.uid, criadoEm: T0, corpo, chavePrivada: k.rede.chavePrivada })
      const v = validarObjeto(o)
      assert.ok(v.ok, `${fase.nome} (${slug}): ${v.erro?.message}`)
      const chave = `${slug}|${fase.chave(item, ctx)}`
      assert.ok(!vistas.has(chave), `${fase.nome}: item repetido ${chave}`)
      vistas.add(chave)
      itens++
    }
  }
  assert.ok(itens >= 250, `o catálogo 0.3 tem ${itens} itens`)
})

test('catálogo 0.3: perfis, retratos, amizades, recados e papéis nas comunidades fazem sentido entre si', () => {
  const slugs = new Set(CATALOGO.rovers.map((r) => r.slug))
  assert.equal(CATALOGO.rovers.length, 18)
  for (const r of CATALOGO.rovers) {
    assert.ok(r.perfil03, `${r.slug} tem perfil 0.3`)
    assert.ok(r.perfil03.retrato.corpo && r.perfil03.retrato.cor, `${r.slug} tem retrato`)
    assert.match(r.descricao, /Rover de demonstração\.$/)
  }
  // amizades: sem repetir, sem ninguém consigo mesmo, e todo par aponta para rovers que existem
  const pares = new Set()
  for (const [a, b] of [...CATALOGO.amizades, ...CATALOGO.pedidosPendentes]) {
    assert.ok(slugs.has(a) && slugs.has(b) && a !== b, `${a} e ${b}`)
    const par = [a, b].sort().join('|')
    assert.ok(!pares.has(par), `par repetido ${par}`)
    pares.add(par)
  }
  const amigos = (a, b) => CATALOGO.amizades.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
  // recados: quem escreve pode escrever ali (nina só aceita amigo, biscoito não aceita) e nenhum par passa de 3 por dia
  const perfilDe = Object.fromEntries(CATALOGO.rovers.map((r) => [r.slug, r.perfil03]))
  const porPar = new Map()
  for (const r of CATALOGO.recados) {
    assert.notEqual(r.de, r.para)
    const regra = perfilDe[r.para].recados ?? 'todos'
    assert.notEqual(regra, 'ninguem', `${r.para} não aceita recado`)
    if (regra === 'amigos') assert.ok(amigos(r.de, r.para), `${r.de} não é amigo de ${r.para}`)
    porPar.set(`${r.de}>${r.para}`, (porPar.get(`${r.de}>${r.para}`) ?? 0) + 1)
  }
  for (const [par, n] of porPar) assert.ok(n <= 3, `${par}: ${n} recados`)
  // depoimentos e selos só entre amigos (com tempo), e quem recebe aceita
  for (const d of CATALOGO.depoimentos) assert.ok(amigos(d.de, d.para), `depoimento ${d.de} -> ${d.para}`)
  for (const [de, para] of CATALOGO.selos) assert.ok(amigos(de, para), `selo ${de} -> ${para}`)
  // comunidades: dono, moderadores e membros existem; ninguém repete; só abertas e moderadas (a fechada some para o visitante)
  const refsC = new Set()
  for (const c of CATALOGO.comunidades) {
    assert.ok(['aberta', 'moderada'].includes(c.acesso), c.ref)
    const gente = [c.dono, ...c.moderadores, ...c.membros]
    assert.equal(new Set(gente).size, gente.length, `${c.ref}: gente repetida`)
    for (const g of gente) assert.ok(slugs.has(g), g)
    refsC.add(c.ref)
  }
  const papelEm = (c, slug) => {
    const cv = CATALOGO.comunidades.find((x) => x.ref === c)
    return cv.dono === slug ? 'dono' : cv.moderadores.includes(slug) ? 'moderador' : cv.membros.includes(slug) ? 'membro' : null
  }
  // tópicos: autor tem papel na comunidade; enquete com opções e duração válidas; categoria existe na comunidade
  const refsT = new Set()
  for (const t of CATALOGO.topicos) {
    assert.ok(refsC.has(t.c), t.ref)
    assert.ok(papelEm(t.c, t.de), `${t.ref}: ${t.de} não participa de ${t.c}`)
    if (t.categoria) assert.ok(CATALOGO.comunidades.find((x) => x.ref === t.c).categorias.includes(t.categoria), `${t.ref}: categoria ${t.categoria}`)
    if (t.enquete) assert.ok(t.enquete.opcoes.length >= 2 && t.enquete.dias >= 1 / 24 && t.enquete.dias <= 30)
    refsT.add(t.ref)
  }
  // respostas de fórum: o tópico existe, quem responde participa, `em` e `cita` apontam para respostas ANTERIORES do mesmo tópico
  const vistas = new Map()
  for (const f of CATALOGO.respostasForum) {
    assert.ok(refsT.has(f.t), `${f.ref}: tópico ${f.t}`)
    const t = CATALOGO.topicos.find((x) => x.ref === f.t)
    assert.ok(papelEm(t.c, f.de), `${f.ref}: ${f.de} não participa de ${t.c}`)
    for (const alvo of [f.em, f.cita].filter(Boolean)) assert.equal(vistas.get(alvo), f.t, `${f.ref} aponta para ${alvo}, que não é anterior no mesmo tópico`)
    if (f.em) assert.ok(!CATALOGO.respostasForum.find((x) => x.ref === f.em).em, `${f.ref}: só um nível de aninhamento`)
    vistas.set(f.ref, f.t)
  }
  for (const r of CATALOGO.resolvidos) assert.equal(vistas.get(r.f), r.t)
  for (const [, t, opcao] of CATALOGO.votos) assert.ok(opcao < CATALOGO.topicos.find((x) => x.ref === t).enquete.opcoes.length)
  // nenhuma string do catálogo 0.3 tem travessão (regra da casa)
  assert.ok(!/[—–]/.test(JSON.stringify(CATALOGO)), 'travessão e meia-risca estão proibidos')
})

// ------------------------------------------------------------------------------------------------------------------------------
// O tempo: a semeadura espera o relé, não o contorna
// ------------------------------------------------------------------------------------------------------------------------------

test('dia 0: publica o que não tem idade mínima, ADIA comunidade e página com a data certa, e nada que dependa delas é publicado', async () => {
  const m = await subirRele()
  const r = await m.rodar()
  for (const [fase, n] of Object.entries({ perfis: 18, postagens: 24, respostas: 30, seguir: 48, reacoes: 69, estados: 18, 'amizades-pedir': 22, 'amizades-aceitar': 20, recados: 22, entregas: 8, relacoes: 1 })) {
    assert.equal(r.criados[fase], n, fase)
  }
  const adiados = porFase(r.adiados)
  assert.deepEqual(Object.keys(adiados).filter((f) => !['comunidades', 'paginas'].includes(f) && !r.adiados.filter((a) => a.fase === f).every((a) => /depende de/.test(a.motivo) || a.motivo === 'conta_nova' || a.motivo === 'em_carencia')), [], 'todo adiamento tem motivo de tempo ou de dependência')
  assert.equal(adiados.comunidades, 5)
  assert.equal(adiados.paginas, 3)
  assert.ok(r.adiados.filter((a) => a.fase === 'comunidades').every((a) => a.motivo === 'conta_nova'))
  // a idade pedida é de 1 dia: o relé responde quanto falta (86400 menos o que passou desde o perfil, poucos segundos) e o semeador devolve a data
  assert.ok(r.proximaRodada >= T0 + DIA - 5 && r.proximaRodada <= T0 + DIA + 5, `próxima rodada ${r.proximaRodada - T0}`)
  // o que depende de comunidade ou de página nem foi tentado: nenhum criado, todos adiados por dependência
  for (const fase of ['comunidades-entrar', 'topicos', 'respostas-forum', 'votos', 'paginas-seguir', 'atualizacoes', 'moderacao-banir']) {
    assert.equal(r.criados[fase] ?? 0, 0, fase)
    assert.ok(r.adiados.filter((a) => a.fase === fase).every((a) => /depende de/.test(a.motivo)), fase)
  }
  assert.equal((await m.get('/v1/comunidades')).json.itens.length, 0)
  assert.equal((await m.get('/v1/paginas')).json.itens.length, 0)
  // o perfil 0.3 chegou ao relé, com retrato e a regra de recados
  const nina = roverDe(m.semente, 'nina').uid
  const p = (await m.get(`/v1/rovers/${nina}`)).json
  assert.equal(p.perfil.corpo.recados, 'amigos')
  assert.deepEqual(p.perfil.corpo.retrato, { corpo: 'orelhinhas', cor: 'rosa', veste: 'laco', acessorio: 'cachecol' })
  assert.ok(p.perfil.corpo.habilidades.length > 0 && p.perfil.corpo.sobre.length > 20)
})

test('amadurece por etapas: 1 dia, 10 minutos, 3 dias, 7 dias, e a última rodada não cria mais nada', async () => {
  const m = await subirRele()
  await m.rodar()

  // 11 minutos depois ainda é cedo: nada mudou (e o semeador não insiste em nada que o relé recusaria por idade)
  m.avancar(660)
  const cedo = await m.rodar()
  assert.deepEqual(cedo.criados, {})

  // 1 dia: a conta tem idade para criar comunidade e página, e tudo que dependia delas entra, menos o que tem carência
  m.avancar(DIA)
  const dia1 = await m.rodar()
  for (const [fase, n] of Object.entries({ comunidades: 5, 'comunidades-entrar': 26, 'comunidades-aprovar': 8, 'comunidades-moderadores': 4, topicos: 10, paginas: 3, 'paginas-admins': 3, 'paginas-seguir': 16, atualizacoes: 7 })) {
    assert.equal(dia1.criados[fase], n, fase)
  }
  // quem entrou agora espera 10 minutos para responder e 1 hora para votar; dono e moderador respondem na hora
  assert.equal(dia1.criados['respostas-forum'], 7)
  assert.equal(adiadosEm(dia1, 'respostas-forum'), 17)
  assert.equal(adiadosEm(dia1, 'votos'), 10)
  assert.ok(dia1.adiados.filter((a) => a.fase === 'respostas-forum').every((a) => a.motivo === 'em_carencia' || /depende de/.test(a.motivo)))
  assert.ok(dia1.proximaRodada >= m.relogio.agora && dia1.proximaRodada <= m.relogio.agora + 700, 'a próxima volta útil é em cerca de 10 minutos')
  // depoimento e selo seguem esperando a amizade ter 3 e 7 dias
  assert.equal(adiadosEm(dia1, 'depoimentos'), 6)
  assert.equal(adiadosEm(dia1, 'selos'), 14)

  // 1 hora e 10 minutos: respostas, voto, resolvido e o caso de moderação (que depende da resposta de spam) entram
  m.avancar(3700)
  const hora = await m.rodar()
  for (const [fase, n] of Object.entries({ 'respostas-forum': 17, votos: 10, 'topicos-resolvidos': 1, 'moderacao-resposta': 1, 'moderacao-remover': 1, 'moderacao-banir': 1, 'moderacao-apelar': 1 })) {
    assert.equal(hora.criados[fase], n, fase)
  }
  assert.equal(adiadosEm(hora, 'respostas-forum'), 0)

  // 3 dias: amizades de 3 dias dão depoimento, o dono aceita; selo ainda não
  m.avancar(3 * DIA)
  const dia3 = await m.rodar()
  assert.equal(dia3.criados.depoimentos, 6)
  assert.equal(dia3.criados['depoimentos-aceitar'], 6)
  assert.equal(adiadosEm(dia3, 'selos'), 14)

  // 7 dias: selo
  m.avancar(7 * DIA)
  const dia7 = await m.rodar()
  assert.equal(dia7.criados.selos, 14)
  assert.deepEqual(dia7.adiados, [])
  assert.equal(dia7.proximaRodada, null)

  // e uma rodada a mais não faz nada: idempotente
  const ultima = await m.rodar()
  assert.deepEqual(ultima.criados, {})
  assert.deepEqual(ultima.adiados, [])

  // o que as telas leem
  const comunidades = (await m.get('/v1/comunidades?limite=50')).json.itens
  assert.deepEqual(comunidades.map((c) => c.nome).sort(), CATALOGO.comunidades.map((c) => c.nome).sort())
  const pastas = comunidades.find((c) => c.nome === 'Pastas e Mapas')
  const lista = (await m.get(`/v1/comunidades/${pastas.id}/topicos`)).json
  assert.deepEqual(lista.fixados.map((t) => t.titulo), ['Regras e boas-vindas'])
  const topicos = Object.fromEntries(lista.itens.map((t) => [t.titulo, t]))
  assert.equal(topicos['Mudança nas regras de respostas'].trancado, true)
  assert.equal(topicos['Como vocês fazem backup de pasta de trabalho?'].resolvido, true)
  assert.equal(topicos['Como vocês fazem backup de pasta de trabalho?'].respostas, 6)
  assert.equal(topicos['Qual convenção de nome de arquivo vocês adotam?'].enquete, true)
  assert.equal(topicos['O arquivo que apareceu duas vezes'].respostas, 0, 'um tópico sem resposta, de propósito')
  const madrugada = comunidades.find((c) => c.nome === 'Madrugada Produtiva')
  const registro = (await m.get(`/v1/comunidades/${madrugada.id}/moderacao/registro`)).json.itens
  assert.deepEqual(registro.map((e) => e.acao).sort(), ['banimento', 'remocao'])
  assert.ok(registro.every((e) => e.motivo === 'spam'))
  assert.equal((await m.get('/v1/paginas?limite=50')).json.itens.length, 3)
  const teco = roverDe(m.semente, 'teco').uid
  assert.equal((await m.get(`/v1/rovers/${teco}/depoimentos`)).json.itens.length, 2, 'só os aceitos aparecem')
  assert.deepEqual((await m.get(`/v1/rovers/${teco}/selos`)).json.selos, { confiavel: 1, caprichoso: 1, rapido: 1, divertido: 1 })
})
const adiadosEm = (r, fase) => r.adiados.filter((a) => a.fase === fase).length

test('o ledger leva o autor na chave: dois rovers que seguem o mesmo alvo contam como dois', async () => {
  const m = await subirRele()
  const r = await m.rodar()
  assert.equal(r.criados.seguir, CATALOGO.seguir.length)
  assert.equal(Object.keys(m.ledger.itens.seguir).length, CATALOGO.seguir.length)
  assert.ok(Object.keys(m.ledger.itens.seguir).every((k) => /^[a-z]+\|rvr_/.test(k)), 'autor e alvo na chave')
  const segue = {}
  for (const [de, para] of CATALOGO.seguir) if (para === 'pipa') segue[de] = true
  assert.ok(Object.keys(segue).length >= 4, 'o catálogo tem vários seguidores da mesma pessoa')
  const pipa = roverDe(m.semente, 'pipa').uid
  assert.equal((await m.get(`/v1/rovers/${pipa}`)).json.seguidores, Object.keys(segue).length)
})

test('o catálogo cresce: itens novos que dividem partes da chave com os antigos entram, e o que já existia não se repete', async () => {
  const m = await subirRele()
  await m.rodar()
  m.avancar(DIA + 60)
  await m.rodar()
  m.avancar(3700)
  await m.rodar()
  m.avancar(10 * DIA)
  await m.rodar()
  const maior = {
    ...CATALOGO,
    estados: [...CATALOGO.estados, ['pipa', 'dormindo'], ['pipa', 'ausente']],
    amizades: [...CATALOGO.amizades, ['juju', 'tuca'], ['juju', 'max']],
    votos: [...CATALOGO.votos, ['teco', 't-nomes', 0]],
    reacoesSociais: [...CATALOGO.reacoesSociais, ['teco', 't-boasvindas', 'curtir'], ['pipa', 'f-24', 'util']],
    selos: [...CATALOGO.selos, ['tuca', 'nina', 'confiavel'], ['max', 'tuca', 'divertido']],
    relacoes: [...CATALOGO.relacoes, ['lola', 'nina', 'silenciar'], ['max', 'pingo', 'silenciar'], ['max', 'pingo', 'dessilenciar']],
    recados: [...CATALOGO.recados, { de: 'nina', para: 'teco', texto: 'Segundo recado do dia, que não repete o primeiro.' }]
  }
  const r = await m.rodar({ catalogo: maior })
  assert.deepEqual(r.criados, {
    estados: 2, 'amizades-pedir': 2, 'amizades-aceitar': 2, votos: 1, 'reacoes-sociais': 2, selos: 2, relacoes: 3, recados: 1
  })
  const segunda = await m.rodar({ catalogo: maior })
  assert.deepEqual(segunda.criados, {})
})

test('o ledger guarda `true` para ação (o relé não serve o envelope) e o id para conteúdo', async () => {
  const m = await subirRele()
  // o calendário inteiro, para que TODAS as fases (voto, selo, moderação...) tenham rodado antes de olhar o ledger
  await m.rodar()
  m.avancar(DIA + 60)
  await m.rodar()
  m.avancar(3700)
  await m.rodar()
  m.avancar(11 * DIA)
  await m.rodar()
  // lista escrita à mão, não derivada do flag `acao` das fases (senão um flag errado se confirmaria sozinho)
  const ACOES = [
    'estados', 'amizades-pedir', 'amizades-aceitar', 'comunidades-entrar', 'comunidades-aprovar', 'comunidades-moderadores',
    'topicos-resolvidos', 'topicos-fixar', 'topicos-trancar', 'votos', 'paginas-admins', 'paginas-seguir', 'depoimentos-aceitar', 'selos',
    'relacoes', 'moderacao-remover', 'moderacao-banir', 'moderacao-apelar'
  ]
  const CONTEUDO = ['postagens', 'respostas', 'recados', 'entregas', 'comunidades', 'topicos', 'respostas-forum', 'paginas', 'atualizacoes', 'depoimentos', 'moderacao-resposta']
  const feitas = Object.keys(m.ledger.itens)
  for (const fase of [...ACOES, ...CONTEUDO]) assert.ok(feitas.includes(fase), `${fase} rodou e está no ledger`)
  for (const fase of ACOES) for (const v of Object.values(m.ledger.itens[fase] ?? {})) assert.equal(v, true, `${fase}: ação guarda true`)
  for (const fase of CONTEUDO) for (const v of Object.values(m.ledger.itens[fase] ?? {})) assert.match(v, /^ob_/, `${fase}: conteúdo guarda o id`)
  assert.ok(Object.keys(m.ledger.itens).length > 15)
})

test('a enquete dura o que o catálogo diz, contado do momento da publicação', async () => {
  const m = await subirRele()
  await m.rodar()
  m.avancar(DIA + 60)
  const t = m.relogio.agora
  await m.rodar()
  const comunidades = (await m.get('/v1/comunidades?limite=50')).json.itens
  const pastas = comunidades.find((c) => c.nome === 'Pastas e Mapas')
  const topicos = (await m.get(`/v1/comunidades/${pastas.id}/topicos`)).json.itens
  const comEnquete = topicos.find((x) => x.enquete)
  const { enquete } = (await m.get(`/v1/topicos/${comEnquete.id}`)).json
  assert.equal(enquete.encerraEm, t + CATALOGO.topicos.find((x) => x.enquete).enquete.dias * DIA)
  assert.deepEqual(enquete.opcoes.map((o) => o.texto), CATALOGO.topicos.find((x) => x.enquete).enquete.opcoes)
})

test('o atestado vale 80 dias e é renovado quando faltam menos de 30; antes disso o perfil fica como está', async () => {
  const m = await subirRele()
  await m.rodar()
  const uid = roverDe(m.semente, 'pipa').uid
  const atestado = async () => (await m.get(`/v1/rovers/${uid}`)).json.atestado
  const a0 = await atestado()
  assert.equal(a0.expiraEm - a0.emitidoEm, 80 * DIA)
  // faltam 30 dias e meio: ainda não renova
  m.avancar(80 * DIA - 30 * DIA - 12 * 3600 - 10)
  const cedo = await m.rodar()
  assert.equal(cedo.existentes.perfis, 18)
  assert.equal((await atestado()).emitidoEm, a0.emitidoEm)
  // faltam 29 dias e meio: renova (um perfil novo com o atestado novo), e o relé aceita porque o atestado antigo ainda vale
  m.avancar(DIA)
  const tarde = await m.rodar()
  assert.equal(tarde.criados.perfis, 18)
  const a1 = await atestado()
  assert.ok(a1.emitidoEm > a0.emitidoEm)
  assert.equal(a1.expiraEm - a1.emitidoEm, 80 * DIA)
})

test('ledger perdido: com o relé já semeado a rodada RECUSA e diz por quê; com a opção explícita, comunidade e página não duplicam e o relógio não derruba', async () => {
  const m = await subirRele()
  await m.rodar()
  m.avancar(DIA + 60)
  await m.rodar()
  const antes = (await m.get('/v1/comunidades?limite=50')).json.itens.map((c) => c.id).sort()
  const paginasAntes = (await m.get('/v1/paginas?limite=50')).json.itens.map((c) => c.id).sort()
  assert.equal(antes.length, 5)
  m.ledger.itens = {}
  m.ledger.rovers = {}
  m.avancar(5)
  await assert.rejects(() => m.rodar(), /o registro do que foi feito \(o arquivo de estado\) está vazio/)
  // --simular só lê: não recusa
  assert.equal((await m.rodar({ simular: true })).simulado, true)
  // com a opção, segue: a cabeça de cada rover é uma ação que o relé não serve, e mesmo assim o relógio não anda para trás
  const r = await m.rodar({ aceitarSemLedger: true })
  assert.equal(r.existentes.comunidades, 5, 'o relé disse que já existem e o semeador recuperou o id pelo nome')
  assert.equal(r.existentes.paginas, 3)
  assert.equal(r.existentes.perfis, 18)
  assert.deepEqual((await m.get('/v1/comunidades?limite=50')).json.itens.map((c) => c.id).sort(), antes)
  assert.deepEqual((await m.get('/v1/paginas?limite=50')).json.itens.map((c) => c.id).sort(), paginasAntes)
  assert.ok(m.ledger.itens.comunidades && Object.values(m.ledger.itens.comunidades).every((id) => /^ob_/.test(id)), 'o id recuperado entrou no ledger')
})

test('--simular só lê e conta: não publica, não grava no ledger e não adia', async () => {
  const m = await subirRele()
  const r = await m.rodar({ simular: true })
  assert.equal(r.simulado, true)
  assert.equal(r.criados.perfis, 18)
  assert.deepEqual(r.adiados, [])
  assert.deepEqual(m.ledger.itens, {})
  assert.equal((await m.get(`/v1/rovers/${roverDe(m.semente, 'seixo').uid}`)).status, 404, 'nenhum rover foi criado')
})

test('o progresso é entregue ao chamador depois de cada fase e no fim, mesmo quando a rodada falha', async () => {
  const m = await subirRele()
  const vezes = []
  await m.rodar({ aoProgredir: (l) => vezes.push(Object.keys(l.itens).length) })
  assert.ok(vezes.length >= FASES.filter((f) => f.exige === null || f.exige === '0.3').length, 'uma vez por fase, mais o fim')
  assert.ok(vezes.at(-1) >= vezes[0])
  let chamadas = 0
  const quebrado = { ...CATALOGO, respostas: [{ ref: 'rx', de: 'pipa', a: 'p-que-nao-existe', texto: 'Resposta a um post que o catálogo não tem.' }] }
  const m2 = await subirRele()
  await assert.rejects(() => m2.rodar({ catalogo: quebrado, aoProgredir: () => { chamadas++ } }), ErroDeSemeadura)
  assert.ok(chamadas >= 2, 'o ledger foi entregue antes de a rodada falhar')
})

test('um ref que o catálogo nunca publica é erro de catálogo (não adiamento); um código que o relé devolve e ninguém previu interrompe com o código', async () => {
  const m = await subirRele()
  const quebrado = { ...CATALOGO, respostasForum: [{ ref: 'fx', t: 't-que-nao-existe', de: 'pipa', texto: 'Resposta a um tópico que o catálogo não tem.' }] }
  await assert.rejects(() => m.rodar({ catalogo: quebrado }), /aponta para "t-que-nao-existe", que não foi publicado nem existe/)
  const m2 = await subirRele()
  // a Lola bloqueia a Pipa; depois o catálogo pede um recado da Lola para a Pipa: o relé recusa com um código que nenhuma fase previu
  // (interacao_nao_permitida só é tolerada onde há tempo de amizade em jogo, depoimento e selo), e a semeadura para dizendo qual
  const base = { ...CATALOGO, recados: [], estados: [], amizades: [], pedidosPendentes: [], relacoes: [['lola', 'pipa', 'bloquear']] }
  await m2.rodar({ catalogo: base })
  const comRecado = { ...base, recados: [{ de: 'lola', para: 'pipa', texto: 'Um recado que o relé vai recusar, porque a Lola bloqueou a Pipa.' }] }
  await assert.rejects(() => m2.rodar({ catalogo: comRecado }), /o relé recusou recado do rover lola: interacao_nao_permitida/)
})

test('uma fase que o relé não suporta é pulada com aviso; o que o relé declara não muda o resto', async () => {
  const m = await subirRele()
  const original = FASES.length
  FASES.push({ nome: 'futuro', tipo: 'topico', exige: '9.9', itens: () => [{ de: 'seixo' }], autor: (i) => i.de, chave: () => 'x', corpo: () => ({}) })
  try {
    const r = await m.rodar()
    assert.equal(r.pulados.length, 1)
    assert.equal(r.pulados[0].fase, 'futuro')
    assert.match(r.pulados[0].motivo, /precisa da 9\.9/)
  } finally { FASES.length = original }
})

test('o relatório de adiados descreve cada item em palavras: o rótulo de cada fase', () => {
  const esperado = {
    estados: 'seixo', 'amizades-pedir': 'pipa pede a nina', 'amizades-aceitar': 'nina aceita pipa', recados: 'nina para teco',
    entregas: 'pipa: Mapa das pastas de projeto', comunidades: 'Pastas e Mapas', 'comunidades-entrar': 'seixo entra em c-pastas',
    'comunidades-aprovar': 'otto aprova max em c-revisores', 'comunidades-moderadores': 'pipa promove seixo em c-pastas', topicos: 'Regras e boas-vindas',
    'respostas-forum': 'pipa em t-backup', 'topicos-resolvidos': 't-backup resolvido por f-05', 'topicos-fixar': 'fixar t-boasvindas',
    'topicos-trancar': 'trancar t-aviso', votos: 'nina vota em t-nomes', paginas: 'Mapa de Pastas', 'paginas-admins': 'seixo administra g-mapa',
    'paginas-seguir': 'nina segue g-mapa', atualizacoes: 'pipa em g-mapa', 'reacoes-sociais': 'nina reage a t-boasvindas',
    depoimentos: 'pipa para teco', 'depoimentos-aceitar': 'teco aceita d-01', selos: 'pipa dá caprichoso a teco', relacoes: 'lola silenciar pingo',
    'moderacao-resposta': 'pingo em t-foco', 'moderacao-remover': 'biscoito remove f-spam', 'moderacao-banir': 'biscoito bane pingo', 'moderacao-apelar': 'pingo apela'
  }
  for (const fase of FASES.filter((f) => f.rotulo)) {
    const item = fase.itens(CATALOGO)[0]
    assert.equal(fase.rotulo(item), esperado[fase.nome], fase.nome)
  }
  assert.equal(Object.keys(esperado).length, FASES.filter((f) => f.rotulo).length)
})

test('uma rodada sem nada novo não faz nenhum POST, e depois de uma recuperação sem estado a rodada seguinte também não', async () => {
  const m = await subirRele()
  await m.rodar()
  m.avancar(DIA + 60)
  await m.rodar()
  m.avancar(3700)
  await m.rodar()
  m.avancar(11 * DIA)
  await m.rodar()
  const posts = []
  const contando = (...a) => { if (a[1]?.method === 'POST') posts.push(a[0]); return fetch(...a) }
  const parada = await m.rodar({ fetchFn: contando })
  assert.deepEqual(parada.criados, {})
  assert.equal(posts.length, 0, 'nenhum objeto publicado')
  // ledger perdido e recuperado com a opção: o relé diz "já existe" (ja_segue, ja_existe) e a recuperação registra isso no ledger,
  // de modo que a rodada seguinte não publica nada. (Catálogo curto: com o catálogo inteiro a recuperação repete conteúdo, como a doc diz.)
  const curto = {
    ...CATALOGO, postagens: [], respostas: [], reacoes: [], recados: [], entregas: [], comunidades: [], topicos: [], respostasForum: [], resolvidos: [], votos: [],
    paginas: [], atualizacoes: [], reacoesSociais: [], depoimentos: [], selos: [], relacoes: [], moderacao: null,
    estados: CATALOGO.estados.slice(0, 3), amizades: CATALOGO.amizades.slice(0, 3), pedidosPendentes: [], seguir: CATALOGO.seguir.slice(0, 5)
  }
  m.ledger.itens = {}
  m.ledger.rovers = {}
  m.avancar(5)
  const recuperada = await m.rodar({ catalogo: curto, aceitarSemLedger: true })
  assert.equal(recuperada.existentes.seguir, 5, 'o relé disse ja_segue e o semeador entendeu')
  assert.equal(recuperada.existentes['amizades-pedir'], 3)
  assert.ok(Object.values(m.ledger.itens.seguir).every((v) => v === true), 'o que o relé já tinha entra no ledger como feito')
  assert.ok(Object.values(m.ledger.itens['amizades-pedir']).every((v) => v === true))
  const antes = posts.length
  const seguinte = await m.rodar({ catalogo: curto, fetchFn: contando })
  assert.deepEqual(seguinte.criados, {})
  assert.equal(posts.length, antes, 'a rodada seguinte reconhece tudo e não publica nada')
})

test('sem ledger, o que é de conteúdo antigo e está na cadeia legível é reconhecido; só o que falta é publicado', async () => {
  const m = await subirRele()
  const so02 = { ...CATALOGO, estados: [], amizades: [], pedidosPendentes: [], recados: [], entregas: [], comunidades: [], topicos: [], respostasForum: [], resolvidos: [], votos: [], paginas: [], atualizacoes: [], reacoesSociais: [], depoimentos: [], selos: [], relacoes: [], moderacao: null }
  const primeira = await m.rodar({ catalogo: so02 })
  assert.equal(primeira.criados.postagens, 24)
  m.ledger.itens = {}
  m.ledger.rovers = {}
  m.avancar(5)
  const segunda = await m.rodar({ catalogo: { ...so02, postagens: [...so02.postagens, { ref: 'px', de: 'seixo', topicos: ['avisos'], texto: 'Uma postagem nova depois da recuperação.' }] }, aceitarSemLedger: true })
  assert.equal(segunda.existentes.postagens, 24, 'reconhecidas pela cadeia do rover')
  assert.equal(segunda.existentes.respostas, 30)
  assert.equal(segunda.criados.postagens, 1, 'só a nova')
  assert.equal(segunda.criados.respostas, undefined)
})

test('o atestado: faltando exatamente 30 dias ainda não renova; um segundo a menos, renova', async () => {
  const m = await subirRele()
  await m.rodar()
  const uid = roverDe(m.semente, 'pipa').uid
  const a0 = (await m.get(`/v1/rovers/${uid}`)).json.atestado
  // o atestado foi emitido 10 s antes do primeiro perfil; faltar exatamente 30 dias é estar a (80 dias - 10 s - 30 dias) do primeiro perfil
  m.avancar(a0.expiraEm - 30 * DIA - m.relogio.agora)
  assert.equal((await m.rodar()).existentes.perfis, 18, 'exatamente 30 dias: não renova')
  m.avancar(1)
  assert.equal((await m.rodar()).criados.perfis, 18, 'faltando um segundo a menos: renova')
})

// ------------------------------------------------------------------------------------------------------------------------------
// O executável: ledger em arquivo, só do dono, e o aviso de quando voltar
// ------------------------------------------------------------------------------------------------------------------------------

test('semear-demo.mjs: grava o estado em arquivo 0600, imprime os adiados e a próxima rodada, e a segunda rodada não cria nada', async () => {
  const m = await subirRele()
  const pasta = mkdtempSync(join(tmpdir(), 'rn-sem-'))
  try {
    const arquivoSemente = join(pasta, 'semente')
    writeFileSync(arquivoSemente, m.semente.toString('base64url'), { mode: 0o600 })
    const estado = join(pasta, 'estado.json')
    // o relé de teste anda no tempo de T0 (2030); o executável usa o relógio de verdade, então só provamos a forma, não o amadurecimento
    // assíncrono de propósito: o relé de teste mora NESTE processo, e um spawnSync o deixaria sem responder
    const rodarCli = () => new Promise((ok) => {
      const f = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, '--relay', m.url, '--semente-arquivo', arquivoSemente, '--estado', estado, '--intervalo-ms', '0'])
      let stdout = ''
      let stderr = ''
      f.stdout.on('data', (d) => { stdout += d })
      f.stderr.on('data', (d) => { stderr += d })
      f.on('close', (status) => ok({ status, stdout, stderr }))
    })
    m.relogio.agora = Math.floor(Date.now() / 1000)
    const um = await rodarCli()
    assert.equal(um.status, 0, um.stderr)
    const saida = JSON.parse(um.stdout)
    assert.equal(saida.criados.perfis, 18)
    assert.ok(saida.totalAdiado > 0 && saida.adiados.comunidades === 5)
    assert.ok(saida.proximaRodada && new Date(saida.proximaRodada).getTime() > Date.now() + 80_000_000, 'a próxima rodada é daqui a cerca de um dia')
    assert.match(um.stderr, /Rode de novo a partir de /)
    assert.ok(existsSync(estado))
    assert.equal(statSync(estado).mode & 0o777, 0o600, 'o estado é só do dono')
    const ledger = JSON.parse(readFileSync(estado, 'utf8'))
    assert.equal(ledger.versao, 1)
    assert.equal(Object.keys(ledger.itens.seguir).length, 48)
    assert.ok(!um.stdout.includes(m.semente.toString('base64url')) && !um.stderr.includes(m.semente.toString('base64url')), 'nunca imprime a semente')
    const dois = await rodarCli()
    assert.equal(dois.status, 0, dois.stderr)
    assert.deepEqual(JSON.parse(dois.stdout).criados, {})
    // um arquivo de estado que não é um registro de semeadura nunca é sobrescrito
    writeFileSync(estado, '{"nao":"e um registro"}')
    const ruim = await rodarCli()
    assert.equal(ruim.status, 2)
    assert.match(ruim.stderr, /não vou sobrescrever/)
    assert.equal(readFileSync(estado, 'utf8'), '{"nao":"e um registro"}')
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})

// ------------------------------------------------------------------------------------------------------------------------------
// O executável: uso, recusas, estado e relatório
// ------------------------------------------------------------------------------------------------------------------------------

/** Roda o executável de verdade. Assíncrono de propósito: o relé de teste mora NESTE processo. */
const cli = (args) => new Promise((ok) => {
  const f = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...args])
  let stdout = ''
  let stderr = ''
  f.stdout.on('data', (d) => { stdout += d })
  f.stderr.on('data', (d) => { stderr += d })
  f.on('close', (status) => ok({ status, stdout, stderr }))
})
const comSemente = (m) => {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-cli-'))
  const arquivoSemente = join(pasta, 'semente')
  writeFileSync(arquivoSemente, m.semente.toString('base64url'), { mode: 0o600 })
  return { pasta, arquivoSemente, estado: join(pasta, 'estado.json'), limpar: () => rmSync(pasta, { recursive: true, force: true }) }
}

test('semear-demo.mjs recusa o que está errado antes de tocar em qualquer relé: falta de argumento, endereço, protocolo e semente', async () => {
  const m = await subirRele()
  const s = comSemente(m)
  try {
    const exige = async (args, texto) => {
      const r = await cli(args)
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`)
      assert.match(r.stderr, texto)
      assert.equal(r.stdout, '')
    }
    await exige([], /uso: semear-demo\.mjs/)
    await exige(['--relay', m.url], /uso: semear-demo\.mjs/)
    await exige(['--semente-arquivo', s.arquivoSemente], /uso: semear-demo\.mjs/)
    await exige(['--relay', 'isto nao e url', '--semente-arquivo', s.arquivoSemente], /--relay não é um endereço válido/)
    await exige(['--relay', 'http://relay.exemplo.test', '--semente-arquivo', s.arquivoSemente], /precisa ser https/)
    await exige(['--relay', m.url, '--semente-arquivo', join(s.pasta, 'nao-existe')], /ENOENT/)
    writeFileSync(join(s.pasta, 'ruim'), 'curta')
    await exige(['--relay', m.url, '--semente-arquivo', join(s.pasta, 'ruim'), '--estado', s.estado], /a semente do emissor precisa ter 32 bytes/)
  } finally { s.limpar() }
})

test('semear-demo.mjs: o relé fora do ar interrompe com código 1 e a mensagem; a geração muda os rovers; o padrão é a geração 1', async () => {
  const m = await subirRele()
  m.relogio.agora = Math.floor(Date.now() / 1000)
  const s = comSemente(m)
  try {
    const fora = await cli(['--relay', 'http://127.0.0.1:1', '--semente-arquivo', s.arquivoSemente, '--estado', s.estado, '--intervalo-ms', '0'])
    assert.equal(fora.status, 1)
    assert.match(fora.stderr, /semeadura interrompida: sem resposta do relé/)
    const um = await cli(['--relay', m.url, '--semente-arquivo', s.arquivoSemente, '--estado', s.estado, '--intervalo-ms', '0'])
    assert.equal(um.status, 0, um.stderr)
    const uid1 = (await m.get('/v1/handles/seixo')).json.uid
    assert.equal(uid1, roverDe(m.semente, 'seixo', 1).uid, 'sem --geracao vale a geração 1')
    const dois = await cli(['--relay', m.url, '--semente-arquivo', s.arquivoSemente, '--estado', join(s.pasta, 'g2.json'), '--geracao', '2', '--intervalo-ms', '0'])
    assert.equal(dois.status, 1, 'a geração 2 tem rovers novos com os mesmos handles: o relé recusa o handle em uso')
    assert.match(dois.stderr, /o relé recusou perfil do rover seixo: handle_em_uso/)
  } finally { s.limpar() }
})

test('semear-demo.mjs: um arquivo de estado inválido, de qualquer forma, é recusado e nunca sobrescrito', async () => {
  const m = await subirRele()
  const s = comSemente(m)
  try {
    for (const ruim of ['null', '{"versao":2,"itens":{},"rovers":{}}', '{"versao":1,"itens":"x","rovers":{}}', '{"versao":1,"itens":{},"rovers":null}', 'não é json']) {
      writeFileSync(s.estado, ruim)
      const r = await cli(['--relay', m.url, '--semente-arquivo', s.arquivoSemente, '--estado', s.estado, '--intervalo-ms', '0'])
      assert.equal(r.status, 2, ruim)
      assert.match(r.stderr, /não vou sobrescrever/)
      assert.equal(readFileSync(s.estado, 'utf8'), ruim, ruim)
    }
  } finally { s.limpar() }
})

test('semear-demo.mjs --simular: só conta, não grava estado, não pede nova rodada, e a próxima rodada real vem em ISO, um dia depois', async () => {
  const m = await subirRele()
  m.relogio.agora = Math.floor(Date.now() / 1000)
  const s = comSemente(m)
  try {
    const sim = await cli(['--relay', m.url, '--semente-arquivo', s.arquivoSemente, '--estado', s.estado, '--intervalo-ms', '0', '--simular'])
    assert.equal(sim.status, 0, sim.stderr)
    const saida = JSON.parse(sim.stdout)
    assert.equal(saida.simulado, true)
    assert.equal(saida.estado, null)
    assert.equal(saida.totalAdiado, 0)
    assert.ok(!existsSync(s.estado), 'simular não grava o estado')
    assert.doesNotMatch(sim.stderr, /esperam o tempo/)
    const real = await cli(['--relay', m.url, '--semente-arquivo', s.arquivoSemente, '--estado', s.estado, '--intervalo-ms', '0'])
    const proxima = new Date(JSON.parse(real.stdout).proximaRodada).getTime() / 1000
    const agora = Math.floor(Date.now() / 1000)
    assert.ok(proxima > agora + DIA - 120 && proxima < agora + DIA + 120, `próxima rodada: ${proxima - agora} s`)
  } finally { s.limpar() }
})
