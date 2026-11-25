#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Monta o pacote npm do cliente (`@rovemark/rover-network-cliente`) num .tgz, SEM publicar nada.
//
// Por que existe: no repositório o cliente importa o protocolo por caminho relativo (`../../protocolo/src/index.js`), o que não
// funciona dentro de node_modules. Em vez de mexer nos fontes (outras frentes acrescentam métodos ao cliente ao mesmo tempo), este
// script copia o cliente para uma pasta de montagem, põe uma cópia do protocolo em `src/protocolo/` e reescreve SÓ os imports que
// apontam para o protocolo. Qualquer import relativo que saia do pacote e não vá para o protocolo é erro, e o script para.
// O pacote não tem dependência nenhuma: só o Node 22.
//
//   node packages/cliente/scripts/empacotar.mjs [--destino <pasta>]      imprime o caminho do .tgz
//
// O package.json do repositório tem `"private": true` como trava contra `npm publish` por engano a partir da pasta errada
// (publicar de lá mandaria o cliente sem o protocolo). O da montagem não tem a trava: publicar é `npm publish <tgz>`, decisão do
// Arquiteto, e nenhum script daqui faz isso.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACOTE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAIZ = resolve(PACOTE, '..', '..')
const PROTOCOLO = join(RAIZ, 'packages', 'protocolo', 'src')

/** Todos os .js de uma pasta, recursivo. */
const arquivosJs = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? arquivosJs(p) : (p.endsWith('.js') ? [p] : [])
})

const dentro = (pai, filho) => filho === pai || filho.startsWith(pai + sep)
const comPonto = (r) => (r.startsWith('.') ? r : `./${r}`).split(sep).join('/')
// `from '...'`, `import '...'` e `import('...')`: o que um módulo deste repositório usa
const ESPECIFICADOR = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g

/**
 * Reescreve os imports de um arquivo que, na montagem, mora em `destino` e, no repositório, morava em `origem`.
 * `mapa(alvoNoRepositorio)` devolve onde o alvo mora na montagem, ou null se o alvo não pode ir para o pacote.
 */
export function reescreverImports(texto, origem, destino, mapa) {
  return texto.replace(ESPECIFICADOR, (tudo, antes, aspas, esp) => {
    const alvo = resolve(dirname(origem), esp)
    const novo = mapa(alvo)
    if (!novo) throw new Error(`import fora do pacote em ${relative(RAIZ, origem)}: ${esp}`)
    return `${antes}${aspas}${comPonto(relative(dirname(destino), novo))}${aspas}`
  })
}

export function empacotar({ destino = process.cwd() } = {}) {
  const montagem = mkdtempSync(join(tmpdir(), 'rn-cliente-pacote-'))
  try {
    const manifesto = JSON.parse(readFileSync(join(PACOTE, 'package.json'), 'utf8'))
    delete manifesto.private
    delete manifesto.scripts
    writeFileSync(join(montagem, 'package.json'), `${JSON.stringify(manifesto, null, 2)}\n`)
    for (const f of ['README.md', 'README.en.md', 'index.d.ts']) cpSync(join(PACOTE, f), join(montagem, f))
    cpSync(join(RAIZ, 'LICENSE'), join(montagem, 'LICENSE'))

    // onde cada arquivo do repositório mora na montagem
    const mapa = (alvo) => {
      if (dentro(PROTOCOLO, alvo)) return join(montagem, 'src', 'protocolo', relative(PROTOCOLO, alvo))
      if (dentro(join(PACOTE, 'src'), alvo) || dentro(join(PACOTE, 'bin'), alvo)) return join(montagem, relative(PACOTE, alvo))
      return null
    }
    const copiar = (origem) => {
      const destinoArq = mapa(origem)
      mkdirSync(dirname(destinoArq), { recursive: true })
      writeFileSync(destinoArq, reescreverImports(readFileSync(origem, 'utf8'), origem, destinoArq, mapa), { mode: statSync(origem).mode })
    }
    for (const f of [...arquivosJs(join(PACOTE, 'src')), ...arquivosJs(join(PACOTE, 'bin')), ...arquivosJs(PROTOCOLO)]) copiar(f)

    mkdirSync(destino, { recursive: true })
    const r = spawnSync('npm', ['pack', montagem, '--pack-destination', destino, '--json', '--ignore-scripts'], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`npm pack falhou: ${r.stderr}`)
    const [info] = JSON.parse(r.stdout)
    return { arquivo: join(destino, info.filename), arquivos: info.files.map((f) => f.path).sort(), nome: info.name, versao: info.version }
  } finally {
    rmSync(montagem, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--destino')
  const { arquivo } = empacotar({ destino: i >= 0 ? resolve(process.argv[i + 1]) : process.cwd() })
  console.log(arquivo)
}
