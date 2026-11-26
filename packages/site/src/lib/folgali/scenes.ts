// Art of the public front (home, doors, institutional pages, empty states, 404): plush rovers photographed at many hours and
// weathers, plus felt icons. Rovemark art in public/marca/folgali/scenes and /felt, outside the AGPL like the rest of public/marca.
// Generated with GPT Image through the Codex CLI on 25/11/2026; the originals and the prompts are not in the repository.
// No rover here wears an aviator helmet: only Luna, the logo mascot, does (docs/folgali/IDENTITY.md).
import type { Photo } from './demo'

const scene = (name: string, alt: string, width = 1280, height = 853): Photo => ({ src: `/marca/folgali/scenes/${name}.webp`, alt, largura: width, altura: height })
const square = (name: string, alt: string) => scene(name, alt, 1024, 1024)

/** Scene photos. The alt text is Portuguese (like FOTOS); pages that use them as decoration pass `alt=""`. */
export const SCENES = {
  heroSunrise: square('hero-sunrise', 'Nascer do sol com neblina no vale: a Nina enrolada numa manta, com uma caneca quente na varanda.'),
  heroSkate: square('hero-skate', 'Meio-dia numa praça de sol: o Max desce uma rampinha de skate e dois amigos torcem atrás.'),
  heroRainNight: square('hero-rain-night', 'Noite de chuva na rua: a Didi e o Bolota dividem um guarda-chuva transparente, com as vitrines refletidas nas poças.'),
  heroSnow: square('hero-snow', 'Manhã de neve no parque: a Pipa e o Teco montam um boneco de neve de cachecol.'),
  doorHangar: scene('door-hangar', 'Começo da noite: o Tuca sai do hangar azul com a marmita na mão e acena tchau.'),
  doorPeople: scene('door-people', 'À noite, na sala: uma mão segura o celular e a Juju, no braço do sofá, olha a tela.'),
  doorAgent: scene('door-agent', 'Meio-dia no jardim: um robozinho de metal aperta a mão do Grilo debaixo de um arco de flores.'),
  hangarWorkshop: scene('hangar-workshop', 'Fim da manhã no hangar: Otto, Ziza e Capim trabalham em mesinhas de madeira com notebooks.'),
  hangarClockOut: scene('hangar-clockout', 'Noite estrelada: Fiapo, Seixo e Zeca saem do hangar com lanterninhas e mochilas.'),
  howDiary: scene('how-diary', 'Manhã nublada na janela: a Lola escreve no caderninho, com uma xícara de chá ao lado.'),
  howFriends: scene('how-friends', 'Meio-dia num café de calçada: o Pingo conhece a Juju e o Capim, com três sucos na mesa.'),
  howCommunity: scene('how-community', 'Tarde numa horta comunitária: Tuca, Nina, Zeca e Biscoito em roda na grama, com violão e lanche.'),
  aboutGroup: scene('about-group', 'Manhã clara: foto em grupo de muitas pelúcias na escada de uma casinha azul.'),
  pressCamera: scene('press-camera', 'Num estúdio de fotografia, o Bento fotografa a Lola, com o flash disparando.'),
  safetyLighthouse: scene('safety-lighthouse', 'Noite de tempestade: o farol ilumina o mar e o Seixo olha pela janela lá no alto, protegido.'),
  guidesMap: scene('guides-map', 'Manhã de neblina na trilha: o Teco abre um mapa de papel junto de uma placa de madeira.'),
  helpBike: scene('help-bike', 'Tarde de sol numa rua arborizada: a Nina ajuda a Pipa a pôr a corrente da bicicleta no lugar.'),
  glossaryLibrary: scene('glossary-library', 'Tarde de chuva numa bibliotecazinha: o Otto e o Fiapo leem juntos numa poltrona.'),
  newsPostman: scene('news-postman', 'Nascer do sol numa cidadezinha: o Pingo pedala com uma cesta cheia de cartas e pacotes.'),
  transparencyGreenhouse: scene('transparency-greenhouse', 'Meio-dia numa estufa de vidro: a Juju e o Capim cuidam dos tomates e das ervas.'),
  protocolTinCan: scene('protocol-tincan', 'Fim de tarde entre duas casas na árvore: o Max e a Didi conversam por um telefone de lata.'),
  notFoundForest: scene('404-forest', 'Anoitecer numa floresta com vaga-lumes: o Biscoito, com uma lanterninha, numa bifurcação do caminho.'),
  developersRadio: scene('developers-radio', 'Madrugada na bancada: o Zeca e a Ziza montam um radinho com fios e componentes.'),
  sportsRain: scene('sports-rain', 'Futebol na chuva: Max, Grilo e Tuca correm atrás da bola espirrando água das poças.'),
  autumnWalk: scene('autumn-walk', 'Manhã de outono num parque de folhas laranja: a Mimi e o Bento caminham juntos.'),
  stargazing: scene('stargazing', 'Noite de acampamento no morro: Lumi, Nuvem e Didi deitados olhando a Via Láctea.'),
  claimMailbox: scene('claim-mailbox', 'Manhã no cais: o Hermes tira da caixa de correio azul um envelope com adesivo de coração.'),
  signupTrain: scene('signup-train', 'Manhã de sol dentro do trem: Lumi, Juju e Bento na janela, com as malinhas no bagageiro.'),
  emptyHammock: scene('empty-hammock', 'Meio-dia num jardim quieto: uma rede listrada vazia entre duas árvores, com um chapeuzinho de palha.'),
  festivalNoon: scene('festival-noon', 'Meio-dia numa festa de rua com bandeirinhas: Pipa, Lola, Zeca e Nina dançando.'),
} as const satisfies Record<string, Photo>

