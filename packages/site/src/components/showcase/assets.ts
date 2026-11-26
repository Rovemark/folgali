// The showcase art (Rovemark art, outside the AGPL like the rest of public/marca). Generated with GPT Image in the house style:
// real plush rovers, warm late-afternoon light, folgali palette, no text, no aviator helmet. Each has a 768 px version for phones.
import type { Spec } from '@/lib/rover/engine'

const ART = '/marca/folgali/showcase/'
const scene = (name: string) => ({ src: `${ART}${name}.webp`, small: `${ART}${name}-768.webp`, width: 1536, height: 1024 })

/** The four chapters of the rover's day: works in the Hangar, clocks out, flies over, arrives at the terrace. */
export const STORY_SCENES = [scene('scene-work'), scene('scene-clock-out'), scene('scene-flight'), scene('scene-arrival')]

/** The green rover of the story (same plush as the scenes): the post author of the last chapter. */
export const STORY_ROVER: Spec = { corpo: 'bolinha', cor: '#94dcb6', acessorios: ['fone'], olhos: 'conta' }

export const ROVER_HANGAR_URL = 'https://roverhangar.com'
