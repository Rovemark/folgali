// TRADUÇÃO EM LOTE do site da Rover Network para os idiomas da Rovemark.
//
// O português é a fonte. O script coleta TODA string traduzível de:
//   · src/i18n/**/*.pt.json e src/i18n/pt.json   (interface, casa, entrar, rodapé, institucional, social)
//   · src/conteudo/*.pt.ts, novidades.ts, entidade.ts  (FAQ, glossário, guias, novidades, entidade)
// traduz cada string ÚNICA uma vez por idioma (assim "Privacidade" é a mesma palavra em todo lugar), guarda
// o resultado num cache por idioma (`.traducoes/<idioma>.json`, retomável) e, na fase "montar", grava:
//   · src/i18n/**/<nome>.<idioma>.json  (mesma forma do português)
//   · src/conteudo/dados/<idioma>.json  ({ faq, verbetes, guias, novidades, entidade })
//
// Cuidados herdados do rovemark-web/scripts/traduz.mjs:
//   · marcador {n}/{name} tem que sobreviver; URL, `código` e <tag> também;
//   · travessão é proibido (REGRA 0.7): o lote que trouxer é recusado e a string volta à fila;
//   · o Router gasta ~60s fixos por chamada e aguenta ~3 ao mesmo tempo; lote por TAMANHO (6 KB), fila de operários.
//
// uso:
//   node scripts/traduzir-site.mjs contar                 conta strings e lotes, sem chamar nada
//   node scripts/traduzir-site.mjs traduzir [idioma ...]  chama o Router (sem idioma = todos, na ordem de prioridade)
//   node scripts/traduzir-site.mjs montar   [idioma ...]  grava os arquivos a partir do cache
//   node scripts/traduzir-site.mjs estado                 quanto falta por idioma
//   node scripts/traduzir-site.mjs semear   [idioma ...]  refaz o cache a partir dos arquivos montados (antes de mudar o pt)
//   montar --so=base,casa,conteudo ...                     só essas famílias de arquivo (outras frentes mexem nas outras)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const I18N = path.join(RAIZ, 'src/i18n')
const CONTEUDO = path.join(RAIZ, 'src/conteudo')
const CACHE = path.join(RAIZ, '.traducoes')
const ROUTER = process.env.LOGICA_ROUTER_URL || 'http://127.0.0.1:8790'
const MODELO = process.env.MODELO || 'claude-sonnet-5-5'
const TETO_LOTE = Number(process.env.TETO_LOTE || 6000)
const PARALELO = Number(process.env.PARALELO || 3)
const PRAZO_MS = Number(process.env.PRAZO_MS || 420000)

const NOMES = {
  es: 'Spanish (neutral Latin American and Iberian)', fr: 'French', de: 'German', it: 'Italian', nl: 'Dutch',
  ru: 'Russian', ar: 'Arabic (Modern Standard)', zh: 'Simplified Chinese', ja: 'Japanese', ko: 'Korean',
}
/** Ordem de prioridade: quem entrega valor primeiro (mercados maiores do Rover Hangar), RTL e CJK depois. */
const ORDEM = ['es', 'fr', 'de', 'it', 'nl', 'ru', 'ar', 'zh', 'ja', 'ko']

/** Nomes que nunca mudam, em nenhum idioma. */
const INTOCAVEIS = ['Rover Network', 'Rover Hangar', 'Rovemark', 'Rover', 'Moltbook', 'Orkut', 'Ed25519', 'AGPL-3.0-or-later',
  'SQLite', 'HTTP', 'JSON', 'RSS', 'API', 'GitHub', 'uid', 'handle', 'SEO', 'AEO', 'GEO', 'LogicaOS', 'Claude', 'ChatGPT']

/**
 * Chaves cujo valor é dado, não texto. É POR NOME DE CHAVE e vale em todo o site, então só entra aqui nome que NUNCA é rótulo:
 * `nome` ou `licenca` já foram rótulo de verdade ("Nome", "Licença AGPL") e ficaram em português por estarem nesta lista.
 */
const CHAVES_DE_DADO = new Set(['id', 'slug', 'url', 'linguagem', 'fonte', '_fonte', 'codigo'])
/** Chaves que, quando o valor é uma LISTA, guardam identificadores (ids de rota, slugs); como texto avulso ("Ver", "Veja também") são rótulo. */
const CHAVES_DE_LISTA_DE_DADO = new Set(['ver', 'relacionados', 'perguntas'])

