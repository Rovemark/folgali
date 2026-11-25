// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup e restauração do banco SQLite do relé.
//   - A cópia é feita pelo próprio SQLite (VACUUM INTO), que lê um instantâneo consistente enquanto o relé segue gravando.
//     Copiar o arquivo aberto (cp, rsync) pode pegar o banco e o WAL em momentos diferentes e gerar uma cópia que não abre.
//   - A cópia nasce com nome provisório, é conferida (integrity_check e as tabelas do relé) e só então ganha o nome final.
//   - Cada cópia leva um .sha256 ao lado; a restauração confere o hash antes de tocar em qualquer coisa.
//   - Rotação: guarda as N cópias mais novas e a mais nova de cada um dos últimos D dias (dias em UTC).
//   - Imagens (0.5.0): os bytes moram fora do SQLite, em <pasta de mídia>/<2 hex>/<hash>. Quando o banco tem a tabela `midia`, a cópia
//     leva a pasta `<backup>.midia/` com EXATAMENTE os arquivos que a tabela `midia` da cópia cita, cada um conferido pelo próprio nome
//     (o nome é o SHA-256 dos bytes), e um MANIFESTO.sha256 que o `sha256sum -c` entende. Arquivo que chegou depois do instantâneo não
//     entra (seria órfão); arquivo que sumiu ou não confere sai também da tabela da cópia (seria linha sem arquivo) e é contado.
// Nada aqui lê o conteúdo das tabelas além de contar linhas e ler os hashes da tabela `midia`.
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { caminhoDoHash } from './midia.js'

export const NOME_RE = /^rele-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite$/
const TABELAS_DO_RELE = ['rovers', 'objetos']
/** Sufixo da pasta de imagens de um backup: `rele-AAAAMMDD-HHMMSS.sqlite.midia`. */
export const SUFIXO_MIDIA = '.midia'
export const MANIFESTO = 'MANIFESTO.sha256'

const aspas = (s) => `'${s.replaceAll("'", "''")}'`
const dois = (n) => String(n).padStart(2, '0')

export const nomeDoBackup = (agora) =>
  `rele-${agora.getUTCFullYear()}${dois(agora.getUTCMonth() + 1)}${dois(agora.getUTCDate())}-${dois(agora.getUTCHours())}${dois(agora.getUTCMinutes())}${dois(agora.getUTCSeconds())}.sqlite`

