// SPDX-License-Identifier: AGPL-3.0-or-later
// Medidor de mutação por módulo. Planta UM defeito por vez numa cópia temporária do repositório e exige que a bateria de
// testes do módulo caia. Operadores: comparação (=== !== < <= > >=), lógicos (&& ||), aritmética (+ - *), inteiros (+1 e -1),
// booleanos (true false), negação (`!x` vira `x`), condição de `if (...) {` forçada a true e a false e guarda de uma linha
// (`if (...) return|throw|continue|break` vira `if (false)`). Só mexe em CÓDIGO: um varredor próprio separa comentário,
// texto e regex do que é código.
//
// Antes do primeiro defeito, as duas guardas de guarda.mjs (linha de base viva e defeito letal). Cada defeito é conferido com
// `node --check`: o que nem compila é descartado e contado à parte (morrer de SyntaxError não prova nada sobre os testes).
// Quem sobrevive entra em `equivalentes` (com o motivo: nenhum teste pode distinguir) ou é um furo de teste a consertar.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { exigirMedidorVivo } from './guarda.mjs'

/** O que nunca vai para a cópia temporária do medidor. */
export const FORA_DA_COPIA = /[\\/](node_modules|\.next)([\\/]|$)/

const PALAVRAS_ANTES_DE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else'])