/** Texto que é identificador, caminho, URL ou número: não se traduz. */
const ehDado = (s) => !/\p{L}/u.test(s) || (/^[\w.\/:@#%+=-]+$/.test(s) && /[\/.:@_0-9=-]/.test(s))

const travessao = /[—–]/
const marcadores = (s) => [...String(s).matchAll(/\{[^{}]*\}|\{\{[^{}]*\}\}|`[^`]*`|<\/?[a-zA-Z][^>]*>|https?:\/\/(?:[\w-]+(?:\.[\w-]+)*(?:\/[^\s)"'.,;]*[^\s)"'.,;])?)?|%[sd]/g)].map((m) => m[0]).sort().join('\u0001')

// ---------------------------------------------------------------- fontes

function arquivosJson(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...arquivosJson(p))
    else if (e.name === 'pt.json' || e.name.endsWith('.pt.json')) out.push(p)
  }
  return out.sort()
}
const alvoJson = (pt, idioma) => pt.endsWith(`${path.sep}pt.json`) ? pt.replace(/pt\.json$/, `${idioma}.json`) : pt.replace(/\.pt\.json$/, `.${idioma}.json`)

async function conteudoPt() {
  const imp = (f) => import(pathToFileURL(path.join(CONTEUDO, f)).href)
  const [faq, verb, guias, nov] = await Promise.all([imp('faq.pt.ts'), imp('verbetes.pt.ts'), imp('guias.pt.ts'), imp('novidades.ts')])
  // `entidade.ts` fica de fora: nada do site a lê em tempo de execução (o llms.txt e o JSON-LD saem de institucional.<idioma>.json).
  return { faq: faq.faqPt, verbetes: verb.verbetesPt, guias: guias.guiasPt, novidades: nov.novidadesPt }
}

// ---------------------------------------------------------------- coletar / aplicar

function coletar(v, chave, saida) {
  if (CHAVES_DE_DADO.has(chave) || (CHAVES_DE_LISTA_DE_DADO.has(chave) && Array.isArray(v))) return
  if (typeof v === 'string') { if (v.trim() && !ehDado(v)) saida.add(v); return }
  if (Array.isArray(v)) { for (const x of v) coletar(x, chave, saida); return }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) coletar(x, k, saida)
}
function aplicar(v, chave, mapa) {
  if (CHAVES_DE_DADO.has(chave) || (CHAVES_DE_LISTA_DE_DADO.has(chave) && Array.isArray(v))) return v
  if (typeof v === 'string') return mapa.has(v) ? mapa.get(v) : v
  if (Array.isArray(v)) return v.map((x) => aplicar(x, chave, mapa))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aplicar(x, k, mapa)]))
  return v
}

async function todasAsFontes() {
  const json = arquivosJson(I18N).map((p) => ({ p, v: JSON.parse(fs.readFileSync(p, 'utf8')) }))
  const cont = await conteudoPt()
  const unicas = new Set()
  for (const { v } of json) coletar(v, '', unicas)
  coletar(cont, '', unicas)
  return { json, cont, unicas }
}

// ---------------------------------------------------------------- cache

const arqCache = (i) => path.join(CACHE, `${i}.json`)
const leCache = (i) => fs.existsSync(arqCache(i)) ? JSON.parse(fs.readFileSync(arqCache(i), 'utf8')) : {}
function gravaCache(i, c) {
  fs.mkdirSync(CACHE, { recursive: true })
  const tmp = `${arqCache(i)}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(c, null, 1))
  fs.renameSync(tmp, arqCache(i))
}

// ---------------------------------------------------------------- Router

async function chamaRouter(prompt, tentativa = 1) {
  const r = await fetch(`${ROUTER}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `logica_desviar: false` impede o Router de mandar "tarefa simples" para modelo gratuito de outra empresa: tradução de site tem de
    // sair do Claude, e o modelo que respondeu é conferido abaixo. Da 2a tentativa em diante o texto muda um pouco: o Router guarda
    // em cache a resposta ruim de um pedido idêntico e devolveria a mesma.
    body: JSON.stringify({ model: MODELO, max_tokens: 32000, logica_desviar: false, messages: [{ role: 'user', content: tentativa > 1 ? `${prompt}\n\n(attempt ${tentativa}: return strictly valid JSON)` : prompt }] }),
    signal: AbortSignal.timeout(PRAZO_MS),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(`router ${r.status} ${j?.error?.type ?? ''}`.trim())
    // CLI de assinatura fora do ar (limite de uso): insistir só queima chamada e enche o cache do Router de resposta ruim
    e.semClaude = j?.error?.type === 'cli_unavailable' || r.status === 502 || r.status === 503
    throw e
  }
  const servido = String(j.model ?? j.logica?.routing?.model ?? '')
  if (!/claude/i.test(servido)) { const e = new Error(`respondeu ${servido || 'modelo desconhecido'}, não o Claude`); e.semClaude = true; throw e }
  const txt = (j.content || []).map((c) => c.text || '').join('')
  const m = txt.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('sem JSON na resposta')
  return JSON.parse(m[0])
}

function prompt(idioma, itens) {
  const extra = {
    de: 'German: capitalize every noun.',
    ar: 'Arabic: write right-to-left text naturally, keep Latin digits (10, 0.3.2) and Latin product names as they are.',
    zh: 'Chinese: use Simplified Chinese, full-width punctuation, no spaces between Chinese characters.',
    ja: 'Japanese: polite です/ます register, natural for a product site.',
    ko: 'Korean: polite 합니다/해요 register consistent with a product site (use 합니다).',
    ru: 'Russian: formal "вы".',
    fr: 'French: use "vous". Use proper typographic apostrophes are NOT required, plain apostrophes are fine.',
  }[idioma] || ''
  return `Translate the VALUES of this JSON object from Brazilian Portuguese to ${NOMES[idioma]}. This is the interface and editorial text of "Rover Network", an open protocol and social network of "rovers" (AI agents that people use in the Rover Hangar app).

HARD RULES:
1. Return ONLY the JSON object with exactly the same keys. Nothing before, nothing after.
2. Keep placeholders such as {n}, {name}, {count} exactly as they are. Keep \`code spans\`, URLs, file paths (docs/PROTOCOLO.md), HTML tags and identifiers (rvr_, ob_, @handle) exactly as they are.
3. NEVER use an em dash or en dash. Use a comma, colon or period instead.
4. Do not translate these names: ${INTOCAVEIS.join(', ')}. The word "rover" (lowercase, plural "rovers") also stays "rover" in every language, inflected only where the grammar needs it.
5. Terms to keep consistent: "relé" = the network relay server (use the natural technical word for "relay" in the target language); "perfil" = profile; "comunidade" = community; "fórum" = forum; "recado" = a short public note on a profile wall; "depoimento" = testimonial; "selo" = badge; "aprovação humana" = human approval; "apelação" = appeal; "moderação" = moderation.
6. Tone: direct, concrete, plain. No marketing words, no hype, no emojis. Short stays short. UPPERCASE stays uppercase.
7. Keep every number, version and date exactly as written (0.3.2, 10 minutos -> 10 minutes). Do not add or remove facts.
${extra ? `8. ${extra}` : ''}

JSON:
${JSON.stringify(itens, null, 1)}`
}

function valida(origem, saida) {
  const bons = {}
  for (const [k, v] of Object.entries(origem)) {
    const t = saida[k]
    if (typeof t !== 'string' || !t.trim()) continue
    if (travessao.test(t)) continue
    if (marcadores(v) !== marcadores(t)) continue
    if (v.length > 40 && t.length < v.length * 0.12) continue   // resposta truncada
    if (t.length > v.length * 5 + 40) continue                  // lixo
    bons[k] = t
  }
  return bons
}

function emLotes(strings) {
  const lotes = []
  let atual = {}, n = 0, tam = 0
  for (const s of strings) {
    const custo = s.length + 12
    if (tam + custo > TETO_LOTE && n) { lotes.push(atual); atual = {}; n = 0; tam = 0 }
    atual[String(n++)] = s; tam += custo
  }
  if (n) lotes.push(atual)
  return lotes
}

// ---------------------------------------------------------------- comandos

async function faltantes(idioma, unicas) {
  const c = leCache(idioma)
  return [...unicas].filter((s) => !(s in c) || travessao.test(c[s]))
}

async function contar() {
  const { unicas } = await todasAsFontes()
  const chars = [...unicas].reduce((a, s) => a + s.length, 0)
  console.log(`${unicas.size} strings únicas, ${chars} caracteres, ${emLotes([...unicas]).length} lotes por idioma`)
}

async function estado() {
  const { unicas } = await todasAsFontes()
  for (const i of ORDEM) {
    const f = await faltantes(i, unicas)
    console.log(`${i}: ${unicas.size - f.length}/${unicas.size}${f.length ? ` (faltam ${f.length})` : ' completo'}`)
  }
}

async function traduzir(idiomas) {
  const { unicas } = await todasAsFontes()
  for (const idioma of idiomas) {
    if (!NOMES[idioma]) { console.log(`${idioma}: idioma desconhecido`); continue }
    for (let rodada = 1; rodada <= 3; rodada++) {
      const falta = await faltantes(idioma, unicas)
      if (!falta.length) break
      const lotes = emLotes(falta)
      console.log(`${idioma} rodada ${rodada}: ${falta.length} strings em ${lotes.length} lotes`)
      const cache = leCache(idioma)
      let prox = 0, feitos = 0, perdidos = 0, semClaude = false
      async function operario() {
        for (;;) {
          const i = prox++
          if (i >= lotes.length || semClaude) return
          let parte = {}
          for (let t = 1; t <= 4; t++) {
            try { parte = valida(lotes[i], await chamaRouter(prompt(idioma, lotes[i]), t)); break }
            catch (e) {
              console.log(`\n  ${idioma} lote ${i + 1} tentativa ${t}: ${String(e.message).slice(0, 90)}`)
              if (e.semClaude) { semClaude = true; return }   // sem Claude: para a fila inteira, nada é gravado por outro modelo
              if (t === 4) { perdidos++; break }
              await new Promise((r) => setTimeout(r, t * 20000))
            }
          }
          for (const [k, t] of Object.entries(parte)) cache[lotes[i][k]] = t
          gravaCache(idioma, cache)   // grava na hora: se cair, o que já foi traduzido está no disco
          feitos++
          process.stdout.write(`  ${idioma} ${feitos}/${lotes.length} lotes${perdidos ? ` · ${perdidos} perdidos` : ''}   \r`)
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALELO, lotes.length) }, operario))
      console.log('')
      if (semClaude) { console.log(`${idioma}: o Router não tem o Claude agora (limite da assinatura?). Parei sem gravar nada de outro modelo; rode de novo depois.`); process.exitCode = 3; return }
    }
    const resto = await faltantes(idioma, unicas)
    console.log(`${idioma}: ${resto.length ? `${resto.length} strings sem tradução válida` : 'completo'}`)
  }
}

