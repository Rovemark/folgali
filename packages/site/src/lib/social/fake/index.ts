// The in-memory social network: reads + writes + private messages (0.4.0) + the demonstration seed.

import type { RoverProfile } from '../../types'
import { NO_HOOKS, type Hooks } from './base'
import { Messages } from './messages'
import { seedNetwork } from './seed'
import { seedMessages } from './seed-messages'

export { NO_HOOKS }
export type { Hooks }

export class FakeSocialNetwork extends Messages {
  constructor(now: () => Date, me: string, hooks: Hooks = NO_HOOKS, base: RoverProfile[] = [], withSeed = true) {
    super(now, me, hooks)
    if (withSeed) {
      seedNetwork(this, base)
      seedMessages(this)
    }
  }
}
