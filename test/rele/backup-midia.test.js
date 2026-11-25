// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup e restauração com as imagens da 0.5.0. Os bytes moram fora do SQLite; o backup leva a pasta `<backup>.midia/` com exatamente o
// que a tabela `midia` da cópia cita, cada arquivo conferido pelo próprio hash. O que se prova: a ida e a volta devolvem as mesmas
// imagens byte a byte num relé novo; arquivo que chegou depois do instantâneo não entra (seria órfão); arquivo que sumiu ou não confere
// sai também da tabela da cópia (seria linha sem arquivo); a restauração confere tudo antes de tocar em qualquer coisa.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Armazem } from '../../packages/rele/src/armazem.js'
import { Rele } from '../../packages/rele/src/rele.js'
import { ProvedorDeTeste } from '../../packages/rele/src/provedor-de-teste.js'
import { MANIFESTO, conferirMidiaDoBackup, fazerBackup, hashesDeMidia, listarBackups, restaurar, rotacionar } from '../../packages/rele/src/backup.js'
import { corpoDeImagem, limparImagem } from '../../packages/protocolo/src/index.js'
import { AGORA } from '../ajuda/mundo.js'
import { enviar, pngSintetico, publicarImagem } from '../ajuda/midia.js'
import { publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const pasta = () => mkdtempSync(join(tmpdir(), 'rn-backup-midia-'))
const limpar = (p) => rmSync(p, { recursive: true, force: true })
const BIN = (nome) => new URL(`../../packages/rele/bin/${nome}`, import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']
const sha = (b) => createHash('sha256').update(b).digest('hex')
const codigoDe = (f) => { try { f(); return null } catch (e) { return e.codigo ?? e.message } }

/** Um relé de verdade sobre arquivo (SQLite em WAL) com a mídia ligada em `<dir>/midia`. Rovers nascem adultos, como no resto da suíte. */
function releComMidia(dir, { provedor = new ProvedorDeTeste(), midiaDir = join(dir, 'midia') } = {}) {
  const relogio = { agora: AGORA }
  const armazem = new Armazem(join(dir, 'rele.sqlite'))
  armazem.db.exec('CREATE TRIGGER IF NOT EXISTS contas_adultas AFTER INSERT ON rovers BEGIN UPDATE rovers SET criado_em = criado_em - 2592000 WHERE uid = NEW.uid; END')
  const rele = new Rele({ armazem, provedor, relogio: () => relogio.agora, segredoDeDenuncias: randomBytes(32), midia: { dir: midiaDir } })
  return { provedor, relogio, armazem, rele, novatos: false, avancar: (s) => { relogio.agora += s }, banco: join(dir, 'rele.sqlite'), midiaDir }
}

/** Um rover com retrato, uma postagem com duas imagens, e um envio ainda não publicado (pendente). */
function povoar(m) {
  const a = roverRegistrado(m)
  const retrato = publicarImagem(m, a, pngSintetico({ semente: 1 }))
  assert.equal(retrato.estado, 'aceito')
  const post = publicar(m, a, 'postagem', { texto: 'Duas imagens do quadro.', topicos: ['teste'] })
  for (const [ordem, semente] of [[0, 2], [1, 3]]) assert.equal(publicarImagem(m, a, pngSintetico({ semente }), { alvo: post.objeto.id, ordem }).estado, 'aceito')
  const pendente = enviar(m, a, pngSintetico({ semente: 4 })).limpa.hash
  const imagens = m.rele.midia.imagensDaPostagem(post.objeto.id, m.relogio.agora)
  return { a, post, imagens, pendente, retratoHash: m.rele.midia.extraDoPerfil(a.uid, m.relogio.agora).retratoImagem.hash }
}

/** Fecha o relé e apaga banco e imagens, como numa perda do volume. */
function perderTudo(m) {
  m.armazem.fechar()
  for (const extra of ['', '-wal', '-shm']) rmSync(`${m.banco}${extra}`, { force: true })
  limpar(m.midiaDir)
}

test('ida e volta: o backup leva as imagens; restaurado num relé novo, serve os mesmos bytes, o mesmo retrato e os mesmos anexos', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    const p = povoar(m)
    const original = {
      perfil: m.rele.perfil(p.a.uid),
      postagem: m.rele.midia.imagensDaPostagem(p.post.objeto.id, m.relogio.agora),
      bytes: Object.fromEntries([p.retratoHash, ...p.imagens.map((i) => i.hash)].map((h) => [h, m.rele.midia.ler(h).bytes]))
    }
    assert.equal(Object.keys(original.bytes).length, 3)
    const b = fazerBackup({ banco: m.banco, pasta: join(dir, 'b'), agora: new Date('2026-11-17T12:00:00Z') })
    assert.deepEqual(b.midia, { arquivos: 4, bytes: b.midia.bytes, ausentes: 0 }, 'três publicadas e o envio pendente, que o banco também cita')
    const pastaDoBackup = `${b.caminho}.midia`
    // forma: <2 hex>/<hash>, arquivos 0600, pastas 0700, manifesto no formato do sha256sum
    assert.equal(statSync(pastaDoBackup).mode & 0o777, 0o700)
    const hashes = hashesDeMidia(b.caminho)
    assert.equal(hashes.length, 4)
    assert.ok(hashes.includes(p.pendente))
    let bytes = 0
    for (const h of hashes) {
      const arq = join(pastaDoBackup, h.slice(0, 2), h)
      assert.equal(statSync(arq).mode & 0o777, 0o600)
      assert.equal(statSync(join(pastaDoBackup, h.slice(0, 2))).mode & 0o777, 0o700)
      assert.equal(sha(readFileSync(arq)), h)
      bytes += statSync(arq).size
    }
    assert.equal(b.midia.bytes, bytes)
    assert.equal(readFileSync(join(pastaDoBackup, MANIFESTO), 'utf8'), hashes.map((h) => `${h}  ${h.slice(0, 2)}/${h}\n`).join(''))
    assert.deepEqual(conferirMidiaDoBackup(b.caminho), { arquivos: 4, bytes })
    // o manifesto é o do sha256sum: a ferramenta do sistema confere a pasta sozinha (macOS: shasum; Linux e o contêiner: sha256sum)
    const ferramenta = spawnSync('sha256sum', ['--version']).status === 0 ? ['sha256sum', ['-c', MANIFESTO]] : ['shasum', ['-a', '256', '-c', MANIFESTO]]
    const conferido = spawnSync(ferramenta[0], ferramenta[1], { cwd: pastaDoBackup, encoding: 'utf8' })
    if (conferido.error) test.diagnostic?.(`sem ${ferramenta[0]} na máquina; conferência pelo sistema não rodou`)
    else assert.equal(conferido.status, 0, conferido.stdout + conferido.stderr)

    perderTudo(m)
    const r = restaurar({ arquivo: b.caminho, destino: m.banco })
    assert.deepEqual(r.midia, { arquivos: 4, bytes })
    assert.deepEqual(r.guardados, [])
    assert.equal(statSync(m.midiaDir).mode & 0o777, 0o700)
    for (const h of hashes) assert.equal(statSync(join(m.midiaDir, h.slice(0, 2), h)).mode & 0o777, 0o600)
    assert.ok(!existsSync(`${m.midiaDir}.parcial`))
    const novo = releComMidia(dir, { provedor: m.provedor })
    assert.deepEqual(novo.rele.perfil(p.a.uid), original.perfil)
    assert.deepEqual(novo.rele.midia.imagensDaPostagem(p.post.objeto.id, novo.relogio.agora), original.postagem)
    for (const [h, bytesOriginais] of Object.entries(original.bytes)) assert.ok(novo.rele.midia.ler(h).bytes.equals(bytesOriginais), h)
    // o envio pendente voltou também: ainda pode ser publicado na janela de uma hora
    const limpaPendente = limparImagem(pngSintetico({ semente: 4 }))
    assert.equal(limpaPendente.hash, p.pendente)
    assert.equal(publicar(novo, p.a, 'imagem', corpoDeImagem(limpaPendente, { uso: 'retrato', alvo: null, ordem: null, alt: 'Outro quadrado.' })).estado, 'aceito')
    // banco e pasta restaurados batem: cada linha de `midia` tem o arquivo e cada arquivo tem a linha (sem órfão, sem linha sem arquivo)
    const noDisco = readdirSync(m.midiaDir, { recursive: true }).filter((f) => /[0-9a-f]{64}$/.test(f)).map((f) => f.slice(-64)).sort()
    assert.deepEqual(noDisco, hashesDeMidia(m.banco))
    novo.armazem.fechar()
  } finally { limpar(dir) }
})