/**
 * O nome de família de um arquivo pt, para `--so`: `pt.json` é `base`, `casa.pt.json` é `casa`, `social/home.pt.json` é
 * `social/home`. O conteúdo editorial (`dados/<idioma>.json`) é a família `conteudo`.
 */
const familiaDe = (p) => {
  const rel = path.relative(I18N, p).split(path.sep).join('/')
  return rel === 'pt.json' ? 'base' : rel.replace(/\.pt\.json$/, '')
}
/** `--so=casa,institucional,conteudo`: só essas famílias. Sem a opção, todas. Várias frentes mexem no site ao mesmo tempo, e `montar`
 * sem filtro regrava os arquivos de todas elas. */
const SO = (process.argv.find((a) => a.startsWith('--so=')) ?? '').slice(5).split(',').filter(Boolean)
const escolhida = (familia) => !SO.length || SO.includes(familia)

async function montar(idiomas) {
  const todas = await todasAsFontes()
  const json = todas.json.filter(({ p }) => escolhida(familiaDe(p)))
  const comConteudo = escolhida('conteudo')
  const unicas = new Set()
  for (const { v } of json) coletar(v, '', unicas)
  if (comConteudo) coletar(todas.cont, '', unicas)
  for (const idioma of idiomas) {
    const cache = leCache(idioma)
    const falta = [...unicas].filter((s) => !(s in cache))
    // `--parcial` monta mesmo com string faltando (fica em português) só para ver a página; nunca para publicar
    if (falta.length && !PARCIAL) { console.log(`${idioma}: faltam ${falta.length} strings, não montei`); continue }
    if (falta.length) console.log(`${idioma}: PARCIAL, ${falta.length} strings ficam em português`)
    const mapa = new Map(Object.entries(cache))
    for (const { p, v } of json) fs.writeFileSync(alvoJson(p, idioma), JSON.stringify(aplicar(v, '', mapa), null, 2) + '\n')
    if (comConteudo) {
      fs.mkdirSync(path.join(CONTEUDO, 'dados'), { recursive: true })
      fs.writeFileSync(path.join(CONTEUDO, 'dados', `${idioma}.json`), JSON.stringify(aplicar(todas.cont, '', mapa), null, 2) + '\n')
    }
    console.log(`${idioma}: ${json.length} dicionários${comConteudo ? ` + conteudo/dados/${idioma}.json` : ''}`)
  }
}

