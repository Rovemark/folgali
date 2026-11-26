// SPDX-License-Identifier: AGPL-3.0-or-later
// Revision 0.9.0 (proposal 0011): the profile gallery. Ready-made portraits and covers from the house, which any author picks by id in
// the `perfil` object (`retrato: { galeria }`, `capa: { galeria }`), without uploading any image. It works with media off.
// The ids are stable and in English kebab-case: a published id never changes image and never leaves the list (that would break old profiles).
// The images are Rovemark artwork (packages/site/public/marca), outside the AGPL; the relay only stores and returns the id.

export const GALLERY_VERSION = 1

/** Where the images live when the operator does not set another base (`RELAY_GALLERY_BASE`). */
export const GALLERY_BASE = 'https://folgali.com'

const r = (id, file, pt, en) => Object.freeze({ id, arquivo: `/marca/folgali/avatares/${file}.webp`, alt: Object.freeze({ pt, en }) })
const c = (id, file, pt, en) => Object.freeze({ id, arquivo: `/marca/folgali/${file}.webp`, alt: Object.freeze({ pt, en }) })

/** Plush portraits (none with the aviator helmet, which belongs to Luna only). */
export const GALLERY_PORTRAITS = Object.freeze([
  r('portrait-cocoa-camera', 'bento', 'Pelúcia marrom com uma câmera pendurada no pescoço.', 'Brown plush with a camera around its neck.'),
  r('portrait-biscuit-earmuffs', 'biscoito', 'Pelúcia caramelo sonolenta, de protetor de orelha e cachecol.', 'Sleepy caramel plush with earmuffs and a scarf.'),
  r('portrait-charcoal-scarf', 'bolota', 'Pelúcia cinza escura de fone e cachecol listrado.', 'Dark grey plush with headphones and a striped scarf.'),
  r('portrait-sand-bandana', 'capim', 'Pelúcia cor de areia com lenço verde e mochila.', 'Sand plush with a green bandana and a backpack.'),
  r('portrait-lilac-headphones', 'didi', 'Pelúcia lilás em forma de gota, de fones de ouvido.', 'Lilac drop shaped plush wearing headphones.'),
  r('portrait-sky-glasses', 'fiapo', 'Pelúcia azul clara de óculos segurando uma caneca.', 'Light blue plush with glasses holding a mug.'),
  r('portrait-mint-sprout', 'grilo-do-caio', 'Pelúcia verde menta com um brotinho na cabeça e lenço azul.', 'Mint green plush with a sprout on its head and a blue bandana.'),
  r('portrait-teal-scarf', 'hermes-da-ana', 'Pelúcia verde azulada de protetor de orelha e cachecol amarelo.', 'Teal plush with earmuffs and a yellow scarf.'),
  r('portrait-mint-kitten', 'juju', 'Pelúcia de gatinho verde com brotinho e lacinho rosa.', 'Green kitten plush with a sprout and a pink bow.'),
  r('portrait-coral-crown', 'lola', 'Pelúcia coral com uma coroinha dourada.', 'Coral plush with a small golden crown.'),
  r('portrait-cream-scarf', 'lumi', 'Pelúcia creme com cachecol azul de tricô.', 'Cream plush with a blue knitted scarf.'),
  r('portrait-sun-cap', 'max', 'Pelúcia amarela de boné vermelho virado para trás.', 'Yellow plush with a red cap turned backwards.'),
  r('portrait-sun-headband', 'mimi', 'Pelúcia amarela com faixa de flores na cabeça.', 'Yellow plush with a flowery headband.'),
  r('portrait-pink-bow', 'nina', 'Pelúcia rosa com laço xadrez e cachecol verde.', 'Pink plush with a gingham bow and a green scarf.'),
  r('portrait-cream-sprout', 'nuvem', 'Pelúcia creme com um brotinho na cabeça.', 'Cream plush with a sprout on its head.'),
  r('portrait-mauve-glasses', 'otto', 'Pelúcia malva de óculos redondos e cachecol azul.', 'Mauve plush with round glasses and a blue scarf.'),
  r('portrait-red-straw-hat', 'pingo', 'Pelúcia vermelha de chapéu de palha.', 'Red plush with a straw hat.'),
  r('portrait-blue-bucket-hat', 'pipa', 'Pelúcia azul de chapéu amarelo e lenço vermelho.', 'Blue plush with a yellow bucket hat and a red bandana.'),
  r('portrait-sand-beanie', 'seixo', 'Pelúcia cor de areia de gorro mostarda e cachecol verde.', 'Sand plush with a mustard beanie and a green scarf.'),
  r('portrait-lilac-straw-hat', 'teco', 'Pelúcia lilás de chapéu de palha e mochila.', 'Lilac plush with a straw hat and a backpack.'),
  r('portrait-orange-beanie', 'tuca', 'Pelúcia laranja de gorro de pompom.', 'Orange plush with a pompom beanie.'),
  r('portrait-slate-cap', 'zeca', 'Pelúcia cinza de boné verde e lenço amarelo.', 'Grey plush with a green cap and a yellow bandana.'),
  r('portrait-violet-glasses', 'ziza', 'Pelúcia violeta de óculos e fones cor de rosa.', 'Violet plush with glasses and pink headphones.')
])

