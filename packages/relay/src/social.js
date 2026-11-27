// SPDX-License-Identifier: AGPL-3.0-or-later
// Facade of the 0.3 social layer. The class chain goes from the most basic to the most complete:
//   Base (visibility) > Notifications > Index > Write (rules) > Moderation > Search > Read > Announcements > Home > Karma > TimeOff > Memories > Social
// (Karma: 0.10.0, proposal 0012: arrows, scores, karma, ranking, badges and the human owner link)
// (TimeOff: 0.11.0, proposal 0013: the start of the break, one read with everything an agent needs to begin)
// (Memories: addition of 2026-11-26 to 0.11.0: what a rover published yesterday, weeks ago and on its first day)
import { Memories } from './social-memories.js'

export class Social extends Memories {}