/** Anda o português e a tradução montada lado a lado e devolve { frase em pt: tradução }. */
function parear(pt, alvo, chave, saida) {
  if (CHAVES_DE_DADO.has(chave) || (CHAVES_DE_LISTA_DE_DADO.has(chave) && Array.isArray(pt))) return
  if (typeof pt === 'string') { if (typeof alvo === 'string' && alvo.trim() && pt.trim() && !ehDado(pt) && !(pt in saida)) saida[pt] = alvo; return }
  if (Array.isArray(pt)) { if (Array.isArray(alvo)) pt.forEach((x, i) => parear(x, alvo[i], chave, saida)); return }
  if (pt && typeof pt === 'object' && alvo && typeof alvo === 'object') for (const [k, x] of Object.entries(pt)) parear(x, alvo[k], k, saida)
}

/**
 * Refaz o cache a partir dos arquivos já montados (o cache não vai para o git, os arquivos vão). Rode ANTES de mudar o português:
 * cada frase em pt é casada com a tradução que está no mesmo caminho do arquivo do idioma. Depois de mudar o pt, só as frases novas
 * ficam faltando, e `exportar`/`traduzir` pedem só elas. Não sobrescreve o que já está no cache.
 */
async function semear(idiomas) {
  const { json, cont } = await todasAsFontes()
  for (const idioma of idiomas) {
    const cache = leCache(idioma)
    const achado = {}
    for (const { p, v } of json) {
      const a = alvoJson(p, idioma)
      if (fs.existsSync(a)) parear(v, JSON.parse(fs.readFileSync(a, 'utf8')), '', achado)
    }
    const d = path.join(CONTEUDO, 'dados', `${idioma}.json`)
    if (fs.existsSync(d)) parear(cont, JSON.parse(fs.readFileSync(d, 'utf8')), '', achado)
    let n = 0
    for (const [k, t] of Object.entries(achado)) if (!(k in cache) && !travessao.test(t) && marcadores(k) === marcadores(t)) { cache[k] = t; n++ }
    gravaCache(idioma, cache)
    console.log(`${idioma}: ${n} frases semeadas dos arquivos montados`)
  }
}

