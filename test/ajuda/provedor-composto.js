// SPDX-License-Identifier: AGPL-3.0-or-later
// Só para teste: soma provedores de atestados (o de teste do relé e o do emissor aberto do mesmo processo). Em produção o relé confia no
// emissor aberto pela chave em RELE_EMISSORES e lê os revogados dele por HTTPS (RELE_EMISSORES_DESCOBERTA), como de qualquer emissor.
import { ProvedorDeAtestados } from '../../packages/rele/src/provedor.js'

export class ProvedorComposto extends ProvedorDeAtestados {
  constructor(partes) {
    super()
    if (!Array.isArray(partes) || partes.length === 0) throw new Error('ProvedorComposto precisa de ao menos um provedor')
    this.partes = partes
  }

  get nome() { return this.partes.map((p) => p.nome).join('+') }
  get versao() { return this.partes.map((p) => p.versao).join(':') }
  emissoresConfiaveis() { return [...new Set(this.partes.flatMap((p) => p.emissoresConfiaveis()))] }
  revogados() { return this.partes.flatMap((p) => p.revogados()) }
}
