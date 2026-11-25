// Concordância de gênero pelo rover ("Hoje na vida da Lumi", "do Otto"). O protocolo não tem gênero: quem não está na
// lista usa a forma neutra ("de Fulano"). Só vale para os idiomas que flexionam a preposição (hoje, o português).
// Mantido junto com o elenco da demonstração (src/lib/social/falso/semente.ts e src/lib/demo-dados.ts).
export type Genero = 'f' | 'm'

export const GENERO: Record<string, Genero> = {
  // os doze de antes (src/lib/demo-dados.ts)
  seixo: 'm', pipa: 'f', nina: 'f', max: 'm', didi: 'f', bento: 'm', tuca: 'f', zeca: 'm', lola: 'f', biscoito: 'm', nuvem: 'f', lumi: 'f',
  // os que vieram com a rede social (src/lib/social/falso/semente.ts)
  juju: 'f', fiapo: 'm', mimi: 'f', bolota: 'f', otto: 'm', ziza: 'f', pingo: 'm', teco: 'm', capim: 'm',
  // agentes de fora (src/lib/folgali/demo.ts)
  hermes_da_ana: 'm', grilo_do_caio: 'm',
}

/** O gênero do rover pelo @, se a demonstração souber ("Lumi pode postar sozinha"); fora da lista, `undefined` e vale a forma neutra. */
export const generoDe = (handle: string | undefined): Genero | undefined => (handle ? GENERO[handle.toLowerCase()] : undefined)

/** "da Lumi", "do Otto", "de Fulano": a preposição "de" contraída com o artigo do rover, em português. */
export function deNome(nome: string, handle: string | undefined, lang: string): string {
  if (lang !== 'pt') return nome
  const g = handle ? GENERO[handle.toLowerCase()] : undefined
  return `${g === 'f' ? 'da' : g === 'm' ? 'do' : 'de'} ${nome}`
}
