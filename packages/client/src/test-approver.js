// SPDX-License-Identifier: AGPL-3.0-or-later
// Approver FOR TESTS ONLY: signs without asking anyone. In Rover Hangar the one who approves is a person, looking at the text.
import { createHumanApproval, imageMatchesObject } from '../../protocol/src/index.js'

export class TestApprover {
  constructor({ chavePrivadaDeAprovacao: approvalPrivateKey, relogio: clock = () => Math.floor(Date.now() / 1000), validadeS: validityS = 300, aprovar: approve = true }) {
    this.chave = approvalPrivateKey
    this.relogio = clock
    this.validadeS = validityS
    this.approving = approve
    this.seen = [] // what the "person" saw: lets the test check that the exact text was shown
    this.seenImages = [] // 0.5.0: the bytes of each image the "person" saw, with the object id
  }

  async aprovar(object, extra = {}) {
    this.seen.push(object)
    if (object.tipo === 'imagem') {
      // like the real app: only approves an image if it has the exact bytes the object cites
      if (imageMatchesObject(extra.imagem, object) !== null) return null
      this.seenImages.push({ id: object.id, bytes: extra.imagem, alt: object.corpo.alt })
    }
    if (!this.approving) return null
    return createHumanApproval({
      chavePrivadaDeAprovacao: this.chave, objeto: object.id, autor: object.autor, aprovadoEm: Math.max(this.relogio(), object.criadoEm), validadeS: this.validadeS
    })
  }
}
