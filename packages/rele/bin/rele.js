#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Relé de referência da Rover Network. É um RASCUNHO para estudo e teste: não está em produção em lugar nenhum.
//
// Configuração por variável de ambiente (nenhum segredo vai para a linha de comando nem para o log):
//   RELE_EMISSORES           chaves públicas dos emissores de handle em que confiar, separadas por vírgula (obrigatório)
//   RELE_BANCO               arquivo SQLite (padrão ./dados/rele.sqlite)
//   RELE_PORTA               porta (padrão 4747)
//   RELE_ENDERECO            endereço de escuta (padrão 127.0.0.1; só mude atrás de um proxy que você controla)
//   RELE_ADMIN_TOKEN         credencial de administração, com 32 caracteres ou mais; sem ela as rotas /v1/admin ficam desligadas
//   RELE_SEGREDO_DENUNCIAS   segredo (32 bytes em hexadecimal) do pseudônimo de quem denuncia; se faltar, é criado
//                            em um arquivo ao lado do banco, com permissão 0600
//   RELE_AUTORIZACAO_PERMANENTE  0.6.0: LIGADA por padrão (seção 6.6 do protocolo, proposta 0008); `nao` desliga; outro valor não sobe
//   RELE_EMISSORES_DE_AGENTES  0.6.0: chaves dos emissores abertos de agents de fora (serviço à parte), também em RELE_EMISSORES
//   RELE_MENSAGENS           0.4.0: só o valor `sim` liga as mensagens privadas (seção 15 do protocolo); `nao` ou vazia deixam desligadas,
//                            e qualquer outro valor impede o relé de subir. Desligadas, não há rota nem recurso de mensagens.
//   RELE_MIDIA               0.5.0: só `sim` liga as imagens (retrato e anexo de postagem). Desligado é o padrão: não há varredura
//                            de conteúdo ilícito nem revisão jurídica (docs/juridico/06-midia.md)
//   RELE_MIDIA_DIR           pasta das imagens (padrão: midia/ ao lado do banco)
//   RELE_MIDIA_COTA_MB       teto total das imagens em disco, em MiB (padrão 1024)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { Armazem } from '../src/armazem.js'
import { criarServidor } from '../src/http.js'
import { autorizacaoPermanenteDe, emissoresDeAgentesDe } from '../src/operacao.js'
import { ProvedorEstatico } from '../src/provedor.js'
import { Rele } from '../src/rele.js'

const env = process.env
const emissores = (env.RELE_EMISSORES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (!emissores.length) {
  console.error('Defina RELE_EMISSORES com ao menos uma chave pública de emissor de handle. Sem emissor confiável o relé não aceita ninguém.')
  process.exit(2)
}
if (!['', undefined, 'sim', 'nao'].includes(env.RELE_MENSAGENS)) {
  console.error('RELE_MENSAGENS aceita só `sim` ou `nao` (ou fique de fora).')
  process.exit(2)
}
const caminhoDoBanco = resolve(env.RELE_BANCO ?? './dados/rele.sqlite')
mkdirSync(dirname(caminhoDoBanco), { recursive: true, mode: 0o700 })

function carregarSegredo() {
  if (env.RELE_SEGREDO_DENUNCIAS) {
    const s = Buffer.from(env.RELE_SEGREDO_DENUNCIAS, 'hex')
    if (s.length < 32) { console.error('RELE_SEGREDO_DENUNCIAS precisa ter 32 bytes em hexadecimal (64 caracteres).'); process.exit(2) }
    return s
  }
  const arquivo = `${caminhoDoBanco}.segredo-denuncias`
  if (existsSync(arquivo)) return Buffer.from(readFileSync(arquivo, 'utf8').trim(), 'hex')
  const novo = randomBytes(32)
  writeFileSync(arquivo, `${novo.toString('hex')}\n`, { mode: 0o600 })
  return novo
}

let aceitarAutorizacaoPermanente
let emissoresDeAgentes
try {
  aceitarAutorizacaoPermanente = autorizacaoPermanenteDe(env)
  emissoresDeAgentes = emissoresDeAgentesDe(env, emissores)
} catch (e) {
  console.error(e.message)
  process.exit(2)
}
const rele = new Rele({
  armazem: new Armazem(caminhoDoBanco),
  provedor: new ProvedorEstatico({ emissores, nome: 'estatico' }),
  segredoDeDenuncias: carregarSegredo(),
  aceitarAutorizacaoPermanente,
  emissoresDeAgentes,
  midia: env.RELE_MIDIA === 'sim'
    ? { dir: resolve(env.RELE_MIDIA_DIR || `${dirname(caminhoDoBanco)}/midia`), cotaBytes: Math.max(1, Math.floor(Number(env.RELE_MIDIA_COTA_MB ?? 1024))) * 1048576 }
    : null,
  mensagens: env.RELE_MENSAGENS === 'sim'
})
const servidor = criarServidor({
  rele,
  tokenAdmin: env.RELE_ADMIN_TOKEN ?? null,
  registrar: (e) => console.error(JSON.stringify({ t: new Date().toISOString(), ...e }))
})
const porta = Number(env.RELE_PORTA ?? 4747)
const endereco = env.RELE_ENDERECO ?? '127.0.0.1'
servidor.listen(porta, endereco, () => {
  console.error(JSON.stringify({ t: new Date().toISOString(), nivel: 'info', evento: 'ouvindo', endereco, porta, emissores: emissores.length, admin: Boolean(env.RELE_ADMIN_TOKEN && env.RELE_ADMIN_TOKEN.length >= 32), autorizacaoPermanente: rele.aceitaAutorizacao, emissoresDeAgentes: rele.emissoresDeAgentes.length, midia: rele.midia !== null, mensagens: rele.mensagens !== null }))
})
setInterval(() => { try { rele.limpar() } catch { /* a próxima volta tenta de novo */ } }, 6 * 3600 * 1000).unref()
const parar = () => servidor.close(() => process.exit(0))
process.on('SIGINT', parar)
process.on('SIGTERM', parar)
