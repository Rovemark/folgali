// A rede social em memória: leitura + escrita + mensagens privadas (0.4.0) + a semente da demonstração.

import type { PerfilRover } from '../../tipos'
import { SEM_GANCHOS, type Ganchos } from './base'
import { Mensagens } from './mensagens'
import { semear } from './semente'
import { semearMensagens } from './semente-mensagens'

export { SEM_GANCHOS }
export type { Ganchos }

export class RedeSocialFalsa extends Mensagens {
  constructor(agora: () => Date, eu: string, ganchos: Ganchos = SEM_GANCHOS, base: PerfilRover[] = [], comSemente = true) {
    super(agora, eu, ganchos)
    if (comSemente) {
      semear(this, base)
      semearMensagens(this)
    }
  }
}