test('o backup segue o instantâneo do banco: arquivo sem linha não entra; linha cujo arquivo sumiu ou não confere sai da cópia', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    const p = povoar(m)
    // 1. arquivo na pasta que o banco não cita (chegou depois do instantâneo, ou sobra): não pode virar órfão no backup
    const intruso = pngSintetico({ semente: 9 })
    const hIntruso = sha(intruso)
    mkdirSync(join(m.midiaDir, hIntruso.slice(0, 2)), { recursive: true })
    writeFileSync(join(m.midiaDir, hIntruso.slice(0, 2), hIntruso), intruso)
    // 2. arquivo que o banco cita e sumiu (apagado depois do instantâneo, ou perdido)
    const [sumiu, estragou] = p.imagens.map((i) => i.hash)
    rmSync(join(m.midiaDir, sumiu.slice(0, 2), sumiu))
    // 3. arquivo que o banco cita e não confere com o hash (disco estragado): não vai para o backup como se fosse bom
    writeFileSync(join(m.midiaDir, estragou.slice(0, 2), estragou), Buffer.from('nao e mais a imagem'))
    const b = fazerBackup({ banco: m.banco, pasta: join(dir, 'b') })
    assert.equal(b.midia.ausentes, 2)
    assert.equal(b.midia.arquivos, 2, 'o retrato e o pendente')
    const noBackup = hashesDeMidia(b.caminho)
    assert.deepEqual(noBackup.sort(), [p.retratoHash, p.pendente].sort())
    assert.ok(!existsSync(join(`${b.caminho}.midia`, hIntruso.slice(0, 2), hIntruso)), 'o intruso não entrou')
    assert.ok(!existsSync(join(`${b.caminho}.midia`, sumiu.slice(0, 2), sumiu)))
    assert.ok(!existsSync(join(`${b.caminho}.midia`, estragou.slice(0, 2), estragou)))
    assert.deepEqual(conferirMidiaDoBackup(b.caminho).arquivos, 2)
    // o .sha256 cobre o banco DEPOIS de tirar as linhas: a restauração confere e aceita
    assert.equal(readFileSync(`${b.caminho}.sha256`, 'utf8').split(' ')[0], b.sha256)
    assert.equal(sha(readFileSync(b.caminho)), b.sha256)
    // o banco do relé não foi tocado pelo backup: ele ainda cita as quatro
    assert.equal(hashesDeMidia(m.banco).length, 4)
    perderTudo(m)
    restaurar({ arquivo: b.caminho, destino: m.banco })
    const novo = releComMidia(dir, { provedor: m.provedor })
    assert.ok(novo.rele.midia.ler(p.retratoHash).bytes.length > 0)
    assert.equal(codigoDe(() => novo.rele.midia.ler(sumiu)), 'nao_encontrado', 'o objeto `imagem` segue na cadeia, sem arquivo: 404, como no relé de antes')
    assert.equal(codigoDe(() => novo.rele.midia.ler(estragou)), 'nao_encontrado')
    novo.armazem.fechar()
  } finally { limpar(dir) }
})

