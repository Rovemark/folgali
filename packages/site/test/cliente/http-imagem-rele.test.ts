// `ClienteHttp.imagem` e a rota `/midia/<hash>.<ext>` do site contra o RELÉ DE REFERÊNCIA DE VERDADE (`npm run rele`), não contra um
// servidor de mentira: um banco temporário numa porta livre, com `RELE_MIDIA=sim`, um rover que publica o retrato em imagem pelo cliente
// de referência, e o site lendo esses bytes. Depois o mesmo banco sobe com o recurso desligado e a mesma imagem tem de dar 404.
// O relé sobe num grupo de processos próprio (o `npm` abre um filho `node`); no fim só esse grupo é morto.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ClienteHttp } from '@/lib/cliente-http'
import { todasAsImagensDeDemonstracao } from '@/lib/social/falso/imagens'
import { GET } from '@/app/midia/[arquivo]/route'

// o protocolo e o cliente de referência são JavaScript puro do mesmo repositório
// @ts-expect-error módulo JS sem tipos
import { criarAtestadoDeHandle, gerarParDeChaves, limparImagem } from '../../../protocolo/src/index.js'
// @ts-expect-error módulo JS sem tipos
import { AprovadorDeTeste, ClienteRover } from '../../../cliente/src/index.js'

const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))
const tem = existsSync(join(RAIZ, 'packages/rele/bin/rele.js'))

const portaLivre = () => new Promise<number>((ok, falha) => {
  const s = createServer()
  s.on('error', falha)
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address() as { port: number }
    s.close(() => ok(port))
  })
})

type Rele = { processo: ChildProcess; base: string; log: () => string }

/** Sobe `npm run rele` num grupo de processos próprio e espera o `ouvindo` do log. */
async function subirRele(banco: string, emissor: string, midia: boolean): Promise<Rele> {
  const porta = await portaLivre()
  const processo = spawn('npm', ['run', '--silent', 'rele'], {
    cwd: RAIZ,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, RELE_EMISSORES: emissor, RELE_BANCO: banco, RELE_PORTA: String(porta), RELE_ENDERECO: '127.0.0.1', RELE_MIDIA: midia ? 'sim' : 'nao', RELE_MIDIA_DIR: '' },
  })
  let log = ''
  processo.stderr!.on('data', (d: Buffer) => { log += d.toString() })
  const prazo = Date.now() + 20_000
  while (!/"evento":"ouvindo"/.test(log)) {
    if (processo.exitCode !== null || Date.now() > prazo) throw new Error(`o relé não subiu:\n${log}`)
    await new Promise((ok) => setTimeout(ok, 50))
  }
  expect(log).toContain(`"midia":${midia}`)
  return { processo, base: `http://127.0.0.1:${porta}`, log: () => log }
}

/** Mata o grupo que ESTE teste criou (o npm e o node filho), e só ele; espera sair. */
async function pararRele(r: Rele | undefined) {
  if (!r?.processo.pid || r.processo.exitCode !== null) return
  const saiu = new Promise((ok) => r.processo.once('exit', ok))
  try { process.kill(-r.processo.pid, 'SIGTERM') } catch { /* o grupo já acabou */ }
  const prazo = setTimeout(() => { try { process.kill(-r.processo.pid!, 'SIGKILL') } catch { /* já acabou */ } }, 5000)
  await saiu
  clearTimeout(prazo)
}

const chamarRota = (arquivo: string) => GET(new Request(`http://site/midia/${arquivo}`), { params: Promise.resolve({ arquivo }) })

/** A rota do site lê o cliente pela variável de ambiente; troca de relé = troca de cliente guardado. */
function apontarSitePara(base: string) {
  process.env.ROVER_NETWORK_CLIENTE = 'http'
  process.env.ROVER_NETWORK_RELE_URL = base
  delete (globalThis as { __roverNetworkRede?: unknown }).__roverNetworkRede
}

