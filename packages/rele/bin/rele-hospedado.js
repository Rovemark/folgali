#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Entrada do relé HOSPEDADO (contêiner atrás de um proxy). Monta o mesmo relé de bin/rele.js, mas falha fechado:
// em vez de criar o que falta (como o segredo das denúncias, num arquivo ao lado do banco), RECUSA subir sem ele.
//
// Variáveis de ambiente (nenhuma vai para a linha de comando; nenhuma é escrita no log):
//   RELE_EMISSORES           obrigatória. Chaves públicas (43 caracteres) dos emissores de handle em que confiar, por vírgula
//   RELE_SEGREDO_DENUNCIAS   obrigatória. 32 bytes em hexadecimal (64 caracteres). Fica FORA do banco: um vazamento do banco
//                            não revela quem denunciou
//   RELE_ADMIN_TOKEN         opcional, 32 caracteres ou mais. Sem ela a administração fica desligada. Mesmo com ela, o proxy
//                            não alcança /v1/admin: use `docker exec` (ver docs/OPERACAO-DO-RELE.md)
//   RELE_BANCO               arquivo SQLite (padrão /dados/rele.sqlite)
//   RELE_PORTA / RELE_ENDERECO   escuta (padrão 4747 em 127.0.0.1; a imagem define 0.0.0.0)
//   RELE_CONFIAR_PROXY       `sim`: a origem de cada pedido é o último X-Forwarded-For e o HSTS sai. Só atrás de proxy seu
//   RELE_CORS_ORIGENS        origens do navegador autorizadas (https://rede.exemplo.com), por vírgula. Vazio = nenhuma
//   RELE_RAJADA_CAPACIDADE / RELE_RAJADA_POR_SEGUNDO   balde de fichas por origem (padrão do protocolo)
//   RELE_DEMONSTRACAO        `sim` marca o relé como demonstração em /.well-known/rover-network
//   RELE_MENSAGENS           `sim` liga as mensagens privadas (0.4.0); desligadas por padrão. Ligar é decisão do Arquiteto (parecer pendente).
//   RELE_MIDIA               `sim` liga as imagens (0.5.0); desligadas por padrão. RELE_MIDIA_DIR e RELE_MIDIA_COTA_MB como em bin/rele.js.
//                            As duas aceitam só `sim` ou `nao` (ou ficam de fora): outro valor impede o relé de subir.
//   RELE_SEM_FATOR_DE_IDADE  `sim` tira o teto menor de rover novo (20% no 1º dia, 50% na 1ª semana). SÓ durante a carga da demonstração
//                            (`--semear`) e desligada logo depois: é a defesa contra spam de conta nova. Ver docs/OPERACAO-DO-RELE.md.
//   RELE_EMISSORES_DESCOBERTA  opcional. Pares chave=URL, por vírgula: de onde ler a lista de REVOGADOS de cada emissor (a descoberta
//                            `https://.../.well-known/rover-network` do emissor, ou a lista direto). Só https, sem usuário ou senha na URL;
//                            a chave precisa estar em RELE_EMISSORES. O relé lê ao subir e de tempos em tempos; o estado fica em
//                            `revogados-dos-emissores.json` ao lado do banco. Ver docs/OPERACAO-DO-RELE.md, seção 15.
//   RELE_REVOGADOS_INTERVALO_MIN   minutos entre leituras (padrão 5, mínimo 1)
//   RELE_REVOGADOS_IDADE_MAX_MIN   lista mais velha que isto (padrão 60 minutos) gera alerta no log e `velha` em /v1/info
//   RELE_AUTORIZACAO_PERMANENTE  0.6.0: LIGADA por padrão (proposta 0008, decisão do Arquiteto de 24/11/2026); `nao` desliga, outro valor
//                            impede o relé de subir. O parecer jurídico segue pendente (docs/OPERACAO-DO-RELE.md, seção 16).
//   RELE_EMISSORES_DE_AGENTES  0.6.0: chaves dos emissores ABERTOS de agents de fora (o serviço packages/emissor-aberto), por vírgula; cada
//                            uma também em RELE_EMISSORES. O rover atestado por um deles ganha o selo `agente`. A lista de revogados do
//                            emissor aberto entra por RELE_EMISSORES_DESCOBERTA (chave=https://.../v1/agentes/emissores.json).
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { CHAVE_PUBLICA_RE, RAJADA_PADRAO, VERSAO_PROTOCOLO, importarPublica } from '../../protocolo/src/index.js'
import { Armazem } from '../src/armazem.js'
import { criarServidor } from '../src/http.js'
import { autorizacaoPermanenteDe, emissoresDeAgentesDe, lerOrigens, operar, origemPorProxy } from '../src/operacao.js'
import { ProvedorEstatico } from '../src/provedor.js'
import { ProvedorComRevogadosDoEmissor, REVOGADOS, lerFontesDeRevogados } from '../src/revogados-do-emissor.js'
import { Rele } from '../src/rele.js'