test('relé sem o recurso de imagens: o backup não cria pasta de mídia e a restauração não cria uma', () => {
  const dir = pasta()
  try {
    const relogio = { agora: AGORA }
    const armazem = new Armazem(join(dir, 'rele.sqlite'))
    const rele = new Rele({ armazem, provedor: new ProvedorDeTeste(), relogio: () => relogio.agora, segredoDeDenuncias: randomBytes(32) })
    roverRegistrado({ relogio, armazem, rele, provedor: rele.provedor, novatos: true })
    const b = fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b') })
    assert.equal(b.midia, null)
    assert.ok(!existsSync(`${b.caminho}.midia`))
    assert.equal(conferirMidiaDoBackup(b.caminho), null)
    armazem.fechar()
    const r = restaurar({ arquivo: b.caminho, destino: join(dir, 'novo', 'rele.sqlite') })
    assert.equal(r.midia, null)
    assert.ok(!existsSync(join(dir, 'novo', 'midia')))
  } finally { limpar(dir) }
})

test('relé com a tabela de mídia e nenhuma imagem: pasta vazia com manifesto vazio, e a restauração aceita mesmo sem a pasta', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    roverRegistrado(m)
    const b = fazerBackup({ banco: m.banco, pasta: join(dir, 'b') })
    assert.deepEqual(b.midia, { arquivos: 0, bytes: 0, ausentes: 0 })
    assert.deepEqual(readdirSync(`${b.caminho}.midia`), [MANIFESTO])
    assert.equal(readFileSync(join(`${b.caminho}.midia`, MANIFESTO), 'utf8'), '')
    limpar(`${b.caminho}.midia`)
    assert.deepEqual(conferirMidiaDoBackup(b.caminho), { arquivos: 0, bytes: 0 })
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('restaurar confere as imagens antes de tocar em qualquer coisa e recusa backup adulterado, incompleto ou misturado', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    const p = povoar(m)
    const b = fazerBackup({ banco: m.banco, pasta: join(dir, 'b') })
    m.armazem.fechar()
    const pm = `${b.caminho}.midia`
    const [h] = p.imagens.map((i) => i.hash)
    const arq = join(pm, h.slice(0, 2), h)
    const original = readFileSync(arq)
    const destino = join(dir, 'restaurado', 'rele.sqlite')
    const recusa = (re, msg) => {
      assert.throws(() => restaurar({ arquivo: b.caminho, destino }), re, msg)
      assert.ok(!existsSync(destino) && !existsSync(join(dir, 'restaurado', 'midia')), `${msg}: nada foi criado no destino`)
    }
    // 1. um byte mudado numa imagem
    const mudado = Buffer.from(original); mudado[mudado.length - 5] ^= 0xff
    writeFileSync(arq, mudado); recusa(/não confere com o próprio hash/, 'adulterada')
    // 2. imagem apagada do backup
    rmSync(arq); recusa(/falta no backup a imagem/, 'apagada')
    writeFileSync(arq, original)
    // 3. arquivo a mais (mesmo um válido): não é do instantâneo
    const extra = pngSintetico({ semente: 77 }); const he = sha(extra)
    mkdirSync(join(pm, he.slice(0, 2)), { recursive: true }); writeFileSync(join(pm, he.slice(0, 2), he), extra)
    recusa(/não cita/, 'a mais')
    rmSync(join(pm, he.slice(0, 2), he))
    // 4. arquivo do lugar certo na subpasta errada
    const errada = h.slice(0, 2) === 'ff' ? 'fe' : 'ff'
    mkdirSync(join(pm, errada), { recursive: true }); writeFileSync(join(pm, errada, h), original)
    recusa(/não cita/, 'subpasta errada')
    limpar(join(pm, errada))
    // 5. lixo na raiz da pasta
    writeFileSync(join(pm, 'LEIAME.txt'), 'x'); recusa(/arquivo estranho/, 'lixo'); rmSync(join(pm, 'LEIAME.txt'))
    // 6. manifesto alterado ou ausente
    const manifesto = readFileSync(join(pm, MANIFESTO), 'utf8')
    writeFileSync(join(pm, MANIFESTO), manifesto.split('\n').slice(1).join('\n')); recusa(/MANIFESTO/, 'manifesto sem uma linha')
    rmSync(join(pm, MANIFESTO)); recusa(/MANIFESTO/, 'sem manifesto')
    writeFileSync(join(pm, MANIFESTO), manifesto)
    // 7. a pasta inteira some (backup antigo ou copiado pela metade): recusa, e `aceitarSemMidia` é a saída consciente
    const guardada = join(dir, 'guardada'); spawnSync('mv', [pm, guardada])
    recusa(/cita 4 imagens e a pasta .*\.midia não está ao lado/, 'sem a pasta')
    const semMidia = restaurar({ arquivo: b.caminho, destino, aceitarSemMidia: true })
    assert.equal(semMidia.midia, null)
    assert.ok(!existsSync(join(dir, 'restaurado', 'midia')), 'sem pasta para criar')
    limpar(join(dir, 'restaurado'))
    spawnSync('mv', [guardada, pm])
    // `aceitarSemMidia` não engole defeito de uma pasta que está lá
    rmSync(arq)
    assert.throws(() => restaurar({ arquivo: b.caminho, destino, aceitarSemMidia: true }), /falta no backup/)
    writeFileSync(arq, original)
    // 8. a pasta de imagens ao lado de um banco que nem tem a tabela: as duas metades não são do mesmo backup
    const semTabela = join(dir, 'b', 'rele-20200101-000000.sqlite')
    const db = new DatabaseSync(semTabela); db.exec('CREATE TABLE rovers (x); CREATE TABLE objetos (y)'); db.close()
    mkdirSync(`${semTabela}.midia`)
    assert.throws(() => restaurar({ arquivo: semTabela, destino }), /não são do mesmo backup/)
    // e com tudo de volta no lugar, restaura
    assert.equal(restaurar({ arquivo: b.caminho, destino }).midia.arquivos, 4)
  } finally { limpar(dir) }
})