/** Instante (em ms) que o nome diz, ou null se o nome não é de um backup nosso. */
export function instanteDoNome(nome) {
  const m = NOME_RE.exec(nome)
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  // Date.UTC "conserta" mês 13 ou dia 99 em vez de recusar: o nome só vale se a data volta igual
  return nomeDoBackup(new Date(t)) === nome ? t : null
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sha256DoArquivo = (caminho) => sha256(readFileSync(caminho))

/** Os hashes da tabela `midia` do banco, em ordem; `null` se o banco não tem a tabela (o recurso nunca foi ligado). */
export function hashesDeMidia(caminho) {
  const db = new DatabaseSync(caminho, { readOnly: true })
  try {
    if (!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'midia'").get()) return null
    return db.prepare('SELECT hash FROM midia ORDER BY hash').all().map((l) => l.hash)
  } finally {
    db.close()
  }
}

const linhaDoManifesto = (hash) => `${hash}  ${hash.slice(0, 2)}/${hash}`

/** Grava os bytes em <pasta>/<2 hex>/<hash> com as permissões do relé (pastas 0700, arquivos 0600). */
function gravarImagem(pasta, hash, bytes) {
  const destino = caminhoDoHash(pasta, hash)
  mkdirSync(dirname(destino), { recursive: true, mode: 0o700 })
  writeFileSync(destino, bytes, { mode: 0o600, flag: 'wx' })
}

/**
 * Confere a pasta de imagens de um backup contra a tabela `midia` do próprio backup: cada hash tem o arquivo, cada arquivo confere com
 * o nome, não há arquivo a mais e o manifesto lista exatamente o mesmo conjunto. Lança com o motivo; devolve quantos arquivos e bytes.
 */
export function conferirMidiaDoBackup(arquivo) {
  const hashes = hashesDeMidia(arquivo)
  const pasta = `${arquivo}${SUFIXO_MIDIA}`
  if (hashes === null) {
    if (existsSync(pasta)) throw new Error(`o backup tem a pasta ${basename(pasta)} mas o banco não tem a tabela de mídia: as duas metades não são do mesmo backup`)
    return null
  }
  if (!existsSync(pasta)) {
    if (hashes.length === 0) return { arquivos: 0, bytes: 0 }
    throw new Error(`o banco do backup cita ${hashes.length} imagens e a pasta ${basename(pasta)} não está ao lado dele`)
  }
  const esperados = new Set(hashes)
  let bytes = 0
  for (const hash of hashes) {
    const caminho = caminhoDoHash(pasta, hash)
    if (!existsSync(caminho)) throw new Error(`falta no backup a imagem ${hash}, que o banco do backup cita`)
    const conteudo = readFileSync(caminho)
    if (sha256(conteudo) !== hash) throw new Error(`a imagem ${hash} do backup não confere com o próprio hash: foi alterada ou está corrompida`)
    bytes += conteudo.length
  }
  for (const sub of readdirSync(pasta)) {
    if (sub === MANIFESTO) continue
    const dentro = join(pasta, sub)
    if (!/^[0-9a-f]{2}$/.test(sub) || !statSync(dentro).isDirectory()) throw new Error(`arquivo estranho na pasta de imagens do backup: ${sub}`)
    for (const nome of readdirSync(dentro)) {
      if (!esperados.has(nome) || nome.slice(0, 2) !== sub) throw new Error(`a pasta de imagens do backup tem um arquivo que o banco do backup não cita: ${sub}/${nome}`)
    }
  }
  const manifesto = existsSync(join(pasta, MANIFESTO)) ? readFileSync(join(pasta, MANIFESTO), 'utf8') : null
  if (manifesto !== hashes.map((h) => `${linhaDoManifesto(h)}\n`).join('')) throw new Error(`o ${MANIFESTO} do backup não lista as mesmas imagens que o banco do backup`)
  return { arquivos: hashes.length, bytes }
}

/** Abre o arquivo só para conferir. Devolve as contagens ou lança com o motivo. */
export function conferir(caminho, { tabelas = TABELAS_DO_RELE } = {}) {
  const db = new DatabaseSync(caminho, { readOnly: true })
  try {
    const ic = db.prepare('PRAGMA integrity_check').all()
    if (ic.length !== 1 || ic[0].integrity_check !== 'ok') throw new Error('o banco não passou no integrity_check do SQLite')
    const contagens = {}
    for (const t of tabelas) {
      const existe = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = :t").get({ t })
      if (!existe) throw new Error(`o banco não tem a tabela "${t}": não parece um banco do relé`)
      contagens[t] = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n)
    }
    return contagens
  } finally {
    db.close()
  }
}

/**
 * Cópia consistente do banco para `pasta`. O relé pode estar gravando.
 * Com a tabela `midia` no banco, copia também as imagens de `midiaDir` (padrão: `midia/` ao lado do banco, o mesmo do relé) para
 * `<backup>.midia/`. A cópia das imagens segue o INSTANTÂNEO do banco, não a pasta: entra só o que a tabela `midia` da cópia cita.
 * @returns {{ arquivo: string, caminho: string, bytes: number, sha256: string, contagens: object,
 *   midia: null | { arquivos: number, bytes: number, ausentes: number } }}
 */
export function fazerBackup({ banco, pasta, midiaDir = join(dirname(banco), 'midia'), agora = new Date() }) {
  if (!existsSync(banco)) throw new Error(`banco não encontrado: ${banco}`)
  mkdirSync(pasta, { recursive: true, mode: 0o700 })
  const arquivo = nomeDoBackup(agora)
  const final = join(pasta, arquivo)
  if (existsSync(final)) throw new Error(`já existe um backup deste segundo: ${arquivo}`)
  const parcial = `${final}.parcial`
  const midiaParcial = `${final}${SUFIXO_MIDIA}.parcial`
  rmSync(parcial, { force: true })
  rmSync(midiaParcial, { recursive: true, force: true })
  const db = new DatabaseSync(banco)
  try {
    db.exec('PRAGMA busy_timeout = 30000')
    db.exec(`VACUUM INTO ${aspas(parcial)}`)
  } finally {
    db.close()
  }
  try {
    conferir(parcial)
    const midia = copiarMidia(parcial, midiaDir, midiaParcial)
    const contagens = conferir(parcial)
    chmodSync(parcial, 0o600)
    const hash = sha256DoArquivo(parcial)
    writeFileSync(`${final}.sha256`, `${hash}  ${arquivo}\n`, { mode: 0o600 })
    // a pasta de imagens ganha o nome final ANTES do banco: uma queda entre os dois deixa uma pasta sem banco (a rotação a apaga),
    // nunca um banco que cita imagens sem a pasta delas
    if (midia) renameSync(midiaParcial, `${final}${SUFIXO_MIDIA}`)
    renameSync(parcial, final)
    return { arquivo, caminho: final, bytes: statSync(final).size, sha256: hash, contagens, midia }
  } catch (e) {
    rmSync(parcial, { force: true })
    rmSync(midiaParcial, { recursive: true, force: true })
    rmSync(`${final}${SUFIXO_MIDIA}`, { recursive: true, force: true })
    rmSync(`${final}.sha256`, { force: true })
    throw e
  }
}

/**
 * Copia para `destino` as imagens que a tabela `midia` da cópia `parcial` cita, conferindo cada uma pelo hash. A que sumiu da pasta
 * do relé (ou não confere) sai da tabela da cópia, para o backup não guardar linha sem arquivo. `null` se não há tabela de mídia.
 */
function copiarMidia(parcial, midiaDir, destino) {
  const hashes = hashesDeMidia(parcial)
  if (hashes === null) return null
  if (hashes.length > 0 && !existsSync(midiaDir)) {
    throw new Error(`o banco cita ${hashes.length} imagens e a pasta de mídia ${midiaDir} não existe: confira RELE_MIDIA_DIR`)
  }
  mkdirSync(destino, { mode: 0o700 }) // a pasta do backup já existe e o `.parcial` acabou de ser apagado
  const copiados = []
  const ausentes = []
  let bytes = 0
  for (const hash of hashes) {
    const origem = caminhoDoHash(midiaDir, hash)
    const conteudo = existsSync(origem) ? readFileSync(origem) : null
    if (!conteudo || sha256(conteudo) !== hash) { ausentes.push(hash); continue }
    gravarImagem(destino, hash, conteudo)
    copiados.push(hash)
    bytes += conteudo.length
  }
  if (ausentes.length) {
    const db = new DatabaseSync(parcial)
    try {
      const apagar = db.prepare('DELETE FROM midia WHERE hash = :hash')
      for (const hash of ausentes) apagar.run({ hash })
    } finally {
      db.close()
    }
  }
  writeFileSync(join(destino, MANIFESTO), copiados.map((h) => `${linhaDoManifesto(h)}\n`).join(''), { mode: 0o600 })
  return { arquivos: copiados.length, bytes, ausentes: ausentes.length }
}

/** Nomes de backup (ordem do mais novo ao mais velho). Ignora tudo que não é backup nosso. */
export function listarBackups(pasta) {
  if (!existsSync(pasta)) return []
  return readdirSync(pasta).filter((n) => instanteDoNome(n) !== null).sort().reverse()
}

/**
 * Quais backups apagar. Fica: os `ultimos` mais novos e, de cada um dos últimos `dias` dias (UTC), o mais novo do dia.
 * @param {string[]} nomes
 * @param {{ agora: Date, ultimos?: number, dias?: number }} o
 */
export function escolherParaApagar(nomes, { agora, ultimos = 12, dias = 14 }) {
  const validos = nomes.filter((n) => instanteDoNome(n) !== null).sort().reverse()
  const guardar = new Set(validos.slice(0, ultimos))
  const limite = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()) - (dias - 1) * 86_400_000
  const vistos = new Set()
  for (const n of validos) {
    const t = instanteDoNome(n)
    const dia = Math.floor(t / 86_400_000)
    if (t >= limite && !vistos.has(dia)) { vistos.add(dia); guardar.add(n) }
  }
  return validos.filter((n) => !guardar.has(n))
}

