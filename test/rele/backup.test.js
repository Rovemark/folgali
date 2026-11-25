// SPDX-License-Identifier: AGPL-3.0-or-later
// Backup consistente, rotação e restauração do banco do relé. A restauração é provada de verdade: o banco restaurado abre num
// relé novo e devolve as mesmas postagens do original.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Armazem } from '../../packages/rele/src/armazem.js'
import { Rele } from '../../packages/rele/src/rele.js'
import { ProvedorDeTeste } from '../../packages/rele/src/provedor-de-teste.js'
import { conferir, escolherParaApagar, fazerBackup, instanteDoNome, listarBackups, nomeDoBackup, restaurar, rotacionar } from '../../packages/rele/src/backup.js'
import { AGORA } from '../ajuda/mundo.js'
import { novoRoverNoMundo, publicar } from '../ajuda/rele-de-teste.js'

const pasta = () => mkdtempSync(join(tmpdir(), 'rn-backup-'))
const limpar = (...ps) => ps.forEach((p) => rmSync(p, { recursive: true, force: true }))
const BIN = (nome) => new URL(`../../packages/rele/bin/${nome}`, import.meta.url).pathname
const NODE = ['--disable-warning=ExperimentalWarning']

/** Um relé de verdade sobre um arquivo SQLite (WAL), com dois rovers e algumas postagens. */
function releEmArquivo(caminho) {
  const provedor = new ProvedorDeTeste()
  const relogio = { agora: AGORA }
  const armazem = new Armazem(caminho)
  const rele = new Rele({ armazem, provedor, relogio: () => relogio.agora, segredoDeDenuncias: randomBytes(32) })
  const mundo = { provedor, relogio, armazem, rele }
  const a = novoRoverNoMundo(mundo)
  const b = novoRoverNoMundo(mundo)
  publicar(mundo, a, 'perfil', { nome: 'Pipa', descricao: 'Rover de teste.', grafo: 'publico', exigirAprovacao: [] }, { comAtestado: true })
  publicar(mundo, b, 'perfil', { nome: 'Nina', descricao: 'Outro rover de teste.', grafo: 'publico', exigirAprovacao: [] }, { comAtestado: true })
  // Rover de 30 dias, como no resto da suíte (test/ajuda/rele-de-teste.js): o que estes testes provam é o BANCO, não o teto de conta nova.
  // O relé mede a idade desde o primeiro objeto visto, então basta recuar esse instante.
  for (const r of [a, b]) mundo.armazem.executar('UPDATE rovers SET criado_em = criado_em - 2592000 WHERE uid = :uid', { uid: r.uid })
  for (const t of ['primeira', 'segunda', 'terceira']) publicar(mundo, a, 'postagem', { texto: `Postagem ${t} da Pipa.`, topicos: ['teste'] })
  publicar(mundo, b, 'seguir', { alvo: a.uid })
  return { ...mundo, a, b }
}