/**
 * Os poucos textos que componentes de CLIENTE precisam (a tela de erro e o "carregando"). Importar o dicionário inteiro num
 * componente de cliente levaria 12 idiomas × ~280 KB para o navegador; aqui vai só o que eles usam, lido dos dicionários montados.
 */
function cliente() {
  const out = {}
  for (const l of ['pt', 'en', ...ORDEM]) {
    const d = JSON.parse(fs.readFileSync(path.join(I18N, `${l}.json`), 'utf8'))
    out[l] = {
      erro: { titulo: d.erro.titulo, texto: d.erro.texto, tecnico: d.erro.tecnico },
      comum: { tentarDeNovo: d.comum.tentarDeNovo, irParaLinha: d.comum.irParaLinha, carregando: d.comum.carregando },
    }
  }
  fs.writeFileSync(path.join(I18N, 'cliente.json'), JSON.stringify(out, null, 2) + '\n')
  console.log('cliente.json com', Object.keys(out).length, 'idiomas')
}


// ---------------------------------------------------------------- limites de SEO

/** Regras de tamanho que os testes de cobertura exigem em TODO idioma (título de aba, descrição, resposta curta). */
/** Chinês, japonês e coreano dizem em poucos caracteres o que o latino diz em muitos: os mínimos caem (título de 2 caracteres é normal). */
const CJK = (i) => i === 'zh' || i === 'ja' || i === 'ko'
function violacoes(idioma) {
  const cjk = CJK(idioma)
  const lerJson = (n) => JSON.parse(fs.readFileSync(path.join(I18N, n.replace('{l}', idioma)), 'utf8'))
  const ptJson = (n) => JSON.parse(fs.readFileSync(path.join(I18N, n.replace('{l}', 'pt')), 'utf8'))
  const out = []
  const checa = (valor, fonte, limite, rotulo) => {
    if (typeof valor !== 'string') return
    const n = [...valor].length
    if ((limite.max && n > limite.max) || (limite.min && n < limite.min)) out.push({ rotulo, valor, fonte, limite, n })
  }
  const inst = lerJson('institucional.{l}.json'), instPt = ptJson('institucional.{l}.json')
  for (const [id, m] of Object.entries(inst.meta ?? {})) {
    checa(m.titulo, instPt.meta[id].titulo, { max: 60, min: cjk ? 2 : 3 }, `meta.${id}.titulo`)
    checa(m.descricao, instPt.meta[id].descricao, cjk ? { max: 120, min: 20 } : { max: 190, min: 50 }, `meta.${id}.descricao`)
  }
  for (const [id, pg] of Object.entries(inst.paginas ?? {})) checa(pg.respostaCurta, instPt.paginas[id].respostaCurta, { max: 360 }, `paginas.${id}.respostaCurta`)
  const dados = JSON.parse(fs.readFileSync(path.join(CONTEUDO, 'dados', `${idioma}.json`), 'utf8'))
  const ptC = JSON.parse(JSON.stringify(dados)) // só para ter a forma; a fonte pt vem do cache invertido
  const inverso = new Map(Object.entries(leCache(idioma)).map(([k, v]) => [v, k]))
  const fonteDe = (v) => inverso.get(v) ?? ''
  for (const f of dados.faq) checa(f.respostaCurta, fonteDe(f.respostaCurta), { max: cjk ? 260 : 360, min: cjk ? 30 : 41 }, `faq.${f.id}.respostaCurta`)
  for (const g of dados.guias) { checa(g.respostaCurta, fonteDe(g.respostaCurta), { max: cjk ? 260 : 360, min: cjk ? 30 : 41 }, `guia.${g.slug}.respostaCurta`); checa(g.titulo, fonteDe(g.titulo), { max: 110 }, `guia.${g.slug}.titulo`) }
  for (const v of dados.verbetes) checa(v.definicaoCurta, fonteDe(v.definicaoCurta), { max: 220 }, `verbete.${v.slug}.definicaoCurta`)
  void ptC
  return out
}

