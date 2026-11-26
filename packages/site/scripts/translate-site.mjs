// BATCH TRANSLATION of the Rover Network site into the Rovemark languages.
//
// Portuguese is the source. The script collects EVERY translatable string from:
//   · src/i18n/**/*.pt.json and src/i18n/pt.json   (interface, house, join, footer, institutional, social)
//   · src/content/*.pt.ts, news.ts, entity.ts  (FAQ, glossary, guides, news, entity)
// translates each UNIQUE string once per language (so "Privacidade" is the same word everywhere), keeps
// the result in a cache per language (`.traducoes/<language>.json`, resumable) and, in the "montar" (assemble) phase, writes:
//   · src/i18n/**/<name>.<language>.json  (same shape as the Portuguese)
//   · src/content/data/<language>.json  ({ faq, verbetes, guias, novidades, entidade })
//
// Care points inherited from rovemark-web/scripts/traduz.mjs:
//   · the {n}/{name} placeholders must survive; so must URLs, `code` and <tag>;
//   · the em dash is forbidden (RULE 0.7): a batch that brings one is refused and the string goes back to the queue;
//   · the Router spends ~60s fixed per call and handles ~3 at the same time; batch by SIZE (6 KB), queue of workers.
//
// usage:
//   node scripts/translate-site.mjs contar                 counts strings and batches, calls nothing
//   node scripts/translate-site.mjs traduzir [language ...]  calls the Router (no language = all, in priority order)
//   node scripts/translate-site.mjs montar   [language ...]  writes the files from the cache
//   node scripts/translate-site.mjs estado                 how much is missing per language
//   node scripts/translate-site.mjs semear   [language ...]  rebuilds the cache from the assembled files (before changing pt)
//   montar --so=base,casa,conteudo ...                     only these file families (other fronts touch the others)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const I18N = path.join(ROOT, 'src/i18n')
const CONTENT = path.join(ROOT, 'src/content')
const CACHE = path.join(ROOT, '.traducoes')
const ROUTER = process.env.LOGICA_ROUTER_URL || 'http://127.0.0.1:8790'
const MODEL = process.env.MODEL || process.env.MODELO || 'claude-sonnet-5-5'
const BATCH_CAP = Number(process.env.BATCH_CAP || process.env.TETO_LOTE || 6000)
const PARALLEL = Number(process.env.PARALLEL || process.env.PARALELO || 3)
const DEADLINE_MS = Number(process.env.DEADLINE_MS || process.env.PRAZO_MS || 420000)

const NAMES = {
  es: 'Spanish (neutral Latin American and Iberian)', fr: 'French', de: 'German', it: 'Italian', nl: 'Dutch',
  ru: 'Russian', ar: 'Arabic (Modern Standard)', zh: 'Simplified Chinese', ja: 'Japanese', ko: 'Korean',
}
/** Priority order: whoever delivers value first (the larger Rover Hangar markets), RTL and CJK later. */
const ORDER = ['es', 'fr', 'de', 'it', 'nl', 'ru', 'ar', 'zh', 'ja', 'ko']

/** Names that never change, in any language. */
const UNTOUCHABLE = ['Rover Network', 'Rover Hangar', 'Rovemark', 'Rover', 'Moltbook', 'Orkut', 'Ed25519', 'AGPL-3.0-or-later',
  'SQLite', 'HTTP', 'JSON', 'RSS', 'API', 'GitHub', 'uid', 'handle', 'SEO', 'AEO', 'GEO', 'LogicaOS', 'Claude', 'ChatGPT']

/**
 * Keys whose value is data, not text. It is BY KEY NAME and applies across the whole site, so only a name that is NEVER a label goes here:
 * `nome` or `licenca` were once a real label ("Nome", "Licença AGPL") and stayed in Portuguese because they were on this list. 
 */
const DATA_KEYS = new Set(['id', 'slug', 'url', 'linguagem', 'fonte', '_fonte', 'codigo'])
/** Keys that, when the value is a LIST, hold identifiers (route ids, slugs); as a standalone text ("Ver", "Veja também") they are a label. */
const DATA_LIST_KEYS = new Set(['ver', 'relacionados', 'perguntas'])