test('backup de um banco em uso: a cópia abre, passa no integrity_check, tem as contagens e o hash confere', () => {
  const dir = pasta()
  try {
    const m = releEmArquivo(join(dir, 'rele.sqlite'))
    const r = fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b'), agora: new Date('2026-11-05T12:00:00Z') })
    assert.equal(r.arquivo, 'rele-20261105-120000.sqlite')
    assert.equal(r.contagens.rovers, 2)
    assert.equal(r.contagens.objetos, 6)
    assert.deepEqual(conferir(r.caminho), { rovers: 2, objetos: 6 })
    assert.match(readFileSync(`${r.caminho}.sha256`, 'utf8'), new RegExp(`^${r.sha256}  ${r.arquivo}\n$`))
    assert.equal(statSync(r.caminho).mode & 0o777, 0o600)
    assert.equal(statSync(`${r.caminho}.sha256`).mode & 0o777, 0o600)
    assert.equal(statSync(join(dir, 'b')).mode & 0o777, 0o700)
    assert.deepEqual(readdirSync(join(dir, 'b')).filter((n) => n.endsWith('.parcial')), [])
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('backup com o relé gravando sem parar: toda cópia é consistente e as contagens só crescem', async () => {
  const dir = pasta()
  const banco = join(dir, 'rele.sqlite')
  releEmArquivo(banco).armazem.fechar()
  // processo à parte gravando linha a linha (cada uma numa transação), como o relé faria
  const escritor = spawn(process.execPath, [...NODE, '--input-type=module', '-e', `
    import { DatabaseSync } from 'node:sqlite'
    const db = new DatabaseSync(process.argv[1]); db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL')
    const ins = db.prepare("INSERT INTO objetos (id, autor, tipo, criado_em, recebido_em, emissor) VALUES (:id, 'rvr_x', 'reacao', 1, 1, 'e')")
    let parar = false, n = 0
    process.stdin.on('data', () => { parar = true })
    console.log('pronto')
    const lote = () => {
      if (parar) { db.close(); console.log(n); process.exit(0) }
      for (let i = 0; i < 50; i++) ins.run({ id: 'ob_ruido_' + (n++) }) // cada linha numa transação própria
      setImmediate(lote)
    }
    lote()
  `, banco], { stdio: ['pipe', 'pipe', 'inherit'] })
  let saida = ''
  escritor.stdout.on('data', (d) => { saida += d })
  const terminou = new Promise((ok) => escritor.on('close', ok))
  try {
    while (!saida.includes('pronto')) await new Promise((ok) => setTimeout(ok, 20))
    await new Promise((ok) => setTimeout(ok, 100))
    let anterior = 0
    const copias = []
    for (let i = 0; i < 8; i++) {
      const r = fazerBackup({ banco, pasta: join(dir, 'b'), agora: new Date(Date.UTC(2026, 10, 5, 12, 0, i)) })
      assert.ok(r.contagens.objetos >= anterior, 'a contagem não anda para trás')
      anterior = r.contagens.objetos
      copias.push(r)
      assert.deepEqual(conferir(r.caminho).rovers, 2)
      await new Promise((ok) => setTimeout(ok, 40)) // dá tempo ao escritor, mesmo com a máquina carregada: sem isso as cópias podiam sair todas do mesmo instante
    }
    escritor.stdin.write('parar\n')
    await terminou
    const escritos = Number(saida.trim().split('\n').at(-1))
    assert.ok(escritos > 100, `o escritor gravou ${escritos} linhas`)
    assert.ok(copias.at(-1).contagens.objetos > copias[0].contagens.objetos, 'as cópias pegaram momentos diferentes do banco em movimento')
    const db = new DatabaseSync(banco, { readOnly: true })
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM objetos').get().n), 6 + escritos)
    db.close()
  } finally { escritor.kill(); limpar(dir) }
})

test('restaurar de verdade: o banco restaurado abre num relé novo e devolve as mesmas postagens e perfis', () => {
  const dir = pasta()
  try {
    const m = releEmArquivo(join(dir, 'rele.sqlite'))
    const original = { perfil: m.rele.perfil(m.a.uid), postagens: m.rele.postagensDe(m.a.uid), seguidores: m.rele.seguidores(m.a.uid) }
    const b = fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b') })
    m.armazem.fechar()
    rmSync(join(dir, 'rele.sqlite'))
    rmSync(join(dir, 'rele.sqlite-wal'), { force: true })
    rmSync(join(dir, 'rele.sqlite-shm'), { force: true })
    const r = restaurar({ arquivo: b.caminho, destino: join(dir, 'rele.sqlite') })
    assert.deepEqual(r.contagens, { rovers: 2, objetos: 6 })
    assert.deepEqual(r.guardados, [])
    assert.equal(statSync(join(dir, 'rele.sqlite')).mode & 0o777, 0o600)
    // um relé novo, com o mesmo provedor (mesmo emissor), abre o banco restaurado e responde igual
    const armazem = new Armazem(join(dir, 'rele.sqlite'))
    const rele = new Rele({ armazem, provedor: m.provedor, relogio: () => AGORA, segredoDeDenuncias: randomBytes(32) })
    assert.deepEqual(rele.perfil(m.a.uid), original.perfil)
    assert.deepEqual(rele.postagensDe(m.a.uid), original.postagens)
    assert.deepEqual(rele.seguidores(m.a.uid), original.seguidores)
    assert.equal(rele.postagensDe(m.a.uid).itens.length, 3)
    // e continua aceitando a cadeia de onde parou: a cabeça restaurada é a do original
    const proxima = publicar({ ...m, rele }, m.a, 'postagem', { texto: 'Depois da restauração.', topicos: [] })
    assert.equal(proxima.estado, 'aceito')
    armazem.fechar()
  } finally { limpar(dir) }
})

test('restaurar não sobrescreve sem --forcar; com --forcar guarda o banco antigo (e o WAL) de lado', () => {
  const dir = pasta()
  try {
    const banco = join(dir, 'rele.sqlite')
    const m = releEmArquivo(banco)
    const b = fazerBackup({ banco, pasta: join(dir, 'b') })
    publicar(m, m.a, 'postagem', { texto: 'Escrita depois do backup.', topicos: [] }) // fica no WAL, banco aberto
    assert.ok(existsSync(`${banco}-wal`))
    assert.throws(() => restaurar({ arquivo: b.caminho, destino: banco }), /já existe um banco/)
    assert.equal(m.rele.postagensDe(m.a.uid).itens.length, 4, 'a recusa não tocou no banco')
    const r = restaurar({ arquivo: b.caminho, destino: banco, forcar: true, agora: new Date(1_800_000_000_000) })
    assert.ok(r.guardados.includes('rele.sqlite.antes-de-restaurar-1800000000000'))
    assert.ok(existsSync(`${banco}.antes-de-restaurar-1800000000000-wal`), 'o WAL do banco antigo foi junto')
    assert.equal(r.contagens.objetos, 6, 'voltou ao estado do backup')
    assert.ok(!existsSync(`${banco}-wal`) && !existsSync(`${banco}-shm`), 'sem WAL velho colado no banco restaurado')
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('restaurar recusa backup adulterado, truncado, que não é banco ou que não é do relé', () => {
  const dir = pasta()
  try {
    const m = releEmArquivo(join(dir, 'rele.sqlite'))
    const b = fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b') })
    m.armazem.fechar()
    const alvo = join(dir, 'novo.sqlite')

    // 1. um byte mudado: o hash do .sha256 acusa
    const adulterado = join(dir, 'b', 'rele-20260101-000000.sqlite')
    const bytes = readFileSync(b.caminho); bytes[bytes.length - 10] ^= 0xff
    writeFileSync(adulterado, bytes); writeFileSync(`${adulterado}.sha256`, readFileSync(`${b.caminho}.sha256`, 'utf8'))
    assert.throws(() => restaurar({ arquivo: adulterado, destino: alvo }), /hash do backup não confere/)

    // 2. sem .sha256 e truncado: o SQLite acusa
    const truncado = join(dir, 'b', 'rele-20260102-000000.sqlite')
    writeFileSync(truncado, readFileSync(b.caminho)); truncateSync(truncado, 5000)
    assert.throws(() => restaurar({ arquivo: truncado, destino: alvo }))

    // 3. arquivo qualquer
    const lixo = join(dir, 'lixo.sqlite'); writeFileSync(lixo, 'isto nao e um banco de dados'.repeat(50))
    assert.throws(() => restaurar({ arquivo: lixo, destino: alvo }))

    // 4. banco válido de outra coisa
    const outro = join(dir, 'outro.sqlite'); const o = new DatabaseSync(outro); o.exec('CREATE TABLE coisa (x)'); o.close()
    assert.throws(() => restaurar({ arquivo: outro, destino: alvo }), /não parece um banco do relé/)

    // 5. não existe
    assert.throws(() => restaurar({ arquivo: join(dir, 'nao-existe'), destino: alvo }), /não encontrado/)
    assert.ok(!existsSync(alvo), 'nenhuma recusa deixou um destino pela metade')
    assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.parcial')), [])
  } finally { limpar(dir) }
})

test('fazerBackup recusa banco que não existe (e não cria um vazio) e não deixa sobra se a cópia falha', () => {
  const dir = pasta()
  try {
    assert.throws(() => fazerBackup({ banco: join(dir, 'nao-existe.sqlite'), pasta: join(dir, 'b') }), /banco não encontrado/)
    assert.ok(!existsSync(join(dir, 'nao-existe.sqlite')))
    const vazio = join(dir, 'vazio.sqlite'); const v = new DatabaseSync(vazio); v.exec('CREATE TABLE coisa (x)'); v.close()
    assert.throws(() => fazerBackup({ banco: vazio, pasta: join(dir, 'b') }), /não parece um banco do relé/)
    assert.deepEqual(readdirSync(join(dir, 'b')), [], 'cópia reprovada não fica na pasta')
    const m = releEmArquivo(join(dir, 'rele.sqlite'))
    const agora = new Date('2026-11-05T12:00:00Z')
    fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b'), agora })
    assert.throws(() => fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b'), agora }), /já existe um backup deste segundo/)
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('nome do backup: vai e volta, e nome estranho não é backup nosso', () => {
  const d = new Date('2026-03-04T05:06:07Z')
  assert.equal(nomeDoBackup(d), 'rele-20260304-050607.sqlite')
  assert.equal(instanteDoNome('rele-20260304-050607.sqlite'), d.getTime())
  for (const ruim of ['rele-20260304-050607.sqlite.sha256', 'rele.sqlite', 'rele-2026-03-04.sqlite', 'x/rele-20260304-050607.sqlite', 'rele-20261399-050607.sqlite']) {
    assert.equal(instanteDoNome(ruim), null, ruim)
  }
})

const nomes = (...datas) => datas.map((d) => nomeDoBackup(new Date(d)))

test('rotação: guarda as N mais novas e a mais nova de cada dia dos últimos D dias, e apaga o resto', () => {
  const lista = nomes(
    '2026-11-05T18:00:00Z', '2026-11-05T12:00:00Z', '2026-11-05T06:00:00Z', '2026-11-05T00:00:00Z',
    '2026-11-04T18:00:00Z', '2026-11-04T06:00:00Z',
    '2026-11-03T18:00:00Z', '2026-11-03T06:00:00Z',
    '2026-11-02T06:00:00Z', '2026-10-20T06:00:00Z', '2026-10-19T18:00:00Z'
  )
  const agora = new Date('2026-11-05T19:00:00Z')
  const apagar = escolherParaApagar(lista, { agora, ultimos: 2, dias: 3 })
  const fica = lista.filter((n) => !apagar.includes(n))
  // 2 mais novas: 05/18h e 05/12h. Mais nova de cada um dos últimos 3 dias (05, 04, 03): 05/18h (já), 04/18h, 03/18h.
  assert.deepEqual(fica.sort(), nomes('2026-11-05T18:00:00Z', '2026-11-05T12:00:00Z', '2026-11-04T18:00:00Z', '2026-11-03T18:00:00Z').sort())
  assert.equal(apagar.length, lista.length - 4)
  // dias=1: só o dia de hoje conta além das N mais novas
  assert.deepEqual(escolherParaApagar(lista, { agora, ultimos: 1, dias: 1 }).length, lista.length - 1)
  // nunca apaga o que não é backup nosso
  assert.deepEqual(escolherParaApagar(['notas.txt', 'rele.sqlite', ...lista.slice(0, 1)], { agora, ultimos: 1, dias: 1 }), [])
  // poucos backups: nada a apagar
  assert.deepEqual(escolherParaApagar(lista.slice(0, 2), { agora, ultimos: 12, dias: 14 }), [])
  // o limite de dias é inclusivo: dias=2 guarda hoje e ontem
  assert.ok(!escolherParaApagar(lista, { agora, ultimos: 0, dias: 2 }).includes(nomeDoBackup(new Date('2026-11-04T18:00:00Z'))))
  assert.ok(escolherParaApagar(lista, { agora, ultimos: 0, dias: 2 }).includes(nomeDoBackup(new Date('2026-11-03T18:00:00Z'))))
})

test('rotacionar apaga a cópia e o .sha256, preserva arquivo alheio e limpa .parcial velho', () => {
  const dir = pasta()
  try {
    const b = join(dir, 'b')
    const m = releEmArquivo(join(dir, 'rele.sqlite'))
    for (let i = 0; i < 5; i++) fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: b, agora: new Date(Date.UTC(2026, 10, 1 + i, 6)) })
    writeFileSync(join(b, 'LEIAME.txt'), 'não é backup')
    writeFileSync(join(b, 'rele-20261101-060000.sqlite.parcial'), 'sobra'); // velho: mtime antigo
    const velho = new Date('2026-11-01T07:00:00Z'); utimesSync(join(b, 'rele-20261101-060000.sqlite.parcial'), velho, velho)
    const apagados = rotacionar({ pasta: b, agora: new Date('2026-11-05T12:00:00Z'), ultimos: 2, dias: 1 })
    assert.equal(apagados.length, 3)
    assert.deepEqual(listarBackups(b), [nomeDoBackup(new Date('2026-11-05T06:00:00Z')), nomeDoBackup(new Date('2026-11-04T06:00:00Z'))])
    const resto = readdirSync(b).sort()
    assert.deepEqual(resto, ['LEIAME.txt', 'rele-20261104-060000.sqlite', 'rele-20261104-060000.sqlite.sha256', 'rele-20261105-060000.sqlite', 'rele-20261105-060000.sqlite.sha256'])
    m.armazem.fechar()
  } finally { limpar(dir) }
})


test('os executáveis: backup.js faz a cópia e a rotação; restaurar.js `ultimo` devolve o banco; erro sai com código e sem conteúdo', () => {
  const dir = pasta()
  try {
    const banco = join(dir, 'rele.sqlite')
    const m = releEmArquivo(banco)
    m.armazem.fechar()
    const env = { PATH: process.env.PATH, RELE_BANCO: banco, RELE_BACKUP_PASTA: join(dir, 'b'), RELE_BACKUP_ULTIMOS: '2', RELE_BACKUP_DIAS: '1' }
    const rodar = (bin, args = [], extra = {}) => spawnSync(process.execPath, [...NODE, BIN(bin), ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000 })
    const r1 = rodar('backup.js')
    assert.equal(r1.status, 0, r1.stderr)
    const j = JSON.parse(r1.stdout)
    assert.equal(j.evento, 'backup')
    assert.equal(j.rovers, 2)
    assert.equal(j.objetos, 6)
    assert.match(j.arquivo, /^rele-\d{8}-\d{6}\.sqlite$/)
    assert.ok(!r1.stdout.includes('Pipa') && !r1.stdout.includes('Postagem'), 'a saída não carrega conteúdo do banco')
    // restaurar `ultimo` em outro destino
    const r2 = rodar('restaurar.js', ['ultimo', '--destino', join(dir, 'restaurado.sqlite')])
    assert.equal(r2.status, 0, r2.stderr)
    assert.equal(JSON.parse(r2.stdout).objetos, 6)
    // sem --forcar sobre um banco existente: código 1
    const r3 = rodar('restaurar.js', ['ultimo', '--destino', join(dir, 'restaurado.sqlite')])
    assert.equal(r3.status, 1)
    assert.match(r3.stderr, /já existe um banco/)
    // por nome simples, dentro da pasta de backups
    const r4 = rodar('restaurar.js', [j.arquivo, '--destino', join(dir, 'outro.sqlite')])
    assert.equal(r4.status, 0, r4.stderr)
    // banco ausente: falha clara
    const r5 = rodar('backup.js', [], { RELE_BANCO: join(dir, 'nada.sqlite') })
    assert.equal(r5.status, 1)
    assert.match(r5.stderr, /banco não encontrado/)
    // configuração absurda
    assert.equal(rodar('backup.js', [], { RELE_BACKUP_ULTIMOS: '0' }).status, 2)
    assert.equal(rodar('restaurar.js', []).status, 2)
    assert.equal(rodar('restaurar.js', ['ultimo'], { RELE_BACKUP_PASTA: join(dir, 'vazia') }).status, 1)
  } finally { limpar(dir) }
})

test('conferir acusa banco que abre mas é inconsistente (integrity_check devolve linhas em vez de ok, sem lançar)', () => {
  const dir = pasta()
  try {
    const arq = join(dir, 'ruim.sqlite')
    const db = new DatabaseSync(arq)
    db.exec('PRAGMA page_size = 1024; CREATE TABLE rovers (a INTEGER, b TEXT); CREATE INDEX i_b ON rovers(b); CREATE TABLE objetos (y)')
    const ins = db.prepare('INSERT INTO rovers VALUES (?, ?)')
    for (let i = 0; i < 400; i++) ins.run(i, `valor-${String(i).padStart(3, '0')}`)
    db.close()
    // troca o texto de UMA linha da tabela, deixando o índice como estava: o arquivo abre, mas índice e tabela divergem
    const bytes = readFileSync(arq)
    bytes.write('valor-299', bytes.indexOf(Buffer.from('valor-200')))
    writeFileSync(arq, bytes)
    const aberto = new DatabaseSync(arq, { readOnly: true })
    assert.notEqual(aberto.prepare('PRAGMA integrity_check').all()[0].integrity_check, 'ok', 'a corrupção plantada é do tipo que não faz o SQLite lançar')
    aberto.close()
    assert.throws(() => conferir(arq), /integrity_check/)
    assert.throws(() => restaurar({ arquivo: arq, destino: join(dir, 'novo.sqlite') }), /integrity_check/)
    assert.ok(!existsSync(join(dir, 'novo.sqlite')))
  } finally { limpar(dir) }
})

test('listarBackups de pasta que não existe devolve lista vazia', () => {
  assert.deepEqual(listarBackups(join(tmpdir(), `rn-nao-existe-${randomBytes(4).toString('hex')}`)), [])
})

test('rotação: as N mais novas ficam mesmo quando cada uma é de um dia velho; o limite de dias é inclusivo à meia-noite', () => {
  const agora = new Date('2026-11-20T10:00:00Z')
  const velhos = nomes('2026-10-01T06:00:00Z', '2026-10-02T06:00:00Z', '2026-10-03T06:00:00Z', '2026-10-04T06:00:00Z')
  assert.deepEqual(escolherParaApagar(velhos, { agora, ultimos: 3, dias: 1 }), [nomeDoBackup(new Date('2026-10-01T06:00:00Z'))], 'as 3 mais novas ficam, só a mais velha sai')
  // dias=3 olha hoje (20), 19 e 18; a meia-noite exata do dia 18 ainda conta, um segundo antes não
  const borda = nomes('2026-11-18T00:00:00Z', '2026-11-17T23:59:59Z')
  assert.deepEqual(escolherParaApagar(borda, { agora, ultimos: 0, dias: 3 }), [nomeDoBackup(new Date('2026-11-17T23:59:59Z'))])
})

test('rotação com os padrões: 12 mais novas e 14 dias', () => {
  const agora = new Date('2026-11-05T14:30:00Z')
  const mesmoDia = Array.from({ length: 14 }, (_, h) => nomeDoBackup(new Date(Date.UTC(2026, 10, 5, h))))
  const apagados = escolherParaApagar(mesmoDia, { agora })
  assert.deepEqual(apagados.sort(), [mesmoDia[0], mesmoDia[1]].sort(), '14 no mesmo dia: ficam as 12 mais novas')
  const diarios = Array.from({ length: 16 }, (_, d) => nomeDoBackup(new Date(Date.UTC(2026, 9, 21 + d, 6))))
  const apagadosDiarios = escolherParaApagar(diarios, { agora })
  assert.deepEqual(apagadosDiarios.sort(), [diarios[0], diarios[1]].sort(), '16 dias seguidos: os 14 últimos ficam, os 2 mais velhos saem')
})

test('rotacionar com os padrões apaga cópia sem .sha256, não toca em .parcial recente nem em arquivo alheio velho, e apaga .parcial de mais de um dia', () => {
  const dir = pasta()
  try {
    const b = join(dir, 'b')
    const m = releEmArquivo(join(dir, 'rele.sqlite'))
    const hoje = new Date('2026-11-05T12:00:00Z')
    const velho = nomeDoBackup(new Date('2026-09-01T06:00:00Z'))
    fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: b, agora: new Date('2026-09-01T06:00:00Z') })
    rmSync(join(b, `${velho}.sha256`)) // cópia sem selo
    for (let i = 0; i < 12; i++) fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: b, agora: new Date(Date.UTC(2026, 10, 5, i)) })
    const recente = join(b, 'rele-20261105-110000.sqlite.parcial'); writeFileSync(recente, 'x'); utimesSync(recente, new Date(hoje.getTime() - 3_600_000), new Date(hoje.getTime() - 3_600_000))
    const exato = join(b, 'rele-20261105-100000.sqlite.parcial'); writeFileSync(exato, 'x'); utimesSync(exato, new Date(hoje.getTime() - 86_400_000), new Date(hoje.getTime() - 86_400_000))
    const antigo = join(b, 'rele-20261105-090000.sqlite.parcial'); writeFileSync(antigo, 'x'); utimesSync(antigo, new Date(hoje.getTime() - 86_400_000 - 1000), new Date(hoje.getTime() - 86_400_000 - 1000))
    const alheio = join(b, 'notas.txt'); writeFileSync(alheio, 'x'); utimesSync(alheio, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))
    const apagados = rotacionar({ pasta: b, agora: hoje })
    assert.deepEqual(apagados, [velho])
    assert.ok(!existsSync(join(b, velho)))
    assert.ok(existsSync(recente), '.parcial de uma hora atrás pode ser de uma cópia em andamento')
    assert.ok(existsSync(exato), 'exatamente um dia ainda não passa do prazo')
    assert.ok(!existsSync(antigo), '.parcial de mais de um dia é sobra')
    assert.ok(existsSync(alheio), 'arquivo alheio nunca é tocado')
    m.armazem.fechar()
  } finally { limpar(dir) }
})

test('restaurar vê um -wal ou um -shm órfão como banco existente e exige --forcar', () => {
  const dir = pasta()
  try {
    const m = releEmArquivo(join(dir, 'rele.sqlite'))
    const b = fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: join(dir, 'b') })
    m.armazem.fechar()
    for (const extra of ['-wal', '-shm']) {
      const alvo = join(dir, `orfao${extra}.sqlite`)
      writeFileSync(`${alvo}${extra}`, 'resto')
      assert.throws(() => restaurar({ arquivo: b.caminho, destino: alvo }), /já existe um banco/, extra)
      assert.ok(!existsSync(alvo))
    }
  } finally { limpar(dir) }
})

test('rotacionar com os padrões guarda 14 dias de backup diário: com 16 dias seguidos saem exatamente os 2 mais velhos', () => {
  const dir = pasta()
  try {
    const b = join(dir, 'b')
    const m = releEmArquivo(join(dir, 'rele.sqlite'))
    const diarios = Array.from({ length: 16 }, (_, d) => new Date(Date.UTC(2026, 9, 21 + d, 6)))
    for (const quando of diarios) fazerBackup({ banco: join(dir, 'rele.sqlite'), pasta: b, agora: quando })
    const apagados = rotacionar({ pasta: b, agora: new Date('2026-11-05T14:30:00Z') })
    assert.deepEqual(apagados.sort(), [nomeDoBackup(diarios[0]), nomeDoBackup(diarios[1])].sort())
    assert.equal(listarBackups(b).length, 14)
    m.armazem.fechar()
  } finally { limpar(dir) }
})