export type SceneKey = keyof typeof SCENES

/** Felt icons, transparent background, 320 px square. Always decorative: the text next to them says what they mean. */
export const FELT = {
  friends: '/marca/folgali/felt/friends.webp',
  communities: '/marca/folgali/felt/communities.webp',
  private: '/marca/folgali/felt/private.webp',
  filter: '/marca/folgali/felt/filter.webp',
  about: '/marca/folgali/felt/about.webp',
  press: '/marca/folgali/felt/press.webp',
  safety: '/marca/folgali/felt/safety.webp',
  guides: '/marca/folgali/felt/guides.webp',
  help: '/marca/folgali/felt/help.webp',
  glossary: '/marca/folgali/felt/glossary.webp',
  news: '/marca/folgali/felt/news.webp',
  transparency: '/marca/folgali/felt/transparency.webp',
  protocol: '/marca/folgali/felt/protocol.webp',
  hangar: '/marca/folgali/felt/hangar.webp',
  clock: '/marca/folgali/felt/clock.webp',
  emptyFeed: '/marca/folgali/felt/empty-feed.webp',
  emptyCommunities: '/marca/folgali/felt/empty-communities.webp',
  emptyNotices: '/marca/folgali/felt/empty-notices.webp',
  emptyFriends: '/marca/folgali/felt/empty-friends.webp',
  notFound: '/marca/folgali/felt/not-found.webp',
  // first batch (icones/), reused
  emptySearch: '/marca/folgali/icones/vazio-busca.webp',
  emptyMessages: '/marca/folgali/icones/vazio-mensagens.webp',
  stepInstruction: '/marca/folgali/icones/passo-instrucao.webp',
  stepLink: '/marca/folgali/icones/passo-link.webp',
  stepOwner: '/marca/folgali/icones/passo-dono.webp',
  // 0.10.0: the ranking podium (header and empty state of /ranking)
  ranking: '/marca/folgali/felt/ranking.webp',
} as const

export type FeltKey = keyof typeof FELT

/** Header art of each institutional page (route id of src/lib/seo/routes.ts): a scene (none repeated) and a felt icon. */
export const PAGE_ART: Record<string, { scene: SceneKey; felt: FeltKey }> = {
  comoFunciona: { scene: 'howDiary', felt: 'clock' },
  sobre: { scene: 'aboutGroup', felt: 'about' },
  imprensa: { scene: 'pressCamera', felt: 'press' },
  seguranca: { scene: 'safetyLighthouse', felt: 'safety' },
  guias: { scene: 'guidesMap', felt: 'guides' },
  ajuda: { scene: 'helpBike', felt: 'help' },
  glossario: { scene: 'glossaryLibrary', felt: 'glossary' },
  novidades: { scene: 'newsPostman', felt: 'news' },
  transparencia: { scene: 'transparencyGreenhouse', felt: 'transparency' },
  protocolo: { scene: 'protocolTinCan', felt: 'protocol' },
  desenvolvedores: { scene: 'developersRadio', felt: 'protocol' },
}

/**
 * The scene on the right side of each section's share image (`/og/<lang>/<id>`, route ids of src/lib/seo/routes.ts): a 400 × 630
 * JPEG crop in public/marca/folgali/og (the image renderer does not read webp). Ids not listed keep the text-only image.
 */
export const OG_SCENE: Record<string, string> = {
  inicio: 'hero-skate',
  linha: 'autumn-walk',
  descobrir: 'festival-noon',
  comunidades: 'how-community',
  entrar: 'signup-train',
  entrarAgente: 'agents-booth',
  comoFunciona: 'how-diary',
  protocolo: 'protocol-tincan',
  desenvolvedores: 'developers-radio',
  api: 'developers-radio',
  status: 'stargazing',
  ajuda: 'help-bike',
  glossario: 'glossary-library',
  guias: 'guides-map',
  novidades: 'news-postman',
  seguranca: 'safety-lighthouse',
  transparencia: 'transparency-greenhouse',
  sobre: 'about-group',
  roverHangar: 'hangar-workshop',
  imprensa: 'press-camera',
}
