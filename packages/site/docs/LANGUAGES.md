# Languages: the same 12 as the Rovemark site

pt, en, es, fr, de, it, nl, ru, ar, zh, ja, ko. Portuguese is the source: every sentence is born in it and the other eleven follow.
Arabic is right to left.

## Where each text lives

| what | files |
|---|---|
| interface | `src/i18n/<language>.json`, `house.<language>.json` (house rule and About), `join.<language>.json`, `footer.<language>.json`, `institutional.<language>.json`, `social/*.<language>.json` |
| FAQ, glossary, guides, news | `pt` and `en` in TypeScript (`src/content/*.pt.ts`, `*.en.ts`); the other ten in `src/content/data/<language>.json` |
| index of everything | `src/i18n/packages.ts` (static import of the 12) and `src/content/index.ts` |
| client component texts | `src/i18n/client.json` (only 6 sentences, generated), read by `src/lib/i18n-client.ts` |
| language list, formatting | `src/lib/i18n-base.ts` (light, can go to the browser); `src/lib/i18n.ts` brings the dictionaries (server only) |

A client component never imports `@/lib/i18n` with `dict`: it would take the 12 dictionaries (about 3 MB) to the browser.

## How translation works

`node scripts/translate-site.mjs contar | estado | semear | traduzir [language ...] | montar [--so=families] [language ...] | faltam <language>`
(the subcommands are Portuguese words, as the script has them: `contar` count, `estado` state, `semear` seed, `traduzir` translate, `montar` assemble, `faltam` missing).

1. it collects every translatable string from Portuguese (about 2,200 unique ones);
2. it translates each unique string once per language through the Logica Router, in batches of 6 KB, 3 calls at a time;
3. it keeps the result in `.traducoes/<language>.json` (outside git; resumable: if it crashes, what was already translated is on disk);
4. `montar` writes the language's files with the same shape as the Portuguese ones.

It refuses a batch that loses a marker (`{n}`, `` `code` ``, URL, tag) or brings an em dash. What is not text is not translated:
id, slug, url, code block, and the lists `ver`, `relacionados` and `perguntas` (route and content ids).
A caution inherited from a real defect: the rule is by KEY NAME, so a key name that is also a label ("nome", "licenca",
"seguranca") must not go in the data list, or the label stays in Portuguese.

## Quality lock

`test/i18n/twelve-languages.test.ts` runs for the 12 languages: same shape as Portuguese, same markers, no em dash, same
numbers in each answer, same ids and slugs, short-answer length by script, and text of its own (not a copy of English).
The translation is machine translation: there was no review by a native speaker. This is said on `/sobre` and must be said to whoever indexes it.

## Arabic, Chinese, Japanese, Korean

- `src/app/languages.css`: system font for CJK and Arabic, larger line height, no letter spacing, line breaking by phrase.
- CSS in logical properties (`margin-inline-start` and so on): the Arabic mirror comes out without a rule per language.
- Open Graph image: Chinese, Japanese and Korean use their own subset font in `src/fonts/og/<language>-<weight>.ttf` (`scripts/og-fonts.mjs`);
  without the file the image comes out in English instead of empty squares. Arabic always comes out in English: satori does not do bidirectional order or measure
  joined words (tested, it came out reversed). No font comes from the network at runtime.
- Visual proof: `node scripts/proof-languages.mjs --idiomas ar,zh --saida <folder>`; open each photo.

## What goes into git

The assembled files go (`src/i18n/<language>*.json`, `src/content/data/<language>.json`, `src/i18n/client.json`); the
`.traducoes/` cache does not (outside git). On a new machine or in a worktree, the cache does not exist: `semear` rebuilds it from the
assembled files.

### Changing a sentence in Portuguese

1. `semear` BEFORE touching pt: each pt sentence is matched with the translation at the same path in the language's file and goes into the
   cache (it never overwrites what is already there). Without it, every sentence becomes "missing".
2. Edit pt (and en, which is written by hand). `estado` shows how many sentences were left without a translation.
3. `traduzir` (through the Router) or `exportar 1 <languages>`, translation outside the Router in `.traducoes/agentes/<language>-1.out.json`,
   `validar` and `importar`.
4. `montar --so=<families> <languages>`: only the families you touched. The family is the pt file name without `.pt.json`
   (`institutional`, `footer`, `social/home`, `social/folgali`), `base` for `pt.json` and `conteudo` for `src/content/data`. Without
   `--so`, `montar` rewrites the files of all families, including those another front is touching.
5. Check the `git diff` of the assembled files. A translation adjusted by hand directly in the assembled file (without going through the cache) goes back to the
   cache version on `montar`: on 2026-11-24, "J'aime" became "Aimer" in French this way. Undo whatever is not from the sentences you changed.
6. A code block (`codigo`) is not translated: `montar` copies the pt one. If you only fixed the diff by hand, copy the block too.
On 2026-11-09 the Router had no Claude (subscription penalty) and 7,300 strings were translated by Claude subagents with the
same validator (`validar`, `importar`); `retoque-exportar`/`retoque-importar` fix leftover Portuguese terms and texts
above the SEO limit (`limites`).
