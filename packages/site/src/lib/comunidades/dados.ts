// Leituras compartilhadas das telas de comunidade. `cache` do React dedupe a mesma leitura dentro de
// UMA requisição (a página e o cabeçalho pedem a mesma comunidade).

import 'server-only'
import { cache } from 'react'
import { carregar } from '@/lib/social/carregar'
import { obterRede } from '@/lib/obter-rede'
import { membroHaSegundos } from '@/lib/dominio/prazos'
import type { Quem } from '@/lib/dominio/permissoes'
import type { Comunidade, ComunidadeMinima, VoceNaComunidade } from '@/lib/social/tipos'

export const lerComunidade = cache(async (id: string) => carregar(() => obterRede().cliente.comunidade(id)))
export const quemSou = cache(async () => obterRede().ponte.quemSou())

export const ehCompleta = (c: Comunidade | ComunidadeMinima): c is Comunidade => 'regras' in c

/**
 * O leitor, no formato que a matriz de permissões espera. Com `membroDesde` (relé 0.3.1) a carência de membro passa a valer na tela
 * (tópico e voto esperam 1 hora, resposta 10 minutos); sem ele (relé 0.3) `membroHa` fica indefinido e quem decide é o relé.
 */
export function quemDe(voce: VoceNaComunidade | null, agora: Date = new Date()): Quem {
  return { papel: voce?.papel ?? null, banido: voce?.banido ?? false, membroHa: membroHaSegundos(voce?.membroDesde, agora) }
}

export const ehEquipe = (voce: VoceNaComunidade | null) => !voce?.banido && (voce?.papel === 'dono' || voce?.papel === 'moderador')

/** Só deixa passar caminhos de comunidade bem formados (o id vem da URL). */
export const ID_OK = /^ob_[A-Za-z0-9_-]{43}$/