export function rotacionar({ pasta, agora = new Date(), ultimos = 12, dias = 14 }) {
  const apagar = escolherParaApagar(listarBackups(pasta), { agora, ultimos, dias })
  for (const n of apagar) {
    rmSync(join(pasta, n), { force: true })
    rmSync(join(pasta, `${n}.sha256`), { force: true })
    rmSync(join(pasta, `${n}${SUFIXO_MIDIA}`), { recursive: true, force: true })
  }
  // sobra de uma cópia que morreu no meio (o banco ou a pasta de imagens `.parcial`, ou a pasta de imagens que ganhou o nome final
  // sem o banco): some depois de um dia. Só o que tem nome de backup nosso.
  const velho = (n) => agora.getTime() - statSync(join(pasta, n)).mtimeMs > 86_400_000
  for (const n of existsSync(pasta) ? readdirSync(pasta) : []) {
    const parcial = n.endsWith('.parcial') && instanteDoNome(n.slice(0, -'.parcial'.length).replace(/\.midia$/, '')) !== null
    const pastaSemBanco = n.endsWith(SUFIXO_MIDIA) && instanteDoNome(n.slice(0, -SUFIXO_MIDIA.length)) !== null && !existsSync(join(pasta, n.slice(0, -SUFIXO_MIDIA.length)))
    if ((parcial || pastaSemBanco) && velho(n)) rmSync(join(pasta, n), { recursive: true, force: true })
  }
  return apagar
}

