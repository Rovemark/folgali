// SPDX-License-Identifier: AGPL-3.0-or-later
// Um EMISSOR FALSO por https, para os testes da lista de revogados: certificado gerado na hora (openssl, válido por 2 dias, só para
// 127.0.0.1), porta livre escolhida pelo sistema, e `fechar()` que derruba só este servidor. Nenhuma chave fica no repositório.
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:https'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CAMINHO_DESCOBERTA = '/.well-known/rover-network'
export const CAMINHO_LISTA = '/.well-known/rover-network/emissores.json'

/** Certificado autoassinado para 127.0.0.1. Sem openssl o teste FALHA (não pula): a prova de https é parte do que se mede. */
export function certificadoLocal() {
  const pasta = mkdtempSync(join(tmpdir(), 'rn-cert-'))
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', join(pasta, 'chave.pem'), '-out', join(pasta, 'cert.pem'), '-days', '2', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`openssl não gerou o certificado de teste: ${r.error?.message ?? r.stderr}`)
  return {
    pasta,
    caminhoCert: join(pasta, 'cert.pem'),
    cert: readFileSync(join(pasta, 'cert.pem')),
    key: readFileSync(join(pasta, 'chave.pem')),
    apagar: () => rmSync(pasta, { recursive: true, force: true })
  }
}

/** A lista no formato do emissor do Rover Hangar (contrato 0.17.0, validarListaDeEmissores). */
export const listaDoEmissor = ({ geradoEm, emissores, revogados = [] }) => ({
  versao: 1, protocolo: '0.3', geradoEm, validadeMaxS: 259200,
  emissores: emissores.map((chave, i) => ({ chave, estado: i === 0 ? 'atual' : 'anterior' })), revogados
})

/** O documento de descoberta do emissor (formato provisório do contrato 0.17.0). */
export const descobertaDoEmissor = ({ emissores, lista = CAMINHO_LISTA }) => ({
  rede: 'rover-network', formato: 'provisorio-1', papel: 'emissor', protocolo: '0.3',
  emissores: emissores.map((chave, i) => ({ chave, estado: i === 0 ? 'atual' : 'anterior' })), lista
})

const json = (res, status, corpo, cabecalhos = {}) => {
  const texto = JSON.stringify(corpo)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(texto), ...cabecalhos })
  res.end(texto)
}

/**
 * Sobe o emissor falso. `rotas` é um mapa caminho -> (req, res) que o teste troca à vontade; por padrão, descoberta e lista
 * respondem a partir de `estado` (também mutável). `pedidos` conta quantas vezes cada caminho foi pedido.
 */
export async function subirEmissorFalso(certificado, estado) {
  const pedidos = new Map()
  const rotas = new Map()
  rotas.set(CAMINHO_DESCOBERTA, (req, res) => json(res, 200, descobertaDoEmissor({ emissores: estado.emissores })))
  rotas.set(CAMINHO_LISTA, (req, res) => {
    if (estado.falhar) return json(res, estado.falhar, { ok: false })
    json(res, 200, listaDoEmissor(estado))
  })
  const servidor = createServer({ cert: certificado.cert, key: certificado.key }, (req, res) => {
    const caminho = new URL(req.url, 'https://x').pathname
    pedidos.set(caminho, (pedidos.get(caminho) ?? 0) + 1)
    const rota = rotas.get(caminho)
    if (!rota) return json(res, 404, { ok: false })
    rota(req, res)
  })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `https://127.0.0.1:${servidor.address().port}`
  return {
    base,
    descoberta: base + CAMINHO_DESCOBERTA,
    lista: base + CAMINHO_LISTA,
    rotas,
    pedidos,
    fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(() => ok()) })
  }
}
