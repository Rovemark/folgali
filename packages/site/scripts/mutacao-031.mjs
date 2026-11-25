#!/usr/bin/env node
// Medidor de mutação das TELAS e da lógica da revisão 0.3.1 do site (campos novos do relé: datas, carência, removidos, depoimentos enviados, temas,
// reações do tópico, dispensar denúncia, pessoas em alta). Mesmo padrão do `scripts/mutacao.mjs`, em três etapas, e ele se recusa a dar nota se uma falhar:
//
//   1. GUARDA DE BASE: os testes passam sem defeito nenhum.
//   2. GUARDA DE DEFEITO LETAL: planta à mão defeitos que NÃO podem passar (mostrar botão a quem não pode, apagar o conteúdo ao dispensar, deixar um relé 0.3 virar
//      erro, vazar quem denunciou...) numa cópia do projeto e exige que os testes acusem cada um. Se um passar, o medidor não morde e a nota seria mentira.
//   3. STRYKER: só nas LINHAS NOVAS (os intervalos saem de âncoras no texto, para não mutar o resto dos arquivos), cada mutante rodando os testes que o cobrem.
//
// Uso: node scripts/mutacao-031.mjs [--so-guardas]

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const soGuardas = process.argv.includes('--so-guardas')

function vitest(cwd, alvos = []) {
  const r = spawnSync('npx', ['vitest', 'run', ...alvos], { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, saida: `${r.stdout}\n${r.stderr}` }
}

console.log('1. guarda de base: a suíte do site passa sem defeito?')
const base = vitest(raiz)
if (!base.ok) {
  console.error(base.saida.split('\n').slice(-25).join('\n'))
  console.error('\nBASE VERMELHA: conserte os testes antes de medir mutação.')
  process.exit(1)
}
console.log('   verde.\n')

// cada defeito: arquivo, trecho exato a trocar, troca, e o que ele quebra
const DEFEITOS = [
  { arq: 'src/lib/dominio/prazos.ts', de: 'Math.max(ta, tb) + dias * DIA_MS', para: 'Math.min(ta, tb) + dias * DIA_MS', nome: 'dizer que o selo abre antes do dia em que abre de verdade' },
  { arq: 'src/lib/dominio/prazos.ts', de: 'return passou >= exigido ? 0 :', para: 'return false ? 0 :', nome: 'a carência nunca acabar' },
  { arq: 'src/lib/dominio/prazos.ts', de: 'return Math.max(1, Math.ceil(segundos / 60))', para: 'return Math.floor(segundos / 60)', nome: 'mostrar "faltam 0 minutos"' },
  { arq: 'src/components/perfil/elegibilidade.ts', de: 'return Number.isFinite(t) ? Math.floor((agora.getTime() - t) / DIA) :', para: 'return Number.isFinite(t) ? Math.ceil((agora.getTime() - t) / DIA) :', nome: 'contar um dia de amizade que ainda não completou' },
  { arq: 'src/lib/comunidades/dados.ts', de: 'membroHa: membroHaSegundos(voce?.membroDesde, agora) }', para: 'membroHa: undefined }', nome: 'a carência de membro não valer na tela' },
  { arq: 'src/lib/dominio/ato.ts', de: "return ehIdObjeto(o.comunidade) && ehIdObjeto(o.alvo) ? { tipo: 'denuncia-dispensar'", para: "return true ? { tipo: 'denuncia-dispensar'", nome: 'aceitar um pedido de dispensar com ids inventados' },
  { arq: 'src/lib/social/sanear-social.ts', de: "o.acao === 'dispensa' ? enumerado(['dispensada'] as const, o.motivo) : enumerado(MOTIVOS_MODERACAO, o.motivo)", para: "enumerado(MOTIVOS_MODERACAO, o.motivo)", nome: 'o registro com a dispensa derrubar a página inteira' },
  { arq: 'src/lib/social/sanear-social.ts', de: "return SELOS.filter((k) => x.includes(k))", para: "return x as TipoSelo[]", nome: 'aceitar um selo que não existe' },
  { arq: 'src/lib/social/sanear-social.ts', de: 'x >= 0 && x <= 1_000_000 ? x : undefined', para: 'true ? x as number : undefined', nome: 'mostrar "-3 pessoas" no em alta' },
  { arq: 'src/lib/social/sanear-social.ts', de: "if (banidoEm !== undefined) voce.banidoEm = banidoEm", para: "void banidoEm", nome: 'perder a data do banimento' },
  { arq: 'src/lib/social/sanear-social.ts', de: "if (rc && typeof rc.curtir === 'number' && typeof rc.util === 'number') {", para: "if (rc) {", nome: 'o tópico com contagem torta quebrar a página' },
  { arq: 'src/lib/social/http/leitura.ts', de: "if (!(await this.suporta('removidos'))) return { itens: [] }", para: "if (false) return { itens: [] }", nome: 'chamar uma rota que o relé 0.3 não tem' },
  { arq: 'src/lib/social/http/leitura.ts', de: "antes: antesDe(cursor) })}`, 'propria'), S.depoimentoEnviado)", para: "antes: antesDe(cursor) })}`, 'publica'), S.depoimentoEnviado)", nome: 'ler os depoimentos enviados sem a credencial do rover' },
  { arq: 'src/lib/social/http/leitura.ts', de: "return (await this.recursosGuardados.valor).has(recurso)", para: "return true", nome: 'achar que um relé 0.3 tem os recursos novos' },
  { arq: 'src/lib/social/falso/escrita.ts', de: "if (!this.ehEquipe(c, autor)) throw new ErroRede('sem-permissao', 'só o dono e a moderação dispensam denúncias')", para: "void c", nome: 'qualquer membro dispensar denúncia' },
  { arq: 'src/lib/social/falso/escrita.ts', de: 'for (const d of abertas) d.dispensadaEm = agora', para: 'for (const d of abertas) void d', nome: 'a denúncia dispensada continuar na fila' },
  { arq: 'src/lib/social/falso/leitura.ts', de: 'if (d.dispensadaEm !== undefined) continue', para: 'if (false) continue', nome: 'a fila ignorar que a denúncia foi dispensada' },
  { arq: 'src/lib/social/falso/leitura.ts', de: "const r = this.rover(uid)\n    this.exigirPropria(uid)\n    const itens = this.registro", para: "const r = this.rover(uid)\n    const itens = this.registro", nome: 'ler o que foi removido do rover de outra pessoa' },
  { arq: 'src/components/perfil/Medalhas.tsx', de: "{pode === 'sim' && !jaDeu.includes(k) && (", para: "{pode === 'sim' && (", nome: 'oferecer dar de novo um selo que já foi dado' },
  { arq: 'src/components/perfil/ListaRemovidos.tsx', de: "const podeApelar = x.escopo === 'comunidade' && x.contexto !== null && x.apelacao === null", para: "const podeApelar = x.apelacao === null", nome: 'oferecer apelar de uma remoção da página ou do relé' },
  { arq: 'src/app/[lang]/comunidades/[id]/moderacao/page.tsx', de: '{podeDispensar && (\n                        <BotaoAto', para: '{(\n                        <BotaoAto', nome: 'mostrar "Dispensar" num relé que não tem a ação' },
]

console.log('2. guarda de defeito letal: cada defeito plantado precisa ser acusado pelos testes.')
const tmp = join(raiz, '.stryker-tmp', 'letal031')
let furou = 0
for (const [i, d] of DEFEITOS.entries()) {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  for (const pasta of ['src', 'test', 'public']) cpSync(join(raiz, pasta), join(tmp, pasta), { recursive: true })
  for (const f of ['package.json', 'tsconfig.json', 'vitest.config.ts']) cpSync(join(raiz, f), join(tmp, f))
  symlinkSync(join(raiz, 'node_modules'), join(tmp, 'node_modules'))
  const alvo = join(tmp, d.arq)
  const antes = readFileSync(alvo, 'utf8')
  if (!antes.includes(d.de)) {
    console.error(`   defeito ${i + 1} (${d.nome}): o trecho a trocar não existe mais no código. Atualize a lista.`)
    process.exit(1)
  }
  writeFileSync(alvo, antes.replace(d.de, d.para))
  const r = vitest(tmp)
  if (r.ok) {
    furou++
    console.error(`   NÃO ACUSADO: ${d.nome}`)
  } else console.log(`   acusado: ${d.nome}`)
}
rmSync(tmp, { recursive: true, force: true })
if (furou) {
  console.error(`\n${furou} defeito(s) letal(is) passaram. O medidor não morde: nota recusada.`)
  process.exit(1)
}
console.log(`   ${DEFEITOS.length} de ${DEFEITOS.length} acusados.\n`)
if (soGuardas) process.exit(0)

// ---- 3. Stryker só nas linhas novas -------------------------------------------------------------------------------------------------------
/** Linhas (1-based, inclusivas) do bloco que começa na linha com `ancora`: se a linha não abre chaves, é só ela; senão vai até o primeiro `}` na coluna 0. */
function bloco(arq, ancora) {
  const linhas = readFileSync(join(raiz, arq), 'utf8').split('\n')
  const i = linhas.findIndex((l) => l.includes(ancora))
  if (i < 0) throw new Error(`âncora não achada em ${arq}: ${ancora}`)
  if (!linhas[i].trimEnd().endsWith('{')) return [i + 1, i + 1]
  // o fecho é `}` na coluna 0 para função de módulo, ou `  }` para método de classe
  const fecho = linhas[i].startsWith(' ') ? '  }' : '}'
  let j = i + 1
  while (j < linhas.length && linhas[j] !== fecho) j++
  return [i + 1, j + 1]
}
const faixa = (arq, ancora, ate) => {
  const [a, b] = bloco(arq, ancora)
  const f = ate ? bloco(arq, ate)[1] : b
  return `${arq}:${a}-${f}`
}
const mutate = [
  'src/lib/dominio/prazos.ts',
  'src/components/perfil/Medalhas.tsx',
  'src/components/perfil/ListaEnviados.tsx',
  'src/components/perfil/ListaRemovidos.tsx',
  faixa('src/components/perfil/elegibilidade.ts', 'export function diasDesde('),
  faixa('src/lib/comunidades/dados.ts', 'export function quemDe('),
  faixa('src/lib/dominio/ato.ts', "case 'denuncia-dispensar':", "return ehIdObjeto(o.comunidade) && ehIdObjeto(o.alvo) ? { tipo: 'denuncia-dispensar'"),
  faixa('src/lib/social/sanear-social.ts', '// ---- campos aditivos da revisão 0.3.1 ----', 'const selosAditivo = '),
  faixa('src/lib/social/sanear-social.ts', 'function comPessoas('),
  faixa('src/lib/social/sanear-social.ts', 'const voceNaComunidade = '),
  faixa('src/lib/social/sanear-social.ts', 'function topicoDaFila('),
  faixa('src/lib/social/sanear-social.ts', 'export function registro('),
  faixa('src/lib/social/sanear-social.ts', 'export function removido('),
  faixa('src/lib/social/sanear-social.ts', 'export function depoimentoEnviado('),
  faixa('src/lib/social/sanear-social.ts', 'export function temaDePagina('),
  faixa('src/lib/social/http/leitura.ts', 'async suporta('),
  faixa('src/lib/social/http/leitura.ts', 'async depoimentosEnviados('),
  faixa('src/lib/social/http/leitura.ts', 'async removidos('),
  faixa('src/lib/social/http/leitura.ts', 'async temasDePaginas('),
  faixa('src/lib/social/falso/escrita.ts', 'protected dispensarDenuncia('),
  faixa('src/lib/social/falso/leitura.ts', 'async depoimentosEnviados('),
  faixa('src/lib/social/falso/leitura.ts', 'async removidos('),
  faixa('src/lib/social/falso/leitura.ts', 'async temasDePaginas('),
]
const config = {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  coverageAnalysis: 'perTest',
  mutate,
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutacao-031.json' },
  tempDirName: '.stryker-tmp',
  concurrency: 4,
  timeoutMS: 20000,
  ignoreStatic: true,
  thresholds: { high: 90, low: 80, break: null },
}
const arquivo = join(raiz, '.stryker-tmp', 'stryker.031.json')
mkdirSync(dirname(arquivo), { recursive: true })
writeFileSync(arquivo, JSON.stringify(config, null, 2))
console.log('3. stryker (mutações automáticas só nas linhas novas)...')
const s = spawnSync('npx', ['stryker', 'run', arquivo], { cwd: raiz, stdio: 'inherit' })
process.exit(s.status ?? 1)
