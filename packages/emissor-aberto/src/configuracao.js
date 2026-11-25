// SPDX-License-Identifier: AGPL-3.0-or-later
// A configuração do serviço do emissor aberto, lida das variáveis de ambiente. Falha fechada: o que falta ou sobra impede o serviço de
// subir, com uma mensagem para o operador que nunca ecoa um segredo. Nenhum segredo vai para a linha de comando nem para o log.
//   EMISSOR_CHAVE           obrigatória. Semente (32 bytes, hex) da chave que assina os atestados dos agents
//   EMISSOR_SEGREDO         obrigatória. 32 bytes em hex, diferente da chave: deriva a chave de aprovação de cada agente e o HMAC dos donos
//   EMISSOR_DONOS           obrigatória. Chaves públicas dos emissores de donos (o login Rovemark), por vírgula
//   EMISSOR_LINK            obrigatória. A página de reivindicação, https, terminando em `/` (o segredo do link vai depois)
//   EMISSOR_RELE            obrigatória. A raiz do relé que este emissor serve (https://folgali.com). http só para 127.0.0.1 e localhost
//   EMISSOR_BANCO           arquivo SQLite (padrão /dados/emissor-aberto.sqlite)
//   EMISSOR_PORTA / EMISSOR_ENDERECO   escuta (padrão 4848 em 127.0.0.1; a imagem define 0.0.0.0)
//   EMISSOR_CONFIAR_PROXY   `sim`: a origem de cada pedido é o último X-Forwarded-For. Só atrás de proxy seu
//   EMISSOR_ENTREGAS_INTERVALO_S   segundos entre tentativas de entregar o que ficou na fila (padrão 60)
import { chavePrivadaDeSemente } from '../../protocolo/src/index.js'

const SIM_NAO = ['', undefined, 'sim', 'nao']
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/

export function lerConfiguracao(env) {
  const hex32 = (nome) => {
    if (!/^[0-9a-f]{64}$/i.test(env[nome] ?? '')) throw new Error(`Defina ${nome} com 32 bytes em hexadecimal (64 caracteres).`)
    return Buffer.from(env[nome], 'hex')
  }
  const semente = hex32('EMISSOR_CHAVE')
  const segredo = hex32('EMISSOR_SEGREDO')
  if (semente.equals(segredo)) throw new Error('EMISSOR_SEGREDO precisa ser diferente de EMISSOR_CHAVE.')
  const donos = (env.EMISSOR_DONOS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!donos.length || donos.some((d) => !/^[A-Za-z0-9_-]{43}$/.test(d))) {
    throw new Error('Defina EMISSOR_DONOS com as chaves públicas (43 caracteres) dos emissores de donos, por vírgula.')
  }
  const link = env.EMISSOR_LINK ?? ''
  if (!/^https:\/\/[^\s/?#@]+(\/[^\s?#@]*)?\/$/.test(link)) {
    throw new Error('Defina EMISSOR_LINK com a página de reivindicação, https, sem usuário nem consulta, terminando em /.')
  }
  const rele = (env.EMISSOR_RELE ?? '').replace(/\/+$/, '')
  if (!/^https:\/\/[^\s/?#@]+$/.test(rele) && !LOOPBACK.test(rele)) {
    throw new Error('Defina EMISSOR_RELE com a raiz do relé (https://dominio, sem caminho; http só para 127.0.0.1 ou localhost).')
  }
  if (!SIM_NAO.includes(env.EMISSOR_CONFIAR_PROXY)) throw new Error('EMISSOR_CONFIAR_PROXY aceita só `sim` ou `nao` (ou fique de fora).')
  const inteiro = (nome, padrao, min, max) => {
    if (env[nome] === undefined || env[nome] === '') return padrao
    if (!/^\d{1,6}$/.test(env[nome]) || Number(env[nome]) < min || Number(env[nome]) > max) throw new Error(`${nome} precisa ser um inteiro de ${min} a ${max}.`)
    return Number(env[nome])
  }
  return {
    chavePrivada: chavePrivadaDeSemente(semente),
    segredo,
    emissoresDeDonos: donos,
    linkDeReivindicacao: link,
    rele,
    banco: env.EMISSOR_BANCO || '/dados/emissor-aberto.sqlite',
    porta: inteiro('EMISSOR_PORTA', 4848, 1, 65535),
    endereco: env.EMISSOR_ENDERECO || '127.0.0.1',
    confiarProxy: env.EMISSOR_CONFIAR_PROXY === 'sim',
    intervaloDeEntregasS: inteiro('EMISSOR_ENTREGAS_INTERVALO_S', 60, 5, 86400)
  }
}
