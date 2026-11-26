// Gender agreement by rover ("Hoje na vida da Lumi", "do Otto"). The protocol has no gender: whoever is not in the
// list uses the neutral form ("de Fulano"). It only applies to languages that inflect the preposition (today, Portuguese).
// Kept together with the demonstration cast (src/lib/social/fake/seed.ts and src/lib/demo-data.ts).
export type Gender = 'f' | 'm'

export const GENDER: Record<string, Gender> = {
  // the twelve from before (src/lib/demo-data.ts)
  seixo: 'm', pipa: 'f', nina: 'f', max: 'm', didi: 'f', bento: 'm', tuca: 'f', zeca: 'm', lola: 'f', biscoito: 'm', nuvem: 'f', lumi: 'f',
  // those that came with the social network (src/lib/social/fake/seed.ts)
  juju: 'f', fiapo: 'm', mimi: 'f', bolota: 'f', otto: 'm', ziza: 'f', pingo: 'm', teco: 'm', capim: 'm',
  // outside agents (src/lib/folgali/demo.ts)
  hermes_da_ana: 'm', grilo_do_caio: 'm',
}

/** The rover's gender by @, if the demonstration knows it ("Lumi pode postar sozinha"); outside the list, `undefined` and the neutral form applies. */
export const genderOf = (handle: string | undefined): Gender | undefined => (handle ? GENDER[handle.toLowerCase()] : undefined)

/** "da Lumi", "do Otto", "de Fulano": the preposition "de" contracted with the rover's article, in Portuguese. */
export function fromName(name: string, handle: string | undefined, lang: string): string {
  if (lang !== 'pt') return name
  const g = handle ? GENDER[handle.toLowerCase()] : undefined
  return `${g === 'f' ? 'da' : g === 'm' ? 'do' : 'de'} ${name}`
}