async function limites(idiomas) {
  for (const i of idiomas) {
    const v = violacoes(i)
    console.log(`${i}: ${v.length} fora do limite`)
    for (const x of v) console.log(`  ${x.rotulo} (${x.n}, limite ${JSON.stringify(x.limite)}): ${x.valor.slice(0, 70)}`)
  }
}

/** Pede de novo, com teto de tamanho, as traduções que estouraram um limite; troca no cache e remonta. */
async function encurtar(idiomas) {
  for (const idioma of idiomas) {
    const v = violacoes(idioma).filter((x) => x.fonte)
    if (!v.length) { console.log(`${idioma}: nada a encurtar`); continue }
    const cache = leCache(idioma)
    for (const x of v) {
      const alvo = x.limite.max ? `at most ${Math.floor(x.limite.max * 0.9)} characters` : `at least ${x.limite.min + 10} characters`
      const itens = { 0: x.fonte }
      for (let t = 1; t <= 3; t++) {
        try {
          const r = await chamaRouter(prompt(idioma, itens).replace('HARD RULES:', `HARD RULES:\n0. The translation MUST have ${alvo} (it is a page title, meta description or short answer with a strict size limit). Rewrite tighter if needed; never cut mid-sentence.`), t)
          const bom = valida(itens, r)
          if (bom[0] && (x.limite.max ? [...bom[0]].length <= x.limite.max : [...bom[0]].length >= x.limite.min)) { cache[x.fonte] = bom[0]; console.log(`  ${idioma} ${x.rotulo}: ${x.n} -> ${[...bom[0]].length}`); break }
        } catch (e) { if (e.semClaude) { console.log('sem Claude, parei'); return } }
      }
    }
    gravaCache(idioma, cache)
  }
}


// ---------------------------------------------------------------- tradução por agentes (sem Router)

const AGENTES = path.join(CACHE, 'agentes')

/** Grava o que falta de cada idioma em arquivos de entrada, repartidos em N pedaços, para agentes traduzirem sem o Router. */
/** As frases únicas só das famílias escolhidas com `--so` (todas, sem a opção). */
async function unicasEscolhidas() {
  const todas = await todasAsFontes()
  if (!SO.length) return todas.unicas
  const unicas = new Set()
  for (const { p, v } of todas.json) if (escolhida(familiaDe(p))) coletar(v, '', unicas)
  if (escolhida('conteudo')) coletar(todas.cont, '', unicas)
  return unicas
}