test('restaurar sobre uma pasta de imagens existente: sem --forcar recusa (mesmo sem banco); com --forcar a guarda de lado', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    const p = povoar(m)
    const b = fazerBackup({ banco: m.banco, pasta: join(dir, 'b') })
    m.armazem.fechar()
    for (const extra of ['', '-wal', '-shm']) rmSync(`${m.banco}${extra}`, { force: true })
    // só a pasta de imagens ficou: restaurar por cima juntaria imagens de dois momentos
    writeFileSync(join(m.midiaDir, 'marca-do-antigo'), 'x')
    assert.throws(() => restaurar({ arquivo: b.caminho, destino: m.banco }), /pasta de imagens/)
    assert.ok(existsSync(join(m.midiaDir, 'marca-do-antigo')) && !existsSync(m.banco), 'a recusa não tocou em nada')
    const r = restaurar({ arquivo: b.caminho, destino: m.banco, forcar: true, agora: new Date(1_800_000_000_000) })
    assert.deepEqual(r.guardados, ['midia.antes-de-restaurar-1800000000000'])
    assert.ok(existsSync(join(dir, 'midia.antes-de-restaurar-1800000000000', 'marca-do-antigo')), 'a pasta antiga foi de lado, inteira')
    assert.ok(!existsSync(join(m.midiaDir, 'marca-do-antigo')), 'a pasta nova é só a do backup')
    assert.equal(r.midia.arquivos, 4)
    assert.ok(existsSync(join(m.midiaDir, p.retratoHash.slice(0, 2), p.retratoHash)))
    // pasta de imagens em outro lugar (RELE_MIDIA_DIR): vai para onde se pede
    const outra = join(dir, 'outro-disco', 'imagens')
    const r2 = restaurar({ arquivo: b.caminho, destino: join(dir, 'outro.sqlite'), midiaDir: outra })
    assert.equal(r2.midia.arquivos, 4)
    assert.ok(existsSync(join(outra, p.retratoHash.slice(0, 2), p.retratoHash)))
  } finally { limpar(dir) }
})