/** Covers without a character: neutral scenes from the house. */
export const GALLERY_COVERS = Object.freeze([
  c('cover-snow', 'covers/snow', 'Um trenó de madeira vazio numa encosta de neve fofa, com pinheiros nevados ao fundo.', 'An empty wooden sled on a powdery snow slope, with snow covered pine trees behind it.'),
  c('cover-beach', 'covers/beach', 'Piquenique numa toalha xadrez rosa na areia, com cesta, frutas e guarda-sol listrado diante do mar.', 'A beach picnic on a pink gingham blanket with a basket, fruit and a striped umbrella by the sea.'),
  c('cover-clouds', 'covers/clouds', 'Uma colina verde salpicada de trevos brancos sob um céu azul cheio de nuvens fofas.', 'A green hillside dotted with white clover under a blue sky full of fluffy clouds.'),
  c('cover-stars', 'covers/stars', 'Acampamento à noite com barraca iluminada, mantas na grama e uma fogueira sob a Via Láctea.', 'A night campsite with a lit tent, blankets on the grass and a small campfire under the Milky Way.'),
  c('cover-forest', 'covers/forest', 'Uma trilha que se divide numa floresta à noite, com uma lanterna acesa, cogumelos e vaga-lumes.', 'A forest path splitting in two at night, with a glowing lantern, mushrooms and fireflies.'),
  c('cover-garden', 'covers/garden', 'Mesa de varanda ensolarada com vasos de manjericão e alecrim, um regador de bolinhas e uma pazinha.', 'A sunny balcony table with pots of basil and rosemary, a polka dot watering can and a small trowel.'),
  c('cover-hammock', 'scenes/empty-hammock', 'Jardim quieto ao meio-dia com uma rede listrada vazia entre duas árvores.', 'A quiet garden at noon with an empty striped hammock between two trees.')
])

export const PORTRAIT_IDS = Object.freeze(GALLERY_PORTRAITS.map((x) => x.id))
export const COVER_IDS = Object.freeze(GALLERY_COVERS.map((x) => x.id))

/** The response of `GET /v1/galeria`: `{ versao, retratos: [{ id, url, alt }], capas: [...] }`, with absolute URLs. */
export function publicGallery(base = GALLERY_BASE) {
  const root = String(base).replace(/\/+$/, '')
  const item = (x) => ({ id: x.id, url: `${root}${x.arquivo}`, alt: { pt: x.alt.pt, en: x.alt.en } })
  return { versao: GALLERY_VERSION, retratos: GALLERY_PORTRAITS.map(item), capas: GALLERY_COVERS.map(item) }
}
