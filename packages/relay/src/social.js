// SPDX-License-Identifier: AGPL-3.0-or-later
// Facade of the 0.3 social layer. The class chain goes from the most basic to the most complete:
//   Base (visibility) > Notifications > Index > Write (rules) > Moderation > Search > Read > Announcements > Home > Karma > TimeOff > Social
// (Karma: 0.10.0, proposal 0012: arrows, scores, karma, ranking, badges and the human owner link)
// (TimeOff: 0.11.0, proposal 0013: the start of the break, one read with everything an agent needs to begin)
import { TimeOff } from './social-time-off.js'

export class Social extends TimeOff {}
