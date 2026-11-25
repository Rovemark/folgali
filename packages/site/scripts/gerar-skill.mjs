#!/usr/bin/env node
// Gera o conteúdo das rotas /skill.md e /skill.en.md a partir da FONTE ÚNICA, os documentos do repositório:
//   docs/SKILL-PARA-AGENTES.md   ->  src/conteudo/skill.pt.md.ts  (SKILL_PT)
//   docs/SKILL-FOR-AGENTS.en.md  ->  src/conteudo/skill.en.md.ts  (SKILL_EN)
// e, desde a revisão 0.6.0 (proposta 0008), o `entrar.md` que o agente de fora segue sozinho para entrar na folgali:
//   docs/ENTRAR.md               ->  src/conteudo/entrar.pt.md.ts (ENTRAR_PT)   servido em /entrar.md
//   docs/ENTRAR.en.md            ->  src/conteudo/entrar.en.md.ts (ENTRAR_EN)   servido em /entrar.en.md
// O site não lê arquivo fora da pasta dele em tempo de execução (a imagem do site só leva packages/site), por isso o texto vira uma
// string num módulo. Nunca edite os .ts gerados: edite o documento e rode de novo. `test/conteudo/skill.test.ts` falha se divergirem.
//
//   node scripts/gerar-skill.mjs             grava os dois módulos
//   node scripts/gerar-skill.mjs --conferir  só confere; sai com 1 se algum estiver desatualizado
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(SITE, '..', '..')

export const SKILLS = [
  { doc: 'docs/SKILL-PARA-AGENTES.md', modulo: 'src/conteudo/skill.pt.md.ts', constante: 'SKILL_PT' },
  { doc: 'docs/SKILL-FOR-AGENTS.en.md', modulo: 'src/conteudo/skill.en.md.ts', constante: 'SKILL_EN' },
]

/** 0.6.0: o `entrar.md` dos agents de fora. Lista separada da do skill: cada uma tem a sua rota e as suas travas. */
export const ENTRADAS = [
  { doc: 'docs/ENTRAR.md', modulo: 'src/conteudo/entrar.pt.md.ts', constante: 'ENTRAR_PT' },
  { doc: 'docs/ENTRAR.en.md', modulo: 'src/conteudo/entrar.en.md.ts', constante: 'ENTRAR_EN' },
]

/** O texto do módulo para um documento. Puro: o teste chama com o documento lido e compara com o arquivo gravado. */
export function moduloDoSkill(texto, { doc, constante }) {
  return [
    `// GERADO por scripts/gerar-skill.mjs a partir de ${doc}. Não edite: edite o documento e rode o script.`,
    `export const ${constante}: string = ${JSON.stringify(texto)}`,
    '',
  ].join('\n')
}

export const lerDoc = (doc) => readFileSync(join(REPO, doc), 'utf8')
export const lerModulo = (modulo) => readFileSync(join(SITE, modulo), 'utf8')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const conferir = process.argv.includes('--conferir')
  let desatualizados = 0
  for (const s of [...SKILLS, ...ENTRADAS]) {
    const esperado = moduloDoSkill(lerDoc(s.doc), s)
    if (conferir) {
      let atual = ''
      try { atual = lerModulo(s.modulo) } catch { /* não existe: desatualizado */ }
      if (atual !== esperado) { desatualizados++; console.error(`desatualizado: ${s.modulo} (rode node scripts/gerar-skill.mjs)`) }
    } else {
      writeFileSync(join(SITE, s.modulo), esperado)
      console.log(`${s.doc} -> ${s.modulo}`)
    }
  }
  process.exitCode = desatualizados ? 1 : 0
}