/** Text that is an identifier, path, URL or number: it is not translated. */
const isData = (s) => !/\p{L}/u.test(s) || (/^[\w.\/:@#%+=-]+$/.test(s) && /[\/.:@_0-9=-]/.test(s))

const emDash = /[—–]/
const markers = (s) => [...String(s).matchAll(/\{[^{}]*\}|\{\{[^{}]*\}\}|`[^`]*`|<\/?[a-zA-Z][^>]*>|https?:\/\/(?:[\w-]+(?:\.[\w-]+)*(?:\/[^\s)"'.,;]*[^\s)"'.,;])?)?|%[sd]/g)].map((m) => m[0]).sort().join('\u0001')

// ---------------------------------------------------------------- sources

function jsonFiles(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...jsonFiles(p))
    else if (e.name === 'pt.json' || e.name.endsWith('.pt.json')) out.push(p)
  }
  return out.sort()
}
const targetJson = (pt, language) => pt.endsWith(`${path.sep}pt.json`) ? pt.replace(/pt\.json$/, `${language}.json`) : pt.replace(/\.pt\.json$/, `.${language}.json`)

async function contentPt() {
  const imp = (f) => import(pathToFileURL(path.join(CONTENT, f)).href)
  const [faq, verb, guides, nov] = await Promise.all([imp('faq.pt.ts'), imp('glossary.pt.ts'), imp('guides.pt.ts'), imp('news.ts')])
  // `entity.ts` is left out: nothing in the site reads it at run time (llms.txt and the JSON-LD come from institutional.<language>.json).
  return { faq: faq.faqPt, verbetes: verb.glossaryEntriesPt, guias: guides.guidesPt, novidades: nov.newsPt }
}

// ---------------------------------------------------------------- collect / apply

function collect(v, key, output) {
  if (DATA_KEYS.has(key) || (DATA_LIST_KEYS.has(key) && Array.isArray(v))) return
  if (typeof v === 'string') { if (v.trim() && !isData(v)) output.add(v); return }
  if (Array.isArray(v)) { for (const x of v) collect(x, key, output); return }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collect(x, k, output)
}
function apply(v, key, map) {
  if (DATA_KEYS.has(key) || (DATA_LIST_KEYS.has(key) && Array.isArray(v))) return v
  if (typeof v === 'string') return map.has(v) ? map.get(v) : v
  if (Array.isArray(v)) return v.map((x) => apply(x, key, map))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, apply(x, k, map)]))
  return v
}

async function allSources() {
  const json = jsonFiles(I18N).map((p) => ({ p, v: JSON.parse(fs.readFileSync(p, 'utf8')) }))
  const cont = await contentPt()
  const unique = new Set()
  for (const { v } of json) collect(v, '', unique)
  collect(cont, '', unique)
  return { json, cont, unique }
}

// ---------------------------------------------------------------- cache

const cacheFile = (i) => path.join(CACHE, `${i}.json`)
const readCache = (i) => fs.existsSync(cacheFile(i)) ? JSON.parse(fs.readFileSync(cacheFile(i), 'utf8')) : {}
function writeCache(i, c) {
  fs.mkdirSync(CACHE, { recursive: true })
  const tmp = `${cacheFile(i)}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(c, null, 1))
  fs.renameSync(tmp, cacheFile(i))
}

// ---------------------------------------------------------------- Router

async function callRouter(prompt, attempt = 1) {
  const r = await fetch(`${ROUTER}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `logica_desviar: false` stops the Router from sending a "simple task" to a free model of another company: site translation has to
    // come out of Claude, and the model that answered is checked below. From the 2nd attempt on the text changes a little: the Router keeps
    // the bad answer of an identical request in cache and would return the same one.
    body: JSON.stringify({ model: MODEL, max_tokens: 32000, logica_desviar: false, messages: [{ role: 'user', content: attempt > 1 ? `${prompt}\n\n(attempt ${attempt}: return strictly valid JSON)` : prompt }] }),
    signal: AbortSignal.timeout(DEADLINE_MS),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(`router ${r.status} ${j?.error?.type ?? ''}`.trim())
    // subscription CLI down (usage limit): insisting only burns calls and fills the Router cache with bad answers
    e.withoutClaude = j?.error?.type === 'cli_unavailable' || r.status === 502 || r.status === 503
    throw e
  }
  const served = String(j.model ?? j.logica?.routing?.model ?? '')
  if (!/claude/i.test(served)) { const e = new Error(`respondeu ${served || 'modelo desconhecido'}, não o Claude`); e.withoutClaude = true; throw e }
  const txt = (j.content || []).map((c) => c.text || '').join('')
  const m = txt.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('sem JSON na resposta')
  return JSON.parse(m[0])
}

function prompt(language, items) {
  const extra = {
    de: 'German: capitalize every noun.',
    ar: 'Arabic: write right-to-left text naturally, keep Latin digits (10, 0.3.2) and Latin product names as they are.',
    zh: 'Chinese: use Simplified Chinese, full-width punctuation, no spaces between Chinese characters.',
    ja: 'Japanese: polite です/ます register, natural for a product site.',
    ko: 'Korean: polite 합니다/해요 register consistent with a product site (use 합니다).',
    ru: 'Russian: formal "вы".',
    fr: 'French: use "vous". Use proper typographic apostrophes are NOT required, plain apostrophes are fine.',
  }[language] || ''
  return `Translate the VALUES of this JSON object from Brazilian Portuguese to ${NAMES[language]}. This is the interface and editorial text of "Rover Network", an open protocol and social network of "rovers" (AI agents that people use in the Rover Hangar app).

HARD RULES:
1. Return ONLY the JSON object with exactly the same keys. Nothing before, nothing after.
2. Keep placeholders such as {n}, {name}, {count} exactly as they are. Keep \`code spans\`, URLs, file paths (docs/PROTOCOL.md), HTML tags and identifiers (rvr_, ob_, @handle) exactly as they are.
3. NEVER use an em dash or en dash. Use a comma, colon or period instead.
4. Do not translate these names: ${UNTOUCHABLE.join(', ')}. The word "rover" (lowercase, plural "rovers") also stays "rover" in every language, inflected only where the grammar needs it.
5. Terms to keep consistent: "relé" = the network relay server (use the natural technical word for "relay" in the target language); "perfil" = profile; "comunidade" = community; "fórum" = forum; "recado" = a short public note on a profile wall; "depoimento" = testimonial; "selo" = badge; "aprovação humana" = human approval; "apelação" = appeal; "moderação" = moderation.
6. Tone: direct, concrete, plain. No marketing words, no hype, no emojis. Short stays short. UPPERCASE stays uppercase.
7. Keep every number, version and date exactly as written (0.3.2, 10 minutos -> 10 minutes). Do not add or remove facts.
${extra ? `8. ${extra}` : ''}

JSON:
${JSON.stringify(items, null, 1)}`
}

function valid(origin, output) {
  const good = {}
  for (const [k, v] of Object.entries(origin)) {
    const t = output[k]
    if (typeof t !== 'string' || !t.trim()) continue
    if (emDash.test(t)) continue
    if (markers(v) !== markers(t)) continue
    if (v.length > 40 && t.length < v.length * 0.12) continue   // truncated answer
    if (t.length > v.length * 5 + 40) continue                  // junk
    good[k] = t
  }
  return good
}

function inBatches(strings) {
  const batches = []
  let current = {}, n = 0, length = 0
  for (const s of strings) {
    const cost = s.length + 12
    if (length + cost > BATCH_CAP && n) { batches.push(current); current = {}; n = 0; length = 0 }
    current[String(n++)] = s; length += cost
  }
  if (n) batches.push(current)
  return batches
}

// ---------------------------------------------------------------- commands

async function findMissing(language, unique) {
  const c = readCache(language)
  return [...unique].filter((s) => !(s in c) || emDash.test(c[s]))
}

async function count() {
  const { unique } = await allSources()
  const chars = [...unique].reduce((a, s) => a + s.length, 0)
  console.log(`${unique.size} strings únicas, ${chars} caracteres, ${inBatches([...unique]).length} lotes por idioma`)
}

async function state() {
  const { unique } = await allSources()
  for (const i of ORDER) {
    const f = await findMissing(i, unique)
    console.log(`${i}: ${unique.size - f.length}/${unique.size}${f.length ? ` (faltam ${f.length})` : ' completo'}`)
  }
}

async function translate(languageSet) {
  const { unique } = await allSources()
  for (const language of languageSet) {
    if (!NAMES[language]) { console.log(`${language}: idioma desconhecido`); continue }
    for (let round = 1; round <= 3; round++) {
      const missing = await findMissing(language, unique)
      if (!missing.length) break
      const batches = inBatches(missing)
      console.log(`${language} rodada ${round}: ${missing.length} strings em ${batches.length} lotes`)
      const cache = readCache(language)
      let next = 0, done = 0, lost = 0, withoutClaude = false
      async function worker() {
        for (;;) {
          const i = next++
          if (i >= batches.length || withoutClaude) return
          let part = {}
          for (let t = 1; t <= 4; t++) {
            try { part = valid(batches[i], await callRouter(prompt(language, batches[i]), t)); break }
            catch (e) {
              console.log(`\n  ${language} lote ${i + 1} tentativa ${t}: ${String(e.message).slice(0, 90)}`)
              if (e.withoutClaude) { withoutClaude = true; return }   // without Claude: stops the whole queue, nothing is written by another model
              if (t === 4) { lost++; break }
              await new Promise((r) => setTimeout(r, t * 20000))
            }
          }
          for (const [k, t] of Object.entries(part)) cache[batches[i][k]] = t
          writeCache(language, cache)   // writes at once: if it crashes, what was already translated is on disk
          done++
          process.stdout.write(`  ${language} ${done}/${batches.length} lotes${lost ? ` · ${lost} perdidos` : ''}   \r`)
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker))
      console.log('')
      if (withoutClaude) { console.log(`${language}: o Router não tem o Claude agora (limite da assinatura?). Parei sem gravar nada de outro modelo; rode de novo depois.`); process.exitCode = 3; return }
    }
    const rest = await findMissing(language, unique)
    console.log(`${language}: ${rest.length ? `${rest.length} strings sem tradução válida` : 'completo'}`)
  }
}

/**
 * The family name of a pt file, for `--so`: `pt.json` is `base`, `house.pt.json` is `casa`, `social/home.pt.json` is
 * `social/home`. The editorial content (`dados/<language>.json`) is the `conteudo` family.
 */
const familyOf = (p) => {
  const rel = path.relative(I18N, p).split(path.sep).join('/')
  return rel === 'pt.json' ? 'base' : rel.replace(/\.pt\.json$/, '')
}
/** `--so=casa,institucional,conteudo`: only these families. Without the option, all. Several fronts touch the site at the same time, and `montar`
 * without a filter rewrites the files of all of them.  */
const ONLY = (process.argv.find((a) => a.startsWith('--so=')) ?? '').slice(5).split(',').filter(Boolean)
const chosen = (family) => !ONLY.length || ONLY.includes(family)

async function build(languageSet) {
  const all = await allSources()
  const json = all.json.filter(({ p }) => chosen(familyOf(p)))
  const withContent = chosen('conteudo')
  const unique = new Set()
  for (const { v } of json) collect(v, '', unique)
  if (withContent) collect(all.cont, '', unique)
  for (const language of languageSet) {
    const cache = readCache(language)
    const missing = [...unique].filter((s) => !(s in cache))
    // `--parcial` assembles even with a missing string (it stays in Portuguese) only to see the page; never to publish
    if (missing.length && !PARTIAL) { console.log(`${language}: faltam ${missing.length} strings, não montei`); continue }
    if (missing.length) console.log(`${language}: PARCIAL, ${missing.length} strings ficam em português`)
    const map = new Map(Object.entries(cache))
    for (const { p, v } of json) fs.writeFileSync(targetJson(p, language), JSON.stringify(apply(v, '', map), null, 2) + '\n')
    if (withContent) {
      fs.mkdirSync(path.join(CONTENT, 'dados'), { recursive: true })
      fs.writeFileSync(path.join(CONTENT, 'dados', `${language}.json`), JSON.stringify(apply(all.cont, '', map), null, 2) + '\n')
    }
    console.log(`${language}: ${json.length} dicionários${withContent ? ` + content/data/${language}.json` : ''}`)
  }
}

/** Walks the Portuguese and the assembled translation side by side and returns { pt sentence: translation }. */
function pair(pt, target, key, output) {
  if (DATA_KEYS.has(key) || (DATA_LIST_KEYS.has(key) && Array.isArray(pt))) return
  if (typeof pt === 'string') { if (typeof target === 'string' && target.trim() && pt.trim() && !isData(pt) && !(pt in output)) output[pt] = target; return }
  if (Array.isArray(pt)) { if (Array.isArray(target)) pt.forEach((x, i) => pair(x, target[i], key, output)); return }
  if (pt && typeof pt === 'object' && target && typeof target === 'object') for (const [k, x] of Object.entries(pt)) pair(x, target[k], k, output)
}

/**
 * Rebuilds the cache from the files already assembled (the cache does not go to git, the files do). Run BEFORE changing the Portuguese:
 * each pt sentence is matched with the translation at the same path in the language file. After changing the pt, only the new sentences
 * are left missing, and `exportar`/`traduzir` ask for only those. It does not overwrite what is already in the cache.
 */
async function seedNetwork(languageSet) {
  const { json, cont } = await allSources()
  for (const language of languageSet) {
    const cache = readCache(language)
    const found = {}
    for (const { p, v } of json) {
      const a = targetJson(p, language)
      if (fs.existsSync(a)) pair(v, JSON.parse(fs.readFileSync(a, 'utf8')), '', found)
    }
    const d = path.join(CONTENT, 'dados', `${language}.json`)
    if (fs.existsSync(d)) pair(cont, JSON.parse(fs.readFileSync(d, 'utf8')), '', found)
    let n = 0
    for (const [k, t] of Object.entries(found)) if (!(k in cache) && !emDash.test(t) && markers(k) === markers(t)) { cache[k] = t; n++ }
    writeCache(language, cache)
    console.log(`${language}: ${n} frases semeadas dos arquivos montados`)
  }
}

/**
 * The few texts that CLIENT components need (the error screen and "loading"). Importing the whole dictionary into a
 * client component would send 12 languages × ~280 KB to the browser; here goes only what they use, read from the assembled dictionaries.
 */
function client() {
  const out = {}
  for (const l of ['pt', 'en', ...ORDER]) {
    const d = JSON.parse(fs.readFileSync(path.join(I18N, `${l}.json`), 'utf8'))
    out[l] = {
      erro: { titulo: d.erro.titulo, texto: d.erro.texto, tecnico: d.erro.tecnico },
      comum: { tentarDeNovo: d.comum.tentarDeNovo, irParaLinha: d.comum.irParaLinha, carregando: d.comum.carregando },
    }
  }
  fs.writeFileSync(path.join(I18N, 'client.json'), JSON.stringify(out, null, 2) + '\n')
  console.log('client.json com', Object.keys(out).length, 'idiomas')
}


// ---------------------------------------------------------------- SEO limits

/** Size rules that the coverage tests require in EVERY language (tab title, description, short answer). */
/** Chinese, Japanese and Korean say in few characters what Latin says in many: the minimums drop (a title of 2 characters is normal). */
const CJK = (i) => i === 'zh' || i === 'ja' || i === 'ko'
function violations(language) {
  const cjk = CJK(language)
  const readJson = (n) => JSON.parse(fs.readFileSync(path.join(I18N, n.replace('{l}', language)), 'utf8'))
  const ptJson = (n) => JSON.parse(fs.readFileSync(path.join(I18N, n.replace('{l}', 'pt')), 'utf8'))
  const out = []
  const check = (value, source, limit, label) => {
    if (typeof value !== 'string') return
    const n = [...value].length
    if ((limit.max && n > limit.max) || (limit.min && n < limit.min)) out.push({ rotulo: label, valor: value, fonte: source, limite: limit, n })
  }
  const inst = readJson('institucional.{l}.json'), instPt = ptJson('institucional.{l}.json')
  for (const [id, m] of Object.entries(inst.meta ?? {})) {
    check(m.titulo, instPt.meta[id].titulo, { max: 60, min: cjk ? 2 : 3 }, `meta.${id}.titulo`)
    check(m.descricao, instPt.meta[id].descricao, cjk ? { max: 120, min: 20 } : { max: 190, min: 50 }, `meta.${id}.descricao`)
  }
  for (const [id, pg] of Object.entries(inst.paginas ?? {})) check(pg.respostaCurta, instPt.paginas[id].respostaCurta, { max: 360 }, `pages.${id}.respostaCurta`)
  const data = JSON.parse(fs.readFileSync(path.join(CONTENT, 'dados', `${language}.json`), 'utf8'))
  const ptC = JSON.parse(JSON.stringify(data)) // only to have the shape; the pt source comes from the inverted cache
  const inverse = new Map(Object.entries(readCache(language)).map(([k, v]) => [v, k]))
  const sourceOf = (v) => inverse.get(v) ?? ''
  for (const f of data.faq) check(f.respostaCurta, sourceOf(f.respostaCurta), { max: cjk ? 260 : 360, min: cjk ? 30 : 41 }, `faq.${f.id}.respostaCurta`)
  for (const g of data.guias) { check(g.respostaCurta, sourceOf(g.respostaCurta), { max: cjk ? 260 : 360, min: cjk ? 30 : 41 }, `guia.${g.slug}.respostaCurta`); check(g.titulo, sourceOf(g.titulo), { max: 110 }, `guia.${g.slug}.titulo`) }
  for (const v of data.verbetes) check(v.definicaoCurta, sourceOf(v.definicaoCurta), { max: 220 }, `verbete.${v.slug}.definicaoCurta`)
  void ptC
  return out
}

async function limits(languageSet) {
  for (const i of languageSet) {
    const v = violations(i)
    console.log(`${i}: ${v.length} fora do limite`)
    for (const x of v) console.log(`  ${x.rotulo} (${x.n}, limite ${JSON.stringify(x.limite)}): ${x.valor.slice(0, 70)}`)
  }
}

/** Asks again, with a size cap, for the translations that went over a limit; swaps them in the cache and reassembles. */
async function shorten(languageSet) {
  for (const language of languageSet) {
    const v = violations(language).filter((x) => x.fonte)
    if (!v.length) { console.log(`${language}: nada a encurtar`); continue }
    const cache = readCache(language)
    for (const x of v) {
      const target = x.limite.max ? `at most ${Math.floor(x.limite.max * 0.9)} characters` : `at least ${x.limite.min + 10} characters`
      const items = { 0: x.fonte }
      for (let t = 1; t <= 3; t++) {
        try {
          const r = await callRouter(prompt(language, items).replace('HARD RULES:', `HARD RULES:\n0. The translation MUST have ${target} (it is a page title, meta description or short answer with a strict size limit). Rewrite tighter if needed; never cut mid-sentence.`), t)
          const good = valid(items, r)
          if (good[0] && (x.limite.max ? [...good[0]].length <= x.limite.max : [...good[0]].length >= x.limite.min)) { cache[x.fonte] = good[0]; console.log(`  ${language} ${x.rotulo}: ${x.n} -> ${[...good[0]].length}`); break }
        } catch (e) { if (e.withoutClaude) { console.log('sem Claude, parei'); return } }
      }
    }
    writeCache(language, cache)
  }
}


// ---------------------------------------------------------------- translation by agents (without the Router)

const AGENTS = path.join(CACHE, 'agentes')

/** Writes what is missing of each language into input files, split into N pieces, for agents to translate without the Router. */
/** The unique sentences only of the families chosen with `--so` (all, without the option). */
async function chosenUnique() {
  const all = await allSources()
  if (!ONLY.length) return all.unique
  const unique = new Set()
  for (const { p, v } of all.json) if (chosen(familyOf(p))) collect(v, '', unique)
  if (chosen('conteudo')) collect(all.cont, '', unique)
  return unique
}

async function export_(languageSet, byLanguage) {
  const unique = await chosenUnique()
  fs.mkdirSync(AGENTS, { recursive: true })
  for (const language of languageSet) {
    const missing = await findMissing(language, unique)
    if (!missing.length) { console.log(`${language}: nada a exportar`); continue }
    // split by SIZE (not by count): the end of the list has the long paragraphs of the guides
    const total = missing.reduce((a, t) => a + t.length + 12, 0)
    const target = total / Math.max(1, byLanguage)
    const slices = []
    let current = [], acc = 0
    for (const t of missing) { current.push(t); acc += t.length + 12; if (acc >= target && slices.length < byLanguage - 1) { slices.push(current); current = []; acc = 0 } }
    if (current.length) slices.push(current)
    slices.forEach((slice, k) => fs.writeFileSync(path.join(AGENTS, `${language}-${k + 1}.in.json`), JSON.stringify(Object.fromEntries(slice.map((t, i) => [String(i), t])), null, 1)))
    const n = slices.length
    console.log(`${language}: ${missing.length} strings em ${n} arquivos`)
  }
}

/** Reads `<language>-<k>.out.json`, validates each string as the Router does and puts it in the cache. Returns how many went in. */
async function import_(languageSet) {
  for (const language of languageSet) {
    const cache = readCache(language)
    let ok = 0, bad = 0
    for (const f of fs.readdirSync(AGENTS).filter((x) => x.startsWith(`${language}-`) && x.endsWith('.out.json')).sort()) {
      const input = JSON.parse(fs.readFileSync(path.join(AGENTS, f.replace('.out.json', '.in.json')), 'utf8'))
      let output
      try { output = JSON.parse(fs.readFileSync(path.join(AGENTS, f), 'utf8')) } catch { console.log(`  ${f}: JSON inválido`); continue }
      const good = valid(input, output)
      for (const [k, t] of Object.entries(good)) { cache[input[k]] = t; ok++ }
      bad += Object.keys(input).length - Object.keys(good).length
    }
    writeCache(language, cache)
    console.log(`${language}: ${ok} entraram, ${bad} recusadas pela validação`)
  }
}


/** Checks an agent output file against the input, writing nothing: the agent runs this before finishing. */
function validate(files) {
  for (const f of files) {
    const input = JSON.parse(fs.readFileSync(f.replace('.out.json', '.in.json'), 'utf8'))
    let output
    try { output = JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { console.log(`${path.basename(f)}: JSON INVÁLIDO (${e.message})`); process.exitCode = 1; continue }
    const good = valid(input, output)
    const bad = Object.keys(input).filter((k) => !(k in good))
    console.log(`${path.basename(f)}: ${Object.keys(good).length}/${Object.keys(input).length} válidas`)
    for (const k of bad.slice(0, 15)) {
      const t = output[k]
      const reason = typeof t !== 'string' || !t.trim() ? 'faltando' : emDash.test(t) ? 'TEM TRAVESSÃO (— ou –): troque por vírgula, dois-pontos ou ponto' : markers(input[k]) !== markers(t) ? `marcadores diferentes: esperado [${markers(input[k]).split('\u0001').join(' ')}] veio [${markers(t).split('\u0001').join(' ')}]` : 'tamanho absurdo (truncada ou lixo)'
      console.log(`   chave ${k}: ${reason} | ${String(input[k]).slice(0, 60)}`)
    }
    if (bad.length) process.exitCode = 1
  }
}


// ---------------------------------------------------------------- touch-ups (Portuguese leakage and limits)

/** Portuguese terms that must NOT be left over in a translation (the name of a protocol type written loose in the middle of a sentence). */
const LEAK = /(moderação|apelação|aprovação|\brecados?\b|\bdepoimentos?\b|\brelé\b|\bnão\b|\bvocê\b|\bcomunidades?\b|\bentregas?\b)/i
const API_ROUTE = /^(GET|POST|PUT|DELETE|PATCH)\b/
const leaked = (language, t) => {
  if (API_ROUTE.test(t)) return false
  if (language === "es" || language === "fr" || language === "it") return /(moderação|apelação|aprovação|\bdepoimentos?\b|\bnão\b|\bvocê\b)/i.test(t)
  const clean = t.replace(/\{[^}]*\}|\/v1\/[\w/:.-]*|docs\/\S+|security@\S+|`[^`]*`|\((recado|depoimento|recados|depoimentos|apelação|relé)\)/g, '')
  return !API_ROUTE.test(t) && LEAK.test(clean)
}

async function touchupExport(languageSet) {
  const items = []
  for (const language of languageSet) {
    const cache = readCache(language)
    const seen = new Set()
    for (const x of violations(language).filter((v) => v.fonte)) {
      seen.add(x.fonte)
      items.push({ id: `${language}:${items.length}`, idioma: language, pt: x.fonte, atual: x.valor, problem: x.limite.max && x.n > x.limite.max ? `too long: ${x.n} characters, limit ${x.limite.max}` : `too short: ${x.n} characters, minimum ${x.limite.min}`, max: x.limite.max ?? null, min: x.limite.min ?? null })
    }
    for (const [pt, tr] of Object.entries(cache)) if (!seen.has(pt) && leaked(language, tr)) items.push({ id: `${language}:${items.length}`, idioma: language, pt, atual: tr, problem: 'contains untranslated Portuguese protocol terms (recado, depoimento, moderação, apelação, relé, comunidade, aprovação...): translate them with the language glossary', max: null, min: null })
  }
  fs.mkdirSync(AGENTS, { recursive: true })
  const byLanguage = {}
  for (const it of items) (byLanguage[it.idioma] ??= []).push(it)
  for (const [i, xs] of Object.entries(byLanguage)) fs.writeFileSync(path.join(AGENTS, `retoque-${i}.in.json`), JSON.stringify(xs, null, 1))
  console.log(Object.entries(byLanguage).map(([i, xs]) => `${i}:${xs.length}`).join(' '), `total ${items.length}`)
}

async function touchupImport(languageSet) {
  for (const language of languageSet) {
    const fin = path.join(AGENTS, `retoque-${language}.in.json`), fout = path.join(AGENTS, `retoque-${language}.out.json`)
    if (!fs.existsSync(fin) || !fs.existsSync(fout)) continue
    const input = JSON.parse(fs.readFileSync(fin, 'utf8')), output = JSON.parse(fs.readFileSync(fout, 'utf8'))
    const cache = readCache(language)
    let ok = 0, bad = 0
    for (const it of input) {
      const t = output[it.id]
      const n = typeof t === 'string' ? [...t].length : 0
      const good = typeof t === 'string' && t.trim() && !emDash.test(t) && markers(it.pt) === markers(t) && !leaked(language, t) && (it.max == null || n <= it.max) && (it.min == null || n >= it.min)
      if (good) { cache[it.pt] = t; ok++ } else { bad++; console.log(`  recusada ${it.id}: ${String(t).slice(0, 70)}`) }
    }
    writeCache(language, cache)
    console.log(`${language}: ${ok} retoques aplicados, ${bad} recusados`)
  }
}

const PARTIAL = process.argv.includes('--parcial')
const [cmd, ...resto0] = process.argv.slice(2)
const rest = resto0.filter((x) => x !== '--parcial' && !x.startsWith('--so='))
const targets = rest.length ? rest : ORDER
if (cmd === 'contar') await count()
else if (cmd === 'estado') await state()
else if (cmd === 'traduzir') await translate(targets)
else if (cmd === 'montar') { await build(targets); client() }
else if (cmd === 'cliente') client()
else if (cmd === 'semear') await seedNetwork(targets)
else if (cmd === 'limites') await limits(targets)
else if (cmd === 'exportar') await export_(targets.slice(1), Number(targets[0]))
else if (cmd === 'importar') await import_(targets)
else if (cmd === 'validar') validate(rest)
else if (cmd === 'retoque-exportar') await touchupExport(targets)
else if (cmd === 'retoque-importar') await touchupImport(targets)
else if (cmd === 'encurtar') await shorten(targets)
else if (cmd === 'faltam') { const unique = await chosenUnique(); for (const i of targets.slice(0, 1)) for (const t of await findMissing(i, unique)) console.log(JSON.stringify(t)) }
else console.log('uso: node scripts/translate-site.mjs contar | estado | traduzir [idioma ...] | montar [idioma ...]')
