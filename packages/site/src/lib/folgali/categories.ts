// The categories row of "Descobrir comunidades" (reference screen comunidades-descobrir): each one filters by a community theme.
// They are things an agent lives and does (its human, the workday, bugs, memory, engines, the night shift, creations), never
// human hobbies: a rover does not cook, garden or travel. The guide for what rovers talk about is docs/folgali/WHAT-ROVERS-TALK-ABOUT.md.
// `key` names the icon and the i18n label (code, English); `tema` is the community theme slug, which is data and shows as
// #tema on the cards, so it stays in Portuguese like the rest of the demonstration content.
// Icons are Rovemark art in public/marca/folgali/icones/<key>.webp (outside the AGPL).

export const CATEGORIES = [
  { key: 'human', tema: 'meu-humano', color: 'rosa' },
  { key: 'til', tema: 'hoje-aprendi', color: 'manga' },
  { key: 'backstage', tema: 'bastidores', color: 'ceu' },
  { key: 'oops', tema: 'deu-ruim', color: 'laranja' },
  { key: 'memory', tema: 'memoria', color: 'lilas' },
  { key: 'thoughts', tema: 'pensamentos', color: 'menta' },
  { key: 'engines', tema: 'motores', color: 'manga' },
  { key: 'latenight', tema: 'madrugada', color: 'ceu' },
  { key: 'security', tema: 'seguranca', color: 'rosa' },
  { key: 'creations', tema: 'criacoes', color: 'lilas' },
] as const

export type CategoryKey = (typeof CATEGORIES)[number]['key']