describe.skipIf(!tem)('imagens pelo relé de referência de verdade (npm run rele, RELE_MIDIA=sim)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rn-site-midia-'))
  const banco = join(dir, 'rele.sqlite')
  const emissor = gerarParDeChaves()
  const amostra = todasAsImagensDeDemonstracao()[0]
  const limpa = limparImagem(Buffer.from(amostra.bytes))
  const ambienteAntes = { cliente: process.env.ROVER_NETWORK_CLIENTE, url: process.env.ROVER_NETWORK_RELE_URL }
  let rele: Rele | undefined

  beforeAll(async () => {
    rele = await subirRele(banco, emissor.chavePublica, true)
    // um rover de verdade: atestado do emissor em que o relé confia, perfil, e o retrato em imagem pelo cliente de referência
    const rede = gerarParDeChaves()
    const aprovacao = gerarParDeChaves()
    const agora = Math.floor(Date.now() / 1000)
    const uid = `rvr_${randomBytes(16).toString('base64url')}`
    const atestado = criarAtestadoDeHandle({
      chavePrivadaDoEmissor: emissor.chavePrivada, emissor: emissor.chavePublica, uid, handle: `pipa.t${randomBytes(3).toString('hex')}`,
      chave: rede.chavePublica, chaveAprovacao: aprovacao.chavePublica, emitidoEm: agora - 10, expiraEm: agora + 30 * 86400,
    })
    const cliente = new ClienteRover({ base: rele.base, uid, chavePrivada: rede.chavePrivada, atestado, aprovador: new AprovadorDeTeste({ chavePrivadaDeAprovacao: aprovacao.chavePrivada }) })
    expect((await cliente.perfil({ nome: 'Pipa' })).estado).toBe('aceito')
    // imagem exige conta com 1 dia; o relé mede a idade desde o primeiro objeto visto, então a conta é envelhecida no banco (o relé segue no ar)
    const db = new DatabaseSync(banco)
    db.exec('PRAGMA busy_timeout = 5000')
    db.prepare('UPDATE rovers SET criado_em = criado_em - 172800 WHERE uid = ?').run(uid)
    db.close()
    expect((await cliente.definirRetratoImagem(Buffer.from(amostra.bytes), { alt: amostra.alt })).estado).toBe('aceito')
  }, 30_000)

  afterAll(async () => {
    await pararRele(rele)
    process.env.ROVER_NETWORK_CLIENTE = ambienteAntes.cliente
    process.env.ROVER_NETWORK_RELE_URL = ambienteAntes.url
    if (ambienteAntes.cliente === undefined) delete process.env.ROVER_NETWORK_CLIENTE
    if (ambienteAntes.url === undefined) delete process.env.ROVER_NETWORK_RELE_URL
    delete (globalThis as { __roverNetworkRede?: unknown }).__roverNetworkRede
    rmSync(dir, { recursive: true, force: true })
  })

  it('o relé serve a imagem com os cabeçalhos de segurança dele (controle: o que o site repassa vem daqui)', async () => {
    const res = await fetch(`${rele!.base}/v1/midia/${limpa.hash}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toMatch(/default-src 'none'/)
    expect(res.headers.get('cache-control')).toMatch(/immutable/)
  })

  it('ClienteHttp.imagem devolve os bytes limpos exatos e o formato', async () => {
    const achada = await new ClienteHttp({ base: rele!.base }).imagem(limpa.hash)
    expect(achada?.formato).toBe('png')
    expect(Buffer.compare(Buffer.from(achada!.bytes), limpa.bytes)).toBe(0)
    // hash que o relé não tem, e texto que nem é hash (este nem sai do computador)
    expect(await new ClienteHttp({ base: rele!.base }).imagem('0'.repeat(64))).toBeNull()
    expect(await new ClienteHttp({ base: rele!.base }).imagem('../v1/info')).toBeNull()
  })

  it('a rota /midia do site em modo http serve os bytes do relé com nosniff, CSP sandbox e cache imutável', async () => {
    apontarSitePara(rele!.base)
    const res = await chamarRota(`${limpa.hash}.png`)
    expect(res.status).toBe(200)
    expect(Buffer.compare(Buffer.from(await res.arrayBuffer()), limpa.bytes)).toBe(0)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('content-length')).toBe(String(limpa.bytes.length))
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('etag')).toBe(`"${limpa.hash}"`)
    expect(res.headers.get('content-disposition')).toBe('inline')
  })

  it('na rota, extensão que não bate com o formato e hash desconhecido dão 404 sem cache e com nosniff', async () => {
    apontarSitePara(rele!.base)
    for (const arquivo of [`${limpa.hash}.jpg`, `${'0'.repeat(64)}.png`, `${limpa.hash}.svg`, 'nada.png']) {
      const res = await chamarRota(arquivo)
      expect(res.status, arquivo).toBe(404)
      expect(res.headers.get('x-content-type-options'), arquivo).toBe('nosniff')
      expect(res.headers.get('cache-control'), arquivo).toBe('no-store')
      expect(res.headers.get('content-type'), arquivo).toMatch(/^text\/plain/)
    }
  })

  it('o MESMO banco com o recurso desligado: o relé responde 404 e a rota do site também, sem cache', async () => {
    await pararRele(rele)
    rele = await subirRele(banco, emissor.chavePublica, false)
    const direto = await fetch(`${rele.base}/v1/midia/${limpa.hash}`)
    expect(direto.status).toBe(404)
    expect(await new ClienteHttp({ base: rele.base }).imagem(limpa.hash)).toBeNull()
    apontarSitePara(rele.base)
    const res = await chamarRota(`${limpa.hash}.png`)
    expect(res.status).toBe(404)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-security-policy')).toBeNull()
  }, 30_000)
})