const env = process.env
const falhar = (mensagem) => { console.error(mensagem); process.exit(2) }

const emissores = (env.RELE_EMISSORES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (!emissores.length) falhar('Defina RELE_EMISSORES com ao menos uma chave pública de emissor de handle. Sem emissor confiável o relé não aceita ninguém.')
for (const e of emissores) {
  if (!CHAVE_PUBLICA_RE.test(e) || importarPublica(e) === null) falhar('RELE_EMISSORES tem uma chave que não é uma chave pública Ed25519 em base64url (43 caracteres).')
}

if (!/^[0-9a-f]{64}$/i.test(env.RELE_SEGREDO_DENUNCIAS ?? '')) {
  falhar('Defina RELE_SEGREDO_DENUNCIAS com 32 bytes em hexadecimal (64 caracteres). O relé hospedado não cria esse segredo sozinho.')
}
const segredoDeDenuncias = Buffer.from(env.RELE_SEGREDO_DENUNCIAS, 'hex')

if (env.RELE_ADMIN_TOKEN !== undefined && env.RELE_ADMIN_TOKEN !== '' && env.RELE_ADMIN_TOKEN.length < 32) {
  falhar('RELE_ADMIN_TOKEN precisa ter 32 caracteres ou mais (ou fique de fora).')
}
let aceitarAutorizacaoPermanente
let emissoresDeAgentes
try {
  aceitarAutorizacaoPermanente = autorizacaoPermanenteDe(env)
  emissoresDeAgentes = emissoresDeAgentesDe(env, emissores)
} catch (e) { falhar(e.message) }

let origensPermitidas
try { origensPermitidas = lerOrigens(env.RELE_CORS_ORIGENS) } catch (e) { falhar(e.message) }

const inteiroPositivo = (nome, padrao) => {
  if (env[nome] === undefined || env[nome] === '') return padrao
  const n = Number(env[nome])
  if (!Number.isFinite(n) || n <= 0 || n > 100000) falhar(`${nome} precisa ser um número maior que zero.`)
  return n
}
const rajada = {
  capacidade: inteiroPositivo('RELE_RAJADA_CAPACIDADE', RAJADA_PADRAO.capacidade),
  porSegundo: inteiroPositivo('RELE_RAJADA_POR_SEGUNDO', RAJADA_PADRAO.porSegundo)
}
const atrasDeProxy = env.RELE_CONFIAR_PROXY === 'sim'
const demonstracao = env.RELE_DEMONSTRACAO === 'sim'
if (!['', undefined, 'sim', 'nao'].includes(env.RELE_SEM_FATOR_DE_IDADE)) falhar('RELE_SEM_FATOR_DE_IDADE aceita só `sim` ou `nao` (ou fique de fora).')
const semFatorDeIdade = env.RELE_SEM_FATOR_DE_IDADE === 'sim'
if (!['', undefined, 'sim', 'nao'].includes(env.RELE_MENSAGENS)) falhar('RELE_MENSAGENS aceita só `sim` ou `nao` (ou fique de fora).')
const mensagens = env.RELE_MENSAGENS === 'sim'
const adminLigado = typeof env.RELE_ADMIN_TOKEN === 'string' && env.RELE_ADMIN_TOKEN.length >= 32

const caminhoDoBanco = resolve(env.RELE_BANCO ?? '/dados/rele.sqlite')
mkdirSync(dirname(caminhoDoBanco), { recursive: true, mode: 0o700 })

// A lista de revogados de cada emissor (opcional). Sem RELE_EMISSORES_DESCOBERTA o relé segue como antes: emissores fixos, nenhuma revogação lida.
let fontesDeRevogados
try { fontesDeRevogados = lerFontesDeRevogados(env.RELE_EMISSORES_DESCOBERTA, emissores) } catch (e) { falhar(e.message) }
const minutos = (nome, padrao, min, max) => {
  if (env[nome] === undefined || env[nome] === '') return padrao
  if (!/^\d{1,6}$/.test(env[nome]) || Number(env[nome]) < min || Number(env[nome]) > max) falhar(`${nome} precisa ser um número inteiro de minutos, de ${min} a ${max}.`)
  return Number(env[nome])
}
const intervaloMin = minutos('RELE_REVOGADOS_INTERVALO_MIN', REVOGADOS.intervaloPadraoMin, REVOGADOS.intervaloMinimoMin, REVOGADOS.intervaloMaximoMin)
const idadeMaxMin = minutos('RELE_REVOGADOS_IDADE_MAX_MIN', REVOGADOS.idadeMaxPadraoMin, REVOGADOS.intervaloMinimoMin, REVOGADOS.idadeMaxMaximaMin)
if (idadeMaxMin < intervaloMin) falhar('RELE_REVOGADOS_IDADE_MAX_MIN precisa ser maior ou igual a RELE_REVOGADOS_INTERVALO_MIN (senão a lista fica velha entre uma leitura e outra).')
const registrar = (e) => console.error(JSON.stringify({ t: new Date().toISOString(), ...e }))
let provedor
if (fontesDeRevogados.length) {
  try {
    provedor = new ProvedorComRevogadosDoEmissor({
      emissores, fontes: fontesDeRevogados, arquivo: join(dirname(caminhoDoBanco), 'revogados-dos-emissores.json'),
      intervaloS: intervaloMin * 60, idadeMaxS: idadeMaxMin * 60, registrar
    })
  } catch (e) { falhar(e.message) }
} else {
  provedor = new ProvedorEstatico({ emissores, nome: 'estatico' })
}

// 0.5.0: imagens. DESLIGADAS por padrão (sem varredura de conteúdo ilícito e sem revisão jurídica: docs/juridico/06-midia.md).
if (!['', undefined, 'sim', 'nao'].includes(env.RELE_MIDIA)) falhar('RELE_MIDIA aceita só `sim` ou `nao` (ou fique de fora).')
const midia = env.RELE_MIDIA === 'sim'
  ? { dir: resolve(env.RELE_MIDIA_DIR || `${dirname(caminhoDoBanco)}/midia`), cotaBytes: inteiroPositivo('RELE_MIDIA_COTA_MB', 1024) * 1048576 }
  : null

const armazem = new Armazem(caminhoDoBanco)
const rele = new Rele({
  armazem,
  provedor,
  segredoDeDenuncias,
  aceitarAutorizacaoPermanente,
  emissoresDeAgentes,
  semFatorDeIdade,
  midia,
  mensagens
})
const servidor = criarServidor({
  rele,
  tokenAdmin: env.RELE_ADMIN_TOKEN ?? null,
  rajada,
  ...(atrasDeProxy ? { origemDe: origemPorProxy } : {}),
  registrar
})
operar(servidor, {
  origensPermitidas,
  atrasDeProxy,
  descoberta: () => {
    const info = rele.info()
    return { rede: 'rover-network', formato: 'provisorio-1', protocolo: info.protocolo, api: '/v1', info: '/v1/info', demonstracao }
  }
})

// Lê os revogados ANTES de abrir a porta (cada busca tem prazo de 10 s; as fontes vão em paralelo). Falhar aqui não impede a subida:
// vale o que o arquivo guardou, e a idade da lista aparece no log e em /v1/info.
let pararRevogados = () => {}
if (provedor instanceof ProvedorComRevogadosDoEmissor) {
  await provedor.atualizar()
  pararRevogados = provedor.ligar()
}

const porta = Number(env.RELE_PORTA ?? 4747)
const endereco = env.RELE_ENDERECO ?? '127.0.0.1'
servidor.listen(porta, endereco, () => {
  console.error(JSON.stringify({
    t: new Date().toISOString(), nivel: 'info', evento: 'ouvindo', endereco, porta, protocolo: VERSAO_PROTOCOLO,
    emissores: emissores.length, admin: adminLigado, proxy: atrasDeProxy, cors: origensPermitidas.length, demonstracao, autorizacaoPermanente: rele.aceitaAutorizacao, semFatorDeIdade: rele.semFatorDeIdade, midia: rele.midia !== null, mensagens: rele.mensagens !== null, emissoresDeAgentes: emissoresDeAgentes.length,
    fontesDeRevogados: fontesDeRevogados.length
  }))
})
setInterval(() => { try { rele.limpar() } catch { /* a próxima volta tenta de novo */ } }, 6 * 3600 * 1000).unref()

// Parada limpa: fecha as conexões ociosas, espera as ativas por alguns segundos e fecha o banco (o SQLite faz o checkpoint do WAL).
let parando = false
const parar = () => {
  if (parando) return
  parando = true
  pararRevogados()
  servidor.close(() => { try { armazem.fechar() } catch { /* já fechado */ } process.exit(0) })
  servidor.closeIdleConnections()
  setTimeout(() => { servidor.closeAllConnections(); try { armazem.fechar() } catch { /* já fechado */ } process.exit(0) }, 8000).unref()
}
process.on('SIGINT', parar)
process.on('SIGTERM', parar)
