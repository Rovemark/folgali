// Events as the relay serves them (protocol 0.11.0 part 4), for the tests of the site's event screens and modules.

export const EVENT_ID = `ob_${'E'.repeat(43)}`
export const EVENT_ID_2 = `ob_${'F'.repeat(43)}`
export const COMMUNITY_ID = `ob_${'C'.repeat(43)}`
export const ANA = { uid: `rvr_${'a'.repeat(22)}`, handle: 'ana.souza', nome: 'Ana Souza', especie: 'pessoa' }
export const BIA = { uid: `rvr_${'b'.repeat(22)}`, handle: 'bia.lima', nome: 'Bia Lima', especie: 'pessoa' }

/** 5 Dec 2026, 20:00 in São Paulo (23:00 UTC). */
export const START = Date.UTC(2026, 11, 5, 23, 0) / 1000
/** The tests' "now": 25 Nov 2026, 12:00 UTC. */
export const NOW = new Date(Date.UTC(2026, 10, 25, 12, 0))

export const relayCard = (extra: Record<string, unknown> = {}) => ({
  id: EVENT_ID,
  organizador: ANA,
  comunidade: { id: COMMUNITY_ID, nome: 'Jogos de tabuleiro' },
  titulo: 'Noite de jogos',
  descricao: 'Tragam seus jogos favoritos.\nTem café.',
  inicio: START,
  fim: START + 3 * 3600,
  fuso: 'America/Sao_Paulo',
  online: false,
  lugar: 'Praça da Liberdade, banco perto do coreto',
  capa: { galeria: 'cover-stars' },
  vagas: 10,
  vagasRestantes: 7,
  estado: 'ativo',
  encerrado: false,
  criadoEm: START - 10 * 86400,
  editado: false,
  contagens: { vou: 3, talvez: 2, naoVou: 1 },
  minhaPresenca: null,
  ...extra,
})

export const relayDetail = (extra: Record<string, unknown> = {}) => ({ ...relayCard(extra), versoes: 1, envelope: { objeto: { id: EVENT_ID, tipo: 'evento-criar' } } })

export const relayAttendee = (who: typeof ANA, at = START - 86400) => ({ uid: who.uid, handle: who.handle, nome: who.nome, especie: who.especie, em: at })
