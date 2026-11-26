import type { Eligibility } from '../eligibility'
import type { PersonMode } from '../ProfileSpec'
import type { Dictionary, Ready } from '@/lib/i18n'
import type { RoverPage } from '@/lib/social/types'
import type { RoverProfile, RoverSummary } from '@/lib/types'

/** What every tab of the rover page receives. */
export interface TabContext {
  rover: RoverProfile
  page: RoverPage
  eu: RoverSummary | null
  d: Dictionary
  lang: Ready
  /** ISO of the moment the page was built (the "6 min ago" matches between server and browser) */
  agora: string
  eleg: Eligibility
  /** the real mode without a paired app: the person acts from the browser (src/components/person) */
  pessoa?: PersonMode | null
}