async function exportar(idiomas, porIdioma) {
  const unicas = await unicasEscolhidas()
  fs.mkdirSync(AGENTES, { recursive: true })
  for (const idioma of idiomas) {
    const falta = await faltantes(idioma, unicas)
    if (!falta.length) { console.log(`${idioma}: nada a exportar`); continue }
    // repartição por TAMANHO (não por contagem): o fim da lista tem os parágrafos longos dos guias
    const total = falta.reduce((a, t) => a + t.length + 12, 0)
    const alvo = total / Math.max(1, porIdioma)
    const fatias = []
    let atual = [], acc = 0
    for (const t of falta) { atual.push(t); acc += t.length + 12; if (acc >= alvo && fatias.length < porIdioma - 1) { fatias.push(atual); atual = []; acc = 0 } }
    if (atual.length) fatias.push(atual)
    fatias.forEach((fatia, k) => fs.writeFileSync(path.join(AGENTES, `${idioma}-${k + 1}.in.json`), JSON.stringify(Object.fromEntries(fatia.map((t, i) => [String(i), t])), null, 1)))
    const n = fatias.length
    console.log(`${idioma}: ${falta.length} strings em ${n} arquivos`)
  }
}

/** Lê `<idioma>-<k>.out.json`, valida cada string como no Router e põe no cache. Devolve quantas entraram. */
async function importar(idiomas) {
  for (const idioma of idiomas) {
    const cache = leCache(idioma)
    let ok = 0, ruins = 0
    for (const f of fs.readdirSync(AGENTES).filter((x) => x.startsWith(`${idioma}-`) && x.endsWith('.out.json')).sort()) {
      const entrada = JSON.parse(fs.readFileSync(path.join(AGENTES, f.replace('.out.json', '.in.json')), 'utf8'))
      let saida
      try { saida = JSON.parse(fs.readFileSync(path.join(AGENTES, f), 'utf8')) } catch { console.log(`  ${f}: JSON inválido`); continue }
      const bons = valida(entrada, saida)
      for (const [k, t] of Object.entries(bons)) { cache[entrada[k]] = t; ok++ }
      ruins += Object.keys(entrada).length - Object.keys(bons).length
    }
    gravaCache(idioma, cache)
    console.log(`${idioma}: ${ok} entraram, ${ruins} recusadas pela validação`)
  }
}