/** 1 onde há código, 0 onde há comentário, texto ou regex. */
export function classificar(texto) {
  const cod = new Uint8Array(texto.length)
  const pilha = [] // 'tpl' ou { expr: profundidade de chaves }
  let i = 0
  let ultimo = '' // último caractere de código que não é espaço
  let ultimaPalavra = ''
  const ehEspaco = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r'
  const marcar = (a, b) => { for (let k = a; k < b; k++) cod[k] = 1 }
  while (i < texto.length) {
    const topo = pilha[pilha.length - 1]
    if (topo === 'tpl') {
      const c = texto[i]
      if (c === '\\') { i += 2; continue }
      if (c === '`') { pilha.pop(); i++; ultimo = '`'; continue }
      if (c === '$' && texto[i + 1] === '{') { pilha.push({ expr: 0 }); i += 2; ultimo = '{'; continue }
      i++
      continue
    }
    const c = texto[i]
    const n = texto[i + 1]
    if (ehEspaco(c)) { cod[i] = 1; i++; continue }
    if (c === '/' && n === '/') { while (i < texto.length && texto[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { const f = texto.indexOf('*/', i + 2); i = f < 0 ? texto.length : f + 2; continue }
    if (c === '"' || c === "'") {
      i++
      while (i < texto.length && texto[i] !== c && texto[i] !== '\n') i += texto[i] === '\\' ? 2 : 1
      i++
      ultimo = c
      continue
    }
    if (c === '`') { pilha.push('tpl'); i++; continue }
    if (c === '/') {
      const regex = ultimo === '' || '(,=:[!&|?{};'.includes(ultimo) || PALAVRAS_ANTES_DE_REGEX.has(ultimaPalavra)
      if (regex) {
        i++
        let classe = false
        while (i < texto.length && texto[i] !== '\n') {
          const d = texto[i]
          if (d === '\\') { i += 2; continue }
          if (d === '[') classe = true
          else if (d === ']') classe = false
          else if (d === '/' && !classe) break
          i++
        }
        i++
        while (i < texto.length && /[a-z]/.test(texto[i])) i++
        ultimo = '/'
        ultimaPalavra = ''
        continue
      }
    }
    if (c === '{' && topo && typeof topo === 'object') topo.expr++
    if (c === '}' && topo && typeof topo === 'object') {
      if (topo.expr === 0) { pilha.pop(); i++; continue }
      topo.expr--
    }
    marcar(i, i + 1)
    if (/[\w$]/.test(c)) {
      let j = i
      while (j < texto.length && /[\w$]/.test(texto[j])) { cod[j] = 1; j++ }
      ultimaPalavra = texto.slice(i, j)
      ultimo = texto[j - 1]
      i = j
      continue
    }
    ultimo = c
    ultimaPalavra = ''
    i++
  }
  return cod
}

const todoCodigo = (cod, a, b) => { for (let k = a; k < b; k++) if (!cod[k]) return false; return true }

const TROCAS = [
  ['===', '!=='], ['!==', '==='], ['&&', '||'], ['||', '&&'],
  ['<=', '<'], ['>=', '>'], [' < ', ' <= '], [' > ', ' >= '],
  [' + ', ' - '], [' - ', ' + '], [' * ', ' / '],
  ['true', 'false'], ['false', 'true']
]

/** Defeitos de UMA linha. `cod` é a máscara da linha (mesmo comprimento). */
export function mutantesDaLinha(linha, cod) {
  const out = []
  if (!linha.trim()) return out
  for (const [de, para] of TROCAS) {
    let i = -1
    while ((i = linha.indexOf(de, i + 1)) !== -1) {
      if (!todoCodigo(cod, i, i + de.length)) continue
      const ident = /[\w$]/
      if (/^[a-z]/.test(de) && (ident.test(linha[i - 1] ?? '') || ident.test(linha[i + de.length] ?? ''))) continue
      out.push([`${de.trim()}->${para.trim()}@${i}`, linha.slice(0, i) + para + linha.slice(i + de.length)])
    }
  }
  // negação: `!x` vira `x` (não toca em `!=`, `!==` nem em `!!`)
  for (let i = 0; i < linha.length; i++) {
    if (linha[i] === '!' && cod[i] && linha[i + 1] !== '=' && linha[i + 1] !== '!' && linha[i - 1] !== '!') {
      out.push([`!-removido@${i}`, linha.slice(0, i) + linha.slice(i + 1)])
    }
  }
  // inteiros
  const re = /(?<![\w$.])(\d+)(?![\w.])/g
  let m
  while ((m = re.exec(linha))) {
    if (!todoCodigo(cod, m.index, m.index + m[1].length)) continue
    const n = Number(m[1])
    out.push([`${n}->${n + 1}@${m.index}`, linha.slice(0, m.index) + (n + 1) + linha.slice(m.index + m[1].length)])
    if (n > 0) out.push([`${n}->${n - 1}@${m.index}`, linha.slice(0, m.index) + (n - 1) + linha.slice(m.index + m[1].length)])
  }
  // condição de `if (...) {` forçada
  const cond = /^(\s*(?:\}\s*else\s+)?if \()(.*)(\) \{\s*)$/.exec(linha)
  if (cond && cod[cond[1].length - 4]) {
    out.push(['if-sempre-falso', `${cond[1]}false${cond[3]}`])
    out.push(['if-sempre-verdadeiro', `${cond[1]}true${cond[3]}`])
  }
  const g = /^(\s*)if \((.*)\) (return\b.*|throw\b.*|continue\b.*|break\b.*)$/.exec(linha)
  if (g && cod[g[1].length]) out.push(['guarda-desligada', `${g[1]}if (false) ${g[3]}`])
  return out
}

/** Funções que matam o grupo de cada mutante em andamento; a saída do medidor as chama para não deixar órfão para trás. */
const gruposVivos = new Set()
const limparGrupos = () => { for (const matar of [...gruposVivos]) matar() }
process.on('exit', limparGrupos)
for (const sinal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sinal, () => { limparGrupos(); process.exit(128) })

/**
 * @param {object} o
 * @param {string} o.rotulo
 * @param {string} o.raiz                    raiz do repositório
 * @param {string[]} o.copiar                arquivos e pastas (relativos à raiz) que o teste precisa na cópia
 * @param {Array<{ arquivo: string, desde?: string, ate?: string }>} o.alvos
 * @param {string[]} o.testes                arquivos de teste da bateria do módulo (relativos à raiz)
 * @param {Map<string,string>} [o.equivalentes]  `${arquivo}:${linha.trim()}|${operador}` -> motivo
 * @param {Array<[string, string, string, string]>} [o.extras]  defeitos à mão onde nenhum operador alcança: [nome, arquivo, trecho, troca]
 * @param {number} [o.paralelo]
 * @param {boolean} [o.sequencial]           um arquivo de teste por vez, parando no primeiro que cair (a ordem de `testes` importa)
 * @param {number} [o.tempoLimiteMs]         tempo limite de cada mutante (padrão 60000); passou, o grupo de processos inteiro é morto
 */
export async function rodarMedidor(o) {
  const equivalentes = o.equivalentes ?? new Map()
  const argsDoNode = ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap', ...o.testes]
  const copiar = () => {
    const tmp = mkdtempSync(join(tmpdir(), `rn-mutacao-${o.rotulo.replace(/\W+/g, '-')}-`))
    for (const f of o.copiar) {
      mkdirSync(dirname(join(tmp, f)), { recursive: true })
      // node_modules e .next do site nunca entram na cópia: nenhuma bateria do medidor os usa, e com o node_modules copiado de verdade
      // (não por link) cada cópia passava de 500 MB, vezes 8 cópias por módulo; foi o que encheu o disco em 17/11/2026
      cpSync(join(o.raiz, f), join(tmp, f), { recursive: true, filter: (origem) => !FORA_DA_COPIA.test(origem) })
    }
    return tmp
  }
  // as guardas (linha de base e defeito letal) também rodam em grupo próprio e o grupo é morto no fim: um teste que deixe um filho vivo não vaza
  const rodar = (tmp) => {
    const r = spawnSync(process.execPath, argsDoNode, { cwd: tmp, encoding: 'utf8', timeout: 120_000, detached: true })
    try { process.kill(-r.pid, 'SIGKILL') } catch { /* o grupo já acabou */ }
    return r
  }
  exigirMedidorVivo({ rotulo: o.rotulo, copiar, rodar, alvoLetal: o.alvos[0].arquivo })

  const mutantes = []
  for (const { arquivo, desde, ate } of o.alvos) {
    const texto = readFileSync(join(o.raiz, arquivo), 'utf8')
    const cod = classificar(texto)
    const linhas = texto.split('\n')
    let ini = 0
    let fim = linhas.length
    if (desde) { ini = linhas.findIndex((l) => l.includes(desde)); if (ini < 0) throw new Error(`início não achado em ${arquivo}: ${desde}`) }
    if (ate) { const f = linhas.findIndex((l, i) => i > ini && l.includes(ate)); if (f < 0) throw new Error(`fim não achado em ${arquivo}: ${ate}`); fim = f + 1 }
    let deslocamento = 0
    for (let i = 0; i < linhas.length; i++) {
      if (i >= ini && i < fim) {
        for (const [op, nova] of mutantesDaLinha(linhas[i], cod.subarray(deslocamento, deslocamento + linhas[i].length))) {
          mutantes.push({ arquivo, linha: i, op, nova, original: linhas[i] })
        }
      }
      deslocamento += linhas[i].length + 1
    }
  }
  for (const [nome, arquivo, de, para] of o.extras ?? []) {
    const linhas = readFileSync(join(o.raiz, arquivo), 'utf8').split('\n')
    const i = linhas.findIndex((l) => l.includes(de))
    if (i < 0) throw new Error(`defeito manual "${nome}": trecho não achado em ${arquivo} (o código mudou?): ${de}`)
    mutantes.push({ arquivo, linha: i, op: nome, nova: linhas[i].replace(de, () => para), original: linhas[i] })
  }
  const fatia = process.env.MUTACAO_FATIA ? process.env.MUTACAO_FATIA.split('/').map(Number) : null
  const meus = fatia ? mutantes.filter((_, k) => k % fatia[1] === fatia[0] - 1) : mutantes
  console.log(`${meus.length} defeitos a plantar${fatia ? ` (fatia ${fatia[0]} de ${fatia[1]}, de ${mutantes.length})` : ''}`)

  const n = Math.max(1, Math.min(o.paralelo ?? 6, meus.length))
  const copias = Array.from({ length: n }, () => copiar())
  const originais = new Map()
  const res = { pegos: 0, equivalentes: 0, invalidos: 0, furos: [], feitos: 0 }
  let proximo = 0
  // Cada mutante roda em GRUPO DE PROCESSOS PRÓPRIO (detached): o `node --test` abre um filho por arquivo de teste e um defeito que
  // faz o código girar deixaria esse neto vivo (órfão, de PPID 1) quando só o filho direto levasse o SIGKILL. O tempo limite e o fim
  // do mutante matam o grupo inteiro (kill(-pgid)), e a saída do medidor (fim, Ctrl+C, SIGTERM) mata os grupos que ainda estiverem de pé.
  const tempoLimiteMs = o.tempoLimiteMs ?? 60_000
  const rodarArquivos = (tmp, arquivos) => new Promise((ok) => {
    const filho = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap', ...arquivos], { cwd: tmp, stdio: 'ignore', detached: true })
    const matarGrupo = () => { try { process.kill(-filho.pid, 'SIGKILL') } catch { /* o grupo já acabou */ } }
    gruposVivos.add(matarGrupo)
    const fim = (codigo) => { clearTimeout(t); matarGrupo(); gruposVivos.delete(matarGrupo); ok(codigo) }
    const t = setTimeout(() => { matarGrupo() }, tempoLimiteMs)
    filho.on('close', (codigo) => fim(codigo ?? 1))
    filho.on('error', () => fim(1))
  })
  // `sequencial`: roda um arquivo de teste por vez, na ordem dada, e para no primeiro que cair. O defeito morto cedo custa pouco;
  // o que sobrevive roda todos os arquivos, e é o mesmo veredito de rodar a bateria inteira de uma vez.
  const rodarAsync = async (tmp) => {
    if (!o.sequencial) return rodarArquivos(tmp, o.testes)
    for (const arquivo of o.testes) {
      const codigo = await rodarArquivos(tmp, [arquivo])
      if (codigo !== 0) return codigo
    }
    return 0
  }
  const compila = (tmp, arquivo) => spawnSync(process.execPath, ['--check', join(tmp, arquivo)], { stdio: 'ignore' }).status === 0
  const trabalhador = async (tmp) => {
    for (;;) {
      const k = proximo++
      if (k >= meus.length) return
      const { arquivo, linha, op, nova, original } = meus[k]
      const alvo = join(tmp, arquivo)
      const orig = originais.get(arquivo) ?? readFileSync(join(o.raiz, arquivo), 'utf8')
      originais.set(arquivo, orig)
      const ls = orig.split('\n')
      ls[linha] = nova
      writeFileSync(alvo, ls.join('\n'))
      let codigo = null
      let valido = true
      try {
        valido = compila(tmp, arquivo)
        if (valido) codigo = await rodarAsync(tmp)
      } finally { writeFileSync(alvo, orig) }
      res.feitos++
      if (!valido) { res.invalidos++; continue }
      const chave = `${arquivo}:${original.trim()}|${op}`
      if (codigo !== 0) { res.pegos++; continue }
      if (equivalentes.has(chave)) { res.equivalentes++; console.log(`EQUIV    ${arquivo}:${linha + 1} ${op}: ${equivalentes.get(chave)}`); continue }
      res.furos.push(chave)
      console.log(`PASSOU   ${arquivo}:${linha + 1} ${op}\n         ${original.trim().slice(0, 170)}\n      -> ${nova.trim().slice(0, 170)}`)
    }
  }
  try { await Promise.all(copias.map(trabalhador)) } finally { for (const c of copias) rmSync(c, { recursive: true, force: true }) }
  const validos = res.feitos - res.invalidos
  console.log(`\n[${o.rotulo}] ${res.feitos} defeitos plantados, ${res.invalidos} descartados por não compilar, ${validos} válidos: ${res.pegos} pegos, ${res.equivalentes} equivalentes, ${res.furos.length} NÃO pegos`)
  return { rotulo: o.rotulo, plantados: res.feitos, invalidos: res.invalidos, validos, pegos: res.pegos, equivalentes: res.equivalentes, furos: res.furos }
}