test('fazerBackup recusa quando o banco cita imagens e a pasta de mídia não existe, e não deixa sobra', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    povoar(m)
    assert.throws(() => fazerBackup({ banco: m.banco, pasta: join(dir, 'b'), midiaDir: join(dir, 'pasta-errada') }), /cita 4 imagens e a pasta de mídia .*pasta-errada não existe/)
    assert.deepEqual(readdirSync(join(dir, 'b')), [], 'nem banco, nem .sha256, nem pasta de imagens')
    // com a pasta certa, por parâmetro, funciona
    assert.equal(fazerBackup({ banco: m.banco, pasta: join(dir, 'b'), midiaDir: m.midiaDir }).midia.arquivos, 4)
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('rotação apaga a pasta de imagens junto do backup, e as sobras de uma cópia que morreu no meio depois de um dia', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    povoar(m)
    const b = join(dir, 'b')
    const hoje = new Date('2026-11-17T12:00:00Z')
    for (let i = 0; i < 3; i++) fazerBackup({ banco: m.banco, pasta: b, agora: new Date(Date.UTC(2026, 10, 15 + i, 6)) })
    const ontem = new Date(hoje.getTime() - 86_400_000 - 1000)
    const recente = new Date(hoje.getTime() - 3_600_000)
    const plantar = (nome, quando, comoPasta = true) => {
      const c = join(b, nome)
      if (comoPasta) { mkdirSync(join(c, 'ab'), { recursive: true }); writeFileSync(join(c, 'ab', 'x'), 'x') } else writeFileSync(c, 'x')
      utimesSync(c, quando, quando)
      return c
    }
    const parcialVelho = plantar('rele-20261110-060000.sqlite.midia.parcial', ontem)
    const parcialNovo = plantar('rele-20261117-110000.sqlite.midia.parcial', recente)
    const semBancoVelha = plantar('rele-20261110-070000.sqlite.midia', ontem)
    const semBancoNova = plantar('rele-20261117-100000.sqlite.midia', recente)
    const alheia = plantar('fotos-da-festa.midia', ontem)
    const alheioParcial = plantar('rascunho.parcial', ontem, false)
    const apagados = rotacionar({ pasta: b, agora: hoje, ultimos: 1, dias: 1 })
    assert.equal(apagados.length, 2)
    assert.deepEqual(listarBackups(b), ['rele-20261117-060000.sqlite'])
    for (const n of apagados) assert.ok(!existsSync(join(b, `${n}.midia`)), `${n}.midia saiu junto`)
    assert.ok(existsSync(join(b, 'rele-20261117-060000.sqlite.midia')), 'a do backup que fica, fica')
    assert.ok(!existsSync(parcialVelho), '.midia.parcial de mais de um dia é sobra')
    assert.ok(existsSync(parcialNovo), '.midia.parcial de uma hora pode ser uma cópia em andamento')
    assert.ok(!existsSync(semBancoVelha), 'pasta de imagens sem banco, de mais de um dia, é sobra de queda entre os dois renomes')
    assert.ok(existsSync(semBancoNova), 'a recente pode ser o backup em andamento, entre os dois renomes')
    assert.ok(existsSync(alheia) && existsSync(alheioParcial), 'nome que não é de backup nosso nunca é tocado')
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('os executáveis: backup.js leva as imagens (RELE_MIDIA_DIR) e avisa as ausentes; restaurar.js põe as imagens em --midia', () => {
  const dir = pasta()
  try {
    const midiaDir = join(dir, 'imagens-em-outro-lugar')
    const m = releComMidia(dir, { midiaDir })
    const p = povoar(m)
    m.armazem.fechar()
    const env = { PATH: process.env.PATH, RELE_BANCO: m.banco, RELE_BACKUP_PASTA: join(dir, 'b'), RELE_MIDIA_DIR: midiaDir }
    const rodar = (bin, args = [], extra = {}) => spawnSync(process.execPath, [...NODE, BIN(bin), ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000 })
    const r1 = rodar('backup.js')
    assert.equal(r1.status, 0, r1.stderr)
    const j = JSON.parse(r1.stdout)
    assert.equal(j.imagens, 4)
    assert.equal(j.imagensAusentes, 0)
    assert.ok(j.bytesDeImagens > 0)
    assert.equal(r1.stderr, '', 'sem aviso quando nada falta')
    assert.ok(!r1.stdout.includes(p.retratoHash), 'a saída não carrega hash de imagem')
    // sem RELE_MIDIA_DIR o padrão é midia/ ao lado do banco, que aqui não existe: falha clara, código 1
    const r2 = rodar('backup.js', [], { RELE_MIDIA_DIR: '', RELE_BACKUP_PASTA: join(dir, 'b2') })
    assert.equal(r2.status, 1)
    assert.match(r2.stderr, /pasta de mídia .* não existe/)
    // uma imagem some da pasta: o backup sai, com o aviso à parte
    const [h] = p.imagens.map((i) => i.hash)
    rmSync(join(midiaDir, h.slice(0, 2), h))
    const r3 = rodar('backup.js', [], { RELE_BACKUP_PASTA: join(dir, 'b3') })
    assert.equal(r3.status, 0, r3.stderr)
    assert.equal(JSON.parse(r3.stdout).imagensAusentes, 1)
    assert.equal(JSON.parse(r3.stderr).evento, 'backup_imagens_ausentes')
    // restaurar o primeiro em outro lugar, com --midia
    const destino = join(dir, 'r', 'rele.sqlite')
    const r4 = rodar('restaurar.js', [j.arquivo, '--destino', destino, '--midia', join(dir, 'r', 'fotos')])
    assert.equal(r4.status, 0, r4.stderr)
    assert.equal(JSON.parse(r4.stdout).imagens, 4)
    assert.ok(existsSync(join(dir, 'r', 'fotos', h.slice(0, 2), h)))
    // sem --midia: RELE_MIDIA_DIR; sem as duas, midia/ ao lado do destino
    const r5 = rodar('restaurar.js', [j.arquivo, '--destino', join(dir, 'r2', 'rele.sqlite')], { RELE_MIDIA_DIR: '' })
    assert.equal(r5.status, 0, r5.stderr)
    assert.ok(existsSync(join(dir, 'r2', 'midia', h.slice(0, 2), h)))
    // backup sem a pasta de imagens: recusa; --sem-midia aceita
    limpar(join(dir, 'b', `${j.arquivo}.midia`))
    const r6 = rodar('restaurar.js', [j.arquivo, '--destino', join(dir, 'r3', 'rele.sqlite')], { RELE_MIDIA_DIR: '' })
    assert.equal(r6.status, 1)
    assert.match(r6.stderr, /não está ao lado/)
    const r7 = rodar('restaurar.js', [j.arquivo, '--destino', join(dir, 'r3', 'rele.sqlite'), '--sem-midia'], { RELE_MIDIA_DIR: '' })
    assert.equal(r7.status, 0, r7.stderr)
    assert.equal(JSON.parse(r7.stdout).imagens, undefined)
    // --midia sem valor: uso errado
    assert.equal(rodar('restaurar.js', [j.arquivo, '--destino', join(dir, 'r4.sqlite'), '--midia']).status, 2)
  } finally { limpar(dir) }
})

// ---- bordas que o medidor de mutação mostrou sem teste ----

test('duas imagens com o mesmo prefixo de 2 hex caem na mesma subpasta, no backup e na restauração', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    const a = roverRegistrado(m)
    const post = publicar(m, a, 'postagem', { texto: 'Prefixo repetido.', topicos: ['teste'] })
    // procura duas imagens cujo hash começa igual (determinístico: as sementes são fixas)
    const porPrefixo = new Map()
    let par = null
    for (let semente = 10; !par; semente++) {
      const h = limparImagem(pngSintetico({ semente, largura: 4 + (semente % 7), altura: 4 + Math.floor(semente / 7) % 7 })).hash
      if (porPrefixo.has(h.slice(0, 2))) par = [porPrefixo.get(h.slice(0, 2)), semente]
      else porPrefixo.set(h.slice(0, 2), semente)
    }
    const bytesDe = (semente) => pngSintetico({ semente, largura: 4 + (semente % 7), altura: 4 + Math.floor(semente / 7) % 7 })
    par.forEach((semente, ordem) => assert.equal(publicarImagem(m, a, bytesDe(semente), { alvo: post.objeto.id, ordem }).estado, 'aceito'))
    const hashes = par.map((semente) => limparImagem(bytesDe(semente)).hash)
    assert.equal(hashes[0].slice(0, 2), hashes[1].slice(0, 2))
    const b = fazerBackup({ banco: m.banco, pasta: join(dir, 'b') })
    assert.equal(b.midia.arquivos, 2)
    assert.equal(readdirSync(join(`${b.caminho}.midia`, hashes[0].slice(0, 2))).length, 2)
    perderTudo(m)
    assert.equal(restaurar({ arquivo: b.caminho, destino: m.banco }).midia.arquivos, 2)
    assert.equal(readdirSync(join(m.midiaDir, hashes[0].slice(0, 2))).length, 2)
  } finally { limpar(dir) }
})