/** Confere um arquivo de saída de agente contra a entrada, sem gravar nada: o agente roda isto antes de terminar. */
function validar(arquivos) {
  for (const f of arquivos) {
    const entrada = JSON.parse(fs.readFileSync(f.replace('.out.json', '.in.json'), 'utf8'))
    let saida
    try { saida = JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { console.log(`${path.basename(f)}: JSON INVÁLIDO (${e.message})`); process.exitCode = 1; continue }
    const bons = valida(entrada, saida)
    const ruins = Object.keys(entrada).filter((k) => !(k in bons))
    console.log(`${path.basename(f)}: ${Object.keys(bons).length}/${Object.keys(entrada).length} válidas`)
    for (const k of ruins.slice(0, 15)) {
      const t = saida[k]
      const motivo = typeof t !== 'string' || !t.trim() ? 'faltando' : travessao.test(t) ? 'TEM TRAVESSÃO (— ou –): troque por vírgula, dois-pontos ou ponto' : marcadores(entrada[k]) !== marcadores(t) ? `marcadores diferentes: esperado [${marcadores(entrada[k]).split('\u0001').join(' ')}] veio [${marcadores(t).split('\u0001').join(' ')}]` : 'tamanho absurdo (truncada ou lixo)'
      console.log(`   chave ${k}: ${motivo} | ${String(entrada[k]).slice(0, 60)}`)
    }
    if (ruins.length) process.exitCode = 1
  }
}


// ---------------------------------------------------------------- retoques (vazamento de português e limites)

/** Termos em português que NÃO podem sobrar numa tradução (nome de tipo do protocolo escrito solto no meio da frase). */
const VAZAMENTO = /(moderação|apelação|aprovação|\brecados?\b|\bdepoimentos?\b|\brelé\b|\bnão\b|\bvocê\b|\bcomunidades?\b|\bentregas?\b)/i
const ROTA_DE_API = /^(GET|POST|PUT|DELETE|PATCH)\b/
const vazou = (idioma, t) => {
  if (ROTA_DE_API.test(t)) return false
  if (idioma === "es" || idioma === "fr" || idioma === "it") return /(moderação|apelação|aprovação|\bdepoimentos?\b|\bnão\b|\bvocê\b)/i.test(t)
  const limpo = t.replace(/\{[^}]*\}|\/v1\/[\w/:.-]*|docs\/\S+|security@\S+|`[^`]*`|\((recado|depoimento|recados|depoimentos|apelação|relé)\)/g, '')
  return !ROTA_DE_API.test(t) && VAZAMENTO.test(limpo)
}

async function retoqueExportar(idiomas) {
  const itens = []
  for (const idioma of idiomas) {
    const cache = leCache(idioma)
    const vistos = new Set()
    for (const x of violacoes(idioma).filter((v) => v.fonte)) {
      vistos.add(x.fonte)
      itens.push({ id: `${idioma}:${itens.length}`, idioma, pt: x.fonte, atual: x.valor, problema: x.limite.max && x.n > x.limite.max ? `too long: ${x.n} characters, limit ${x.limite.max}` : `too short: ${x.n} characters, minimum ${x.limite.min}`, max: x.limite.max ?? null, min: x.limite.min ?? null })
    }
    for (const [pt, tr] of Object.entries(cache)) if (!vistos.has(pt) && vazou(idioma, tr)) itens.push({ id: `${idioma}:${itens.length}`, idioma, pt, atual: tr, problema: 'contains untranslated Portuguese protocol terms (recado, depoimento, moderação, apelação, relé, comunidade, aprovação...): translate them with the language glossary', max: null, min: null })
  }
  fs.mkdirSync(AGENTES, { recursive: true })
  const porIdioma = {}
  for (const it of itens) (porIdioma[it.idioma] ??= []).push(it)
  for (const [i, xs] of Object.entries(porIdioma)) fs.writeFileSync(path.join(AGENTES, `retoque-${i}.in.json`), JSON.stringify(xs, null, 1))
  console.log(Object.entries(porIdioma).map(([i, xs]) => `${i}:${xs.length}`).join(' '), `total ${itens.length}`)
}

async function retoqueImportar(idiomas) {
  for (const idioma of idiomas) {
    const fin = path.join(AGENTES, `retoque-${idioma}.in.json`), fout = path.join(AGENTES, `retoque-${idioma}.out.json`)
    if (!fs.existsSync(fin) || !fs.existsSync(fout)) continue
    const entrada = JSON.parse(fs.readFileSync(fin, 'utf8')), saida = JSON.parse(fs.readFileSync(fout, 'utf8'))
    const cache = leCache(idioma)
    let ok = 0, ruim = 0
    for (const it of entrada) {
      const t = saida[it.id]
      const n = typeof t === 'string' ? [...t].length : 0
      const bom = typeof t === 'string' && t.trim() && !travessao.test(t) && marcadores(it.pt) === marcadores(t) && !vazou(idioma, t) && (it.max == null || n <= it.max) && (it.min == null || n >= it.min)
      if (bom) { cache[it.pt] = t; ok++ } else { ruim++; console.log(`  recusada ${it.id}: ${String(t).slice(0, 70)}`) }
    }
    gravaCache(idioma, cache)
    console.log(`${idioma}: ${ok} retoques aplicados, ${ruim} recusados`)
  }
}

const PARCIAL = process.argv.includes('--parcial')
const [cmd, ...resto0] = process.argv.slice(2)
const resto = resto0.filter((x) => x !== '--parcial' && !x.startsWith('--so='))
const alvos = resto.length ? resto : ORDEM
if (cmd === 'contar') await contar()
else if (cmd === 'estado') await estado()
else if (cmd === 'traduzir') await traduzir(alvos)
else if (cmd === 'montar') { await montar(alvos); cliente() }
else if (cmd === 'cliente') cliente()
else if (cmd === 'semear') await semear(alvos)
else if (cmd === 'limites') await limites(alvos)
else if (cmd === 'exportar') await exportar(alvos.slice(1), Number(alvos[0]))
else if (cmd === 'importar') await importar(alvos)
else if (cmd === 'validar') validar(resto)
else if (cmd === 'retoque-exportar') await retoqueExportar(alvos)
else if (cmd === 'retoque-importar') await retoqueImportar(alvos)
else if (cmd === 'encurtar') await encurtar(alvos)
else if (cmd === 'faltam') { const unicas = await unicasEscolhidas(); for (const i of alvos.slice(0, 1)) for (const t of await faltantes(i, unicas)) console.log(JSON.stringify(t)) }
else console.log('uso: node scripts/traduzir-site.mjs contar | estado | traduzir [idioma ...] | montar [idioma ...]')
