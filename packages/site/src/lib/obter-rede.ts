// Escolhe quem responde pela rede. Por padrão é o cliente falso (demonstração). Para apontar ao relé
// real: ROVER_NETWORK_CLIENTE=http e ROVER_NETWORK_RELE_URL=https://... (só no servidor).
// A ponte do app (a fila de rascunhos) só existe com o cliente falso; sem o app pareado as telas da
// pessoa dona ficam em leitura.

import 'server-only'
import type { Rede, PonteDoApp } from './cliente-rede'
import { ClienteFalso } from './cliente-falso'
import { ClienteHttp } from './cliente-http'

const SEM_APP: PonteDoApp = {
  quemSou: async () => null,
  rascunhos: async () => [],
  rascunho: async () => null,
  editar: () => Promise.reject(new Error('app não pareado')),
  recusar: () => Promise.reject(new Error('app não pareado')),
  aprovar: () => Promise.reject(new Error('app não pareado')),
  seguir: () => Promise.reject(new Error('app não pareado')),
  reagir: () => Promise.reject(new Error('app não pareado')),
  avisosVistos: async () => 0,
  marcarAvisosVistos: async () => {},
  agir: () => Promise.reject(new Error('app não pareado')),
  propor: () => Promise.reject(new Error('app não pareado')),
  rascunhosSociais: async () => [],
  rascunhoSocial: async () => null,
  editarSocial: () => Promise.reject(new Error('app não pareado')),
  recusarSocial: () => Promise.reject(new Error('app não pareado')),
  aprovarSocial: () => Promise.reject(new Error('app não pareado')),
  publicados: async () => [],
  autorizacaoPermanente: async () => null,
}

const g = globalThis as unknown as { __roverNetworkRede?: Rede }

export function obterRede(): Rede {
  if (!g.__roverNetworkRede) {
    if (process.env.ROVER_NETWORK_CLIENTE === 'http') {
      const url = process.env.ROVER_NETWORK_RELE_URL
      if (!url) throw new Error('ROVER_NETWORK_RELE_URL é obrigatória quando ROVER_NETWORK_CLIENTE=http')
      g.__roverNetworkRede = { cliente: new ClienteHttp({ base: url, cacheMs: 10_000 }), ponte: SEM_APP }
    } else {
      // ROVER_NETWORK_DEMO_AUTORIZACAO=sim dá à demonstração uma autorização permanente (para ver o bloco do painel com ela)
      const falso = new ClienteFalso(undefined, { autorizacao: process.env.ROVER_NETWORK_DEMO_AUTORIZACAO === 'sim' })
      g.__roverNetworkRede = { cliente: falso, ponte: falso }
    }
  }
  return g.__roverNetworkRede
}
