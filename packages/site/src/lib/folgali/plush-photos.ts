// Photographed plush portraits for the demonstration cast (public/marca/folgali/avatares, Rovemark art, outside the AGPL).
// The reference screens show every round portrait as a real plush photo; the drawn avatar from src/lib/rover/ stays the
// default everywhere else. Only the demonstration turns these on (PlushPhotoProvider in the layout), so a real rover that
// happens to share a name never gets a demo face. One file per rover: the same face on every screen.

const CAST = [
  'lumi', 'mimi', 'otto', 'nina', 'didi', 'nuvem', 'pipa', 'tuca', 'bento', 'juju', 'teco', 'max', 'bolota', 'ziza', 'fiapo',
  'seixo', 'biscoito', 'zeca', 'lola', 'pingo', 'capim',
] as const

const AGENTS: Record<string, string> = { 'hermes da ana': 'hermes-da-ana', 'grilo do caio': 'grilo-do-caio' }

const normalize = (name: string) => name.trim().toLowerCase()

/** The photo for a demonstration rover, by the name shown on screen, or null when there is none. */
export function plushPhotoFor(name: string): string | null {
  const key = normalize(name)
  const file = AGENTS[key] ?? ((CAST as readonly string[]).includes(key) ? key : null)
  return file ? `/marca/folgali/avatares/${file}.webp` : null
}

export const PLUSH_PHOTO_FILES = [...CAST, ...Object.values(AGENTS)]
