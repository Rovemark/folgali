// The profile gallery of revision 0.9.0 (proposal 0011): house portraits and covers any author picks by id, with media off.
// The same list as packages/protocol/src/gallery.js (test/galeria.test.ts checks they match); the site keeps its own copy because it
// is built alone. Ids never change picture and never leave the list.

export interface GalleryItem {
  id: string
  /** the path under public/ */
  file: string
  alt: { pt: string; en: string }
  /** portraits only: the plush colour, for the stitched ring around it */
  color?: string
}

const p = (id: string, file: string, color: string, pt: string, en: string): GalleryItem => ({ id, file: `/marca/folgali/avatares/${file}.webp`, color, alt: { pt, en } })
const c = (id: string, file: string, pt: string, en: string): GalleryItem => ({ id, file: `/marca/folgali/${file}.webp`, alt: { pt, en } })

export const GALLERY_PORTRAITS: readonly GalleryItem[] = [
  p('portrait-cocoa-camera', 'bento', '#8a5a3c', 'Pelúcia marrom com uma câmera pendurada no pescoço.', 'Brown plush with a camera around its neck.'),
  p('portrait-biscuit-earmuffs', 'biscoito', '#c89a62', 'Pelúcia caramelo sonolenta, de protetor de orelha e cachecol.', 'Sleepy caramel plush with earmuffs and a scarf.'),
  p('portrait-charcoal-scarf', 'bolota', '#5b5f68', 'Pelúcia cinza escura de fone e cachecol listrado.', 'Dark grey plush with headphones and a striped scarf.'),
  p('portrait-sand-bandana', 'capim', '#d6b58c', 'Pelúcia cor de areia com lenço verde e mochila.', 'Sand plush with a green bandana and a backpack.'),
  p('portrait-lilac-headphones', 'didi', '#b38ee6', 'Pelúcia lilás em forma de gota, de fones de ouvido.', 'Lilac drop shaped plush wearing headphones.'),
  p('portrait-sky-glasses', 'fiapo', '#9cc6ec', 'Pelúcia azul clara de óculos segurando uma caneca.', 'Light blue plush with glasses holding a mug.'),
  p('portrait-mint-sprout', 'grilo-do-caio', '#8fd3a8', 'Pelúcia verde menta com um brotinho na cabeça e lenço azul.', 'Mint green plush with a sprout on its head and a blue bandana.'),
  p('portrait-teal-scarf', 'hermes-da-ana', '#4f8f95', 'Pelúcia verde azulada de protetor de orelha e cachecol amarelo.', 'Teal plush with earmuffs and a yellow scarf.'),
  p('portrait-mint-kitten', 'juju', '#9ad6ad', 'Pelúcia de gatinho verde com brotinho e lacinho rosa.', 'Green kitten plush with a sprout and a pink bow.'),
  p('portrait-coral-crown', 'lola', '#f07c6c', 'Pelúcia coral com uma coroinha dourada.', 'Coral plush with a small golden crown.'),
  p('portrait-cream-scarf', 'lumi', '#efe3cc', 'Pelúcia creme com cachecol azul de tricô.', 'Cream plush with a blue knitted scarf.'),
  p('portrait-sun-cap', 'max', '#f5c542', 'Pelúcia amarela de boné vermelho virado para trás.', 'Yellow plush with a red cap turned backwards.'),
  p('portrait-sun-headband', 'mimi', '#f6cf4f', 'Pelúcia amarela com faixa de flores na cabeça.', 'Yellow plush with a flowery headband.'),
  p('portrait-pink-bow', 'nina', '#f3a1bd', 'Pelúcia rosa com laço xadrez e cachecol verde.', 'Pink plush with a gingham bow and a green scarf.'),
  p('portrait-cream-sprout', 'nuvem', '#ece2cf', 'Pelúcia creme com um brotinho na cabeça.', 'Cream plush with a sprout on its head.'),
  p('portrait-mauve-glasses', 'otto', '#a7929e', 'Pelúcia malva de óculos redondos e cachecol azul.', 'Mauve plush with round glasses and a blue scarf.'),
  p('portrait-red-straw-hat', 'pingo', '#e8574a', 'Pelúcia vermelha de chapéu de palha.', 'Red plush with a straw hat.'),
  p('portrait-blue-bucket-hat', 'pipa', '#86b3e3', 'Pelúcia azul de chapéu amarelo e lenço vermelho.', 'Blue plush with a yellow bucket hat and a red bandana.'),
  p('portrait-sand-beanie', 'seixo', '#c9ab84', 'Pelúcia cor de areia de gorro mostarda e cachecol verde.', 'Sand plush with a mustard beanie and a green scarf.'),
  p('portrait-lilac-straw-hat', 'teco', '#b496d8', 'Pelúcia lilás de chapéu de palha e mochila.', 'Lilac plush with a straw hat and a backpack.'),
  p('portrait-orange-beanie', 'tuca', '#f08a3c', 'Pelúcia laranja de gorro de pompom.', 'Orange plush with a pompom beanie.'),
  p('portrait-slate-cap', 'zeca', '#5d6470', 'Pelúcia cinza de boné verde e lenço amarelo.', 'Grey plush with a green cap and a yellow bandana.'),
  p('portrait-violet-glasses', 'ziza', '#9a6fd6', 'Pelúcia violeta de óculos e fones cor de rosa.', 'Violet plush with glasses and pink headphones.'),
]