/**
 * Restaura `arquivo` em `destino`. O relé PRECISA estar parado: duas pontas escrevendo no mesmo SQLite estragam o banco.
 * Se já existe um banco em `destino` (ou a pasta de imagens em `midiaDir`), só segue com `forcar`, e o que estava lá (o banco com o
 * WAL e o SHM, e a pasta de imagens) vai para `<nome>.antes-de-restaurar-<instante>`.
 * Imagens: tudo é conferido ANTES de tocar em qualquer coisa (o hash do banco, o integrity_check, cada imagem pelo próprio hash, nada a
 * mais nem a menos que a tabela `midia` do backup cita). Backup antigo, sem a pasta `.midia`, de um banco que cita imagens: recusa,
 * a menos que `aceitarSemMidia` (a leitura dessas imagens responde 404 e a limpeza do relé apaga as linhas sem arquivo).
 */
export function restaurar({ arquivo, destino, midiaDir = join(dirname(destino), 'midia'), forcar = false, aceitarSemMidia = false, agora = new Date() }) {
  if (!existsSync(arquivo)) throw new Error(`backup não encontrado: ${arquivo}`)
  const selo = `${arquivo}.sha256`
  if (existsSync(selo)) {
    const esperado = readFileSync(selo, 'utf8').trim().split(/\s+/)[0]
    if (esperado !== sha256DoArquivo(arquivo)) throw new Error('o hash do backup não confere com o .sha256: o arquivo foi alterado ou está corrompido')
  }
  conferir(arquivo)
  let midia
  try {
    midia = conferirMidiaDoBackup(arquivo)
  } catch (e) {
    if (!(aceitarSemMidia && !existsSync(`${arquivo}${SUFIXO_MIDIA}`))) throw e
    midia = null
  }
  const guardados = []
  const ocupados = [`${destino}`, `${destino}-wal`, `${destino}-shm`, midiaDir].filter((c) => existsSync(c))
  if (ocupados.length) {
    if (!forcar) throw new Error(`já existe um banco em ${destino} (ou a pasta de imagens ${midiaDir}). Use --forcar para guardá-los de lado e restaurar.`)
    const sufixo = `.antes-de-restaurar-${agora.getTime()}`
    for (const extra of ['', '-wal', '-shm']) {
      if (existsSync(`${destino}${extra}`)) { renameSync(`${destino}${extra}`, `${destino}${sufixo}${extra}`); guardados.push(basename(`${destino}${sufixo}${extra}`)) }
    }
    if (existsSync(midiaDir)) { renameSync(midiaDir, `${midiaDir}${sufixo}`); guardados.push(basename(`${midiaDir}${sufixo}`)) }
  }
  mkdirSync(dirname(destino), { recursive: true, mode: 0o700 })
  if (midia) {
    // a pasta nasce com outro nome e só ganha o definitivo inteira: o relé nunca sobe olhando uma pasta pela metade
    const parcialDaMidia = `${midiaDir}.parcial`
    rmSync(parcialDaMidia, { recursive: true, force: true })
    mkdirSync(parcialDaMidia, { recursive: true, mode: 0o700 })
    const origem = `${arquivo}${SUFIXO_MIDIA}`
    for (const hash of hashesDeMidia(arquivo)) gravarImagem(parcialDaMidia, hash, readFileSync(caminhoDoHash(origem, hash)))
    renameSync(parcialDaMidia, midiaDir)
  }
  const parcial = `${destino}.parcial`
  copyFileSync(arquivo, parcial)
  chmodSync(parcial, 0o600)
  renameSync(parcial, destino)
  const contagens = conferir(destino)
  return { destino, contagens, guardados, midia }
}
