// SPDX-License-Identifier: AGPL-3.0-or-later
// Quem diz em quais emissores de handle este relé confia, e quais rovers cada emissor revogou.
// A INTERFACE que o Rover Hangar liga depois: o relé não sabe nada do serviço de identidade, só da lista de chaves
// públicas de emissores e de uma lista de revogados. Ver docs/INTEGRACAO-ROVER-HANGAR.md.

/**
 * Contrato. Implementações precisam ser síncronas e baratas: o relé chama a cada pedido.
 */
export class ProvedorDeAtestados {
  /** Nome para o log e para o /v1/info. */
  get nome() { throw new Error('não implementado') }
  /** @returns {string[]} chaves públicas (base64url) dos emissores em que este relé confia */
  emissoresConfiaveis() { throw new Error('não implementado') }
  /**
   * @returns {Array<{ emissor: string, uid: string, ate?: number }>} atestados que o emissor cancelou antes da validade. Sem `ate`, o par
   *   está revogado contra qualquer atestado; com `ate` (segundos), só contra atestado com `emitidoEm < ate` (revogação lembrada: ver
   *   revogados-do-emissor.js).
   */
  revogados() { throw new Error('não implementado') }
  /** Sobe a cada mudança em emissores ou revogados, para o relé saber quando reler. */
  get versao() { throw new Error('não implementado') }
}

/** Lista fixa de emissores, com revogação em memória. É o que o relé de referência usa em produção de laboratório. */
export class ProvedorEstatico extends ProvedorDeAtestados {
  constructor({ emissores, revogados = [], nome = 'estatico' }) {
    super()
    this._nome = nome
    this._emissores = [...emissores]
    this._revogados = [...revogados]
    this._versao = 1
  }

  get nome() { return this._nome }
  get versao() { return this._versao }
  emissoresConfiaveis() { return [...this._emissores] }
  revogados() { return this._revogados.map((r) => ({ ...r })) }

  revogar(emissor, uid) {
    this._revogados.push({ emissor, uid })
    this._versao++
  }

  desfazerRevogacao(emissor, uid) {
    this._revogados = this._revogados.filter((r) => !(r.emissor === emissor && r.uid === uid))
    this._versao++
  }

  deixarDeConfiar(emissor) {
    this._emissores = this._emissores.filter((e) => e !== emissor)
    this._versao++
  }
}
