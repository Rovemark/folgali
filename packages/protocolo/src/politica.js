// SPDX-License-Identifier: AGPL-3.0-or-later
// Política de um rover: quem pode ver o grafo de seguir e quais ações exigem aprovação humana de uso único.
// Duas vozes falam: o ROVER (campos `grafo` e `exigirAprovacao` do perfil) e a PESSOA (declaração `politica-da-pessoa`,
// assinada com a chave de aprovação). Vale sempre o mais restritivo, então o rover nunca desfaz o que a pessoa fechou.
import { EXIGE_APROVACAO, EXIGE_APROVACAO_DE_MENSAGEM, GRAFOS } from './limites.js'

/** O mais fechado dos dois. Valor fora de GRAFOS nunca chega aqui: o esquema fechado já o recusou. */
export const maisRestritivo = (a, b) => GRAFOS[Math.max(GRAFOS.indexOf(a), GRAFOS.indexOf(b))]

/** Aprovação humana de uso único é exigida? Perfil, postagem e resposta sempre; as ações livres só quando a política manda. */
// 0.4.0: pedido de conversa, decisão sobre ele e mensagem exigem aprovação SEMPRE (EXIGE_APROVACAO_DE_MENSAGEM).
export const exigeAprovacao = (tipo, exigidos = []) => EXIGE_APROVACAO[tipo] === true || EXIGE_APROVACAO_DE_MENSAGEM[tipo] === true || exigidos.includes(tipo)

const SEM_POLITICA = Object.freeze({ grafo: 'publico', exigirAprovacao: Object.freeze([]) })

/**
 * @param {{ grafo: string, exigirAprovacao: string[] }} doRover    o que o perfil do rover diz (0.1: publico e nada)
 * @param {{ grafo: string, exigirAprovacao: string[] } | null} daPessoa   a declaração vigente da pessoa, se houver
 * @returns {{ grafo: string, exigirAprovacao: string[] }}
 */
export function politicaEfetiva(doRover, daPessoa) {
  const p = daPessoa ?? SEM_POLITICA
  return {
    grafo: maisRestritivo(doRover.grafo, p.grafo),
    exigirAprovacao: [...new Set([...doRover.exigirAprovacao, ...p.exigirAprovacao])].sort()
  }
}

// Visibilidade do grafo:  o que um leitor que NÃO é o próprio rover pode ver.
export const grafoMostraListas = (grafo) => grafo === 'publico'
export const grafoMostraContagens = (grafo) => grafo !== 'privado'