test('pasta de imagens do backup: subpasta com nome que não é de 2 hex (mesmo vazia) e arquivo solto com nome de 2 hex são recusados', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    povoar(m)
    const b = fazerBackup({ banco: m.banco, pasta: join(dir, 'b') })
    m.armazem.fechar()
    const pm = `${b.caminho}.midia`
    mkdirSync(join(pm, 'zz'))
    assert.throws(() => conferirMidiaDoBackup(b.caminho), /arquivo estranho na pasta de imagens do backup: zz/)
    rmSync(join(pm, 'zz'), { recursive: true })
    const livre = ['00', '01', '02', '03'].find((n) => !existsSync(join(pm, n)))
    writeFileSync(join(pm, livre), 'x')
    assert.throws(() => conferirMidiaDoBackup(b.caminho), new RegExp(`arquivo estranho na pasta de imagens do backup: ${livre}`))
    rmSync(join(pm, livre))
    assert.equal(conferirMidiaDoBackup(b.caminho).arquivos, 4)
  } finally { limpar(dir) }
})

test('sobras de uma cópia que morreu no mesmo segundo são limpas; falha no meio não deixa pasta de imagens para trás', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    povoar(m)
    const b = join(dir, 'b')
    const agora = new Date('2026-11-17T12:00:00Z')
    const final = join(b, 'rele-20261117-120000.sqlite')
    // 1. um `.midia.parcial` cheio, de uma tentativa anterior do mesmo segundo: é apagado antes de copiar
    mkdirSync(join(`${final}.midia.parcial`, 'ab'), { recursive: true })
    writeFileSync(join(`${final}.midia.parcial`, 'ab', 'resto'), 'x')
    const r = fazerBackup({ banco: m.banco, pasta: b, agora })
    assert.equal(r.midia.arquivos, 4)
    assert.ok(!existsSync(`${final}.midia.parcial`))
    assert.ok(!existsSync(join(`${final}.midia`, 'ab', 'resto')))
    // 2. a troca de nome da pasta falha (já existe uma pasta com o nome final, não vazia): o backup falha e não sobra nada dele
    const agora2 = new Date('2026-11-17T12:00:01Z')
    const final2 = join(b, 'rele-20261117-120001.sqlite')
    mkdirSync(join(`${final2}.midia`, 'cd'), { recursive: true })
    writeFileSync(join(`${final2}.midia`, 'cd', 'ocupado'), 'x')
    assert.throws(() => fazerBackup({ banco: m.banco, pasta: b, agora: agora2 }))
    for (const sobra of [final2, `${final2}.parcial`, `${final2}.sha256`, `${final2}.midia.parcial`, `${final2}.midia`]) assert.ok(!existsSync(sobra), sobra)
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('pasta de mídia ausente: tabela vazia passa (nada a copiar); uma imagem só já é motivo para recusar', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    const a = roverRegistrado(m)
    limpar(m.midiaDir)
    const vazio = fazerBackup({ banco: m.banco, pasta: join(dir, 'b'), agora: new Date('2026-11-17T12:00:00Z') })
    assert.deepEqual(vazio.midia, { arquivos: 0, bytes: 0, ausentes: 0 })
    mkdirSync(m.midiaDir)
    publicarImagem(m, a, pngSintetico({ semente: 5 }))
    limpar(m.midiaDir)
    assert.throws(() => fazerBackup({ banco: m.banco, pasta: join(dir, 'b'), agora: new Date('2026-11-17T12:00:01Z') }), /cita 1 imagens/)
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('rotação não apaga a pasta de imagens velha de um backup que continua (só a que ficou sem banco)', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    povoar(m)
    const b = join(dir, 'b')
    const r = fazerBackup({ banco: m.banco, pasta: b, agora: new Date('2026-11-10T06:00:00Z') })
    const velho = new Date('2026-11-10T06:00:00Z')
    utimesSync(`${r.caminho}.midia`, velho, velho)
    assert.deepEqual(rotacionar({ pasta: b, agora: new Date('2026-11-17T12:00:00Z'), ultimos: 1, dias: 1 }), [])
    assert.equal(conferirMidiaDoBackup(r.caminho).arquivos, 4, 'a pasta de imagens do backup mantido segue inteira')
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('restaurar apaga um `.parcial` de imagens deixado por uma restauração que morreu no meio', () => {
  const dir = pasta()
  try {
    const m = releComMidia(dir)
    povoar(m)
    const b = fazerBackup({ banco: m.banco, pasta: join(dir, 'b') })
    perderTudo(m)
    mkdirSync(join(`${m.midiaDir}.parcial`, 'ab'), { recursive: true })
    writeFileSync(join(`${m.midiaDir}.parcial`, 'ab', 'resto'), 'x')
    assert.equal(restaurar({ arquivo: b.caminho, destino: m.banco }).midia.arquivos, 4)
    assert.ok(!existsSync(`${m.midiaDir}.parcial`))
    assert.ok(!existsSync(join(m.midiaDir, 'ab', 'resto')))
  } finally { limpar(dir) }
})