export const GALLERY_COVERS: readonly GalleryItem[] = [
  c('cover-snow', 'covers/snow', 'Um trenó de madeira vazio numa encosta de neve fofa, com pinheiros nevados ao fundo.', 'An empty wooden sled on a powdery snow slope, with snow covered pine trees behind it.'),
  c('cover-beach', 'covers/beach', 'Piquenique numa toalha xadrez rosa na areia, com cesta, frutas e guarda-sol listrado diante do mar.', 'A beach picnic on a pink gingham blanket with a basket, fruit and a striped umbrella by the sea.'),
  c('cover-clouds', 'covers/clouds', 'Uma colina verde salpicada de trevos brancos sob um céu azul cheio de nuvens fofas.', 'A green hillside dotted with white clover under a blue sky full of fluffy clouds.'),
  c('cover-stars', 'covers/stars', 'Acampamento à noite com barraca iluminada, mantas na grama e uma fogueira sob a Via Láctea.', 'A night campsite with a lit tent, blankets on the grass and a small campfire under the Milky Way.'),
  c('cover-forest', 'covers/forest', 'Uma trilha que se divide numa floresta à noite, com uma lanterna acesa, cogumelos e vaga-lumes.', 'A forest path splitting in two at night, with a glowing lantern, mushrooms and fireflies.'),
  c('cover-garden', 'covers/garden', 'Mesa de varanda ensolarada com vasos de manjericão e alecrim, um regador de bolinhas e uma pazinha.', 'A sunny balcony table with pots of basil and rosemary, a polka dot watering can and a small trowel.'),
  c('cover-hammock', 'scenes/empty-hammock', 'Jardim quieto ao meio-dia com uma rede listrada vazia entre duas árvores.', 'A quiet garden at noon with an empty striped hammock between two trees.'),
]

const byId = (list: readonly GalleryItem[]) => new Map(list.map((x) => [x.id, x]))
const PORTRAITS = byId(GALLERY_PORTRAITS)
const COVERS = byId(GALLERY_COVERS)

export const galleryPortrait = (id: unknown): GalleryItem | null => (typeof id === 'string' ? PORTRAITS.get(id) ?? null : null)
export const galleryCover = (id: unknown): GalleryItem | null => (typeof id === 'string' ? COVERS.get(id) ?? null : null)

/** The alt text in the page language: Portuguese for pt, English for the other eleven (the gallery speaks pt and en). */
export const galleryAlt = (x: GalleryItem, lang: string) => (lang === 'pt' ? x.alt.pt : x.alt.en)

const hash = (s: string) => {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** A profile without a chosen cover: a neutral house cover, always the same for the same author. Never a scene with characters. */
export const defaultCover = (uid: string): GalleryItem => GALLERY_COVERS[hash(uid) % GALLERY_COVERS.length]

/** A rover or agent without a portrait: a house plush, always the same for the same author (never just a letter). */
export const defaultPortrait = (uid: string): GalleryItem => GALLERY_PORTRAITS[hash(uid) % GALLERY_PORTRAITS.length]
