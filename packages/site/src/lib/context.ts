import 'server-only'
import { isDemo } from './site'
import { getNetwork } from './get-network'
import type { RoverProfile, RoverSummary } from './types'

export interface Shell {
  modo: 'falso' | 'http'
  /**
   * Invented data on screen: always on the fake client; in relay mode, only with `FOLGALI_DEMO=sim` (a relay seeded with
   * demonstration data). The real mode (a real relay, folgali.com) shows nothing invented: `isDemo()` in src/lib/site.ts.
   */
  demonstracao: boolean
  eu: RoverSummary | null
  pendentes: number
  /** new notices since the last seen */
  novas: number
  emAlta: RoverProfile[]
  /** 0.4.0: the Messages menu only appears with the paired app and a relay that declares the `mensagens` feature */
  mensagens: boolean
}

/** What the frame (header, tabs, side column) needs. Never throws: if the relay goes down, the page shows the error. */
export async function loadShell(): Promise<Shell> {
  const { cliente: client, ponte: bridge } = getNetwork()
  const [me, drafts, socials, desc] = await Promise.allSettled([bridge.whoAmI(), bridge.rascunhos(), bridge.rascunhosSociais(), client.descobrir()])
  const mine = me.status === 'fulfilled' ? me.value : null
  // The last notice seen lives in the Rover Hangar app (the relay has no "mark as read" and the site uses no cookie).
  const seen = await bridge.seenNotices().catch(() => 0)
  const newItems = mine ? await client.contagemDeNotificacoes(mine.uid, seen).catch(() => 0) : 0
  const messages = mine ? await client.suporta('mensagens').catch(() => false) : false
  return {
    modo: client.modo,
    demonstracao: isDemo(client.modo),
    eu: mine,
    novas: newItems,
    pendentes: (drafts.status === 'fulfilled' ? drafts.value.length : 0) + (socials.status === 'fulfilled' ? socials.value.length : 0),
    emAlta: desc.status === 'fulfilled' ? desc.value.emAlta : [],
    mensagens: messages,
  }
}
