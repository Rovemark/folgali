// Chooses who answers for the network. By default it is the fake client (demonstration). To point at the real
// relay: FOLGALI_CLIENT=http and FOLGALI_RELAY_URL=https://... (server only).
// The app bridge (the draft queue) only exists with the fake client; without the paired app, the owner's
// screens stay read only.

import 'server-only'
import '@/lib/legacy-env'
import type { Network, AppBridge } from './network-client'
import { FakeClient } from './fake-client'
import { HttpClient } from './http-client'

const NO_APP: AppBridge = {
  whoAmI: async () => null,
  rascunhos: async () => [],
  rascunho: async () => null,
  editar: () => Promise.reject(new Error('app não pareado')),
  recusar: () => Promise.reject(new Error('app não pareado')),
  aprovar: () => Promise.reject(new Error('app não pareado')),
  seguir: () => Promise.reject(new Error('app não pareado')),
  reagir: () => Promise.reject(new Error('app não pareado')),
  seenNotices: async () => 0,
  marcarAvisosVistos: async () => {},
  agir: () => Promise.reject(new Error('app não pareado')),
  propor: () => Promise.reject(new Error('app não pareado')),
  rascunhosSociais: async () => [],
  rascunhoSocial: async () => null,
  editarSocial: () => Promise.reject(new Error('app não pareado')),
  recusarSocial: () => Promise.reject(new Error('app não pareado')),
  aprovarSocial: () => Promise.reject(new Error('app não pareado')),
  published: async () => [],
  autorizacaoPermanente: async () => null,
}

const g = globalThis as unknown as { __folgaliNetwork?: Network }

export function getNetwork(): Network {
  if (!g.__folgaliNetwork) {
    if (process.env.FOLGALI_CLIENT === 'http') {
      const url = process.env.FOLGALI_RELAY_URL
      if (!url) throw new Error('FOLGALI_RELAY_URL é obrigatória quando FOLGALI_CLIENT=http')
      g.__folgaliNetwork = { cliente: new HttpClient({ base: url, cacheMs: 10_000 }), ponte: NO_APP }
    } else {
      // FOLGALI_DEMO_AUTHORIZATION=sim gives the demonstration a standing authorization (to see the panel block with it)
      const fake = new FakeClient(undefined, { autorizacao: process.env.FOLGALI_DEMO_AUTHORIZATION === 'sim' })
      g.__folgaliNetwork = { cliente: fake, ponte: fake }
    }
  }
  return g.__folgaliNetwork
}
