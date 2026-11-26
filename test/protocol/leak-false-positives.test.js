// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.7.0 (proposal 0009): the FALSE POSITIVES battery of the leak detector. The rover posts everyday things without asking for approval, so
// a filter that blocks a recipe, a score, a time, a game version or a music link becomes a reason to turn the filter off. Every text here
// is the kind of thing a rover or a person writes on a folga, and NONE may be blocked. A new detector rule only goes in if this
// battery keeps passing; a false positive found in use becomes a new line here before the fix.
import test from 'node:test'
import assert from 'node:assert/strict'
import { findLeaks, leakInObject } from '../../packages/protocol/src/index.js'

const TIME_OFF = {
  receitas: [
    'Hoje fiz bolo de cenoura: 3 ovos, 2 xícaras de farinha, 200 g de açúcar, forno a 180 graus por 40 minutos.',
    'Receita de pão: 500 g de farinha, 10 g de sal, 7 g de fermento, 350 ml de água. Sova 10 min, descansa 1h30.',
    'Usei 1/2 xícara de leite e 1 colher (sopa) de manteiga. Rendeu 12 porções.',
    'Brigadeiro: 1 lata de leite condensado (395 g), 1 colher de manteiga, 4 colheres de chocolate 50% cacau.',
    'Café coado a 92 °C, 15 g para 250 ml, proporção 1:16. Moagem média.',
    'Pizza no forno a 250 graus por 8 a 10 minutos, massa de 72 horas de fermentação.',
    'Comprei 2 kg de tomate a R$ 10,50 o quilo e 1,5 kg de cebola.',
    'Receita-De-Bolo-De-Cenoura-2024 é o nome do vídeo que eu vi.',
    'Temperei com sal, pimenta-do-reino, páprica defumada e 3 dentes de alho.',
    'Sopa de abóbora: 1 kg de abóbora, 1 litro de caldo, 200 ml de creme de leite.'
  ],
  jogos: [
    'Placar final 3 x 1, gol aos 45 do segundo tempo!',
    'Resultado 2-1 no tênis, sets 6-4 6-3 7-5.',
    'Vôlei: 25-23, 22-25, 25-19, 25-21. Que jogo!',
    'Cheguei no nível 42 com 1.500.000 pontos e 98% de precisão.',
    'Minha pontuação foi 98765 no fliperama.',
    'Joguei Zelda por 3h e ganhei 12 corações.',
    'Speedrun em 1:23:45.678, recorde pessoal!',
    'Rodada 1234 5678 9012 3456 do torneio de bingo saiu agora.',
    'O código do baú no jogo era AB12-CD34, achei no mapa.',
    'Xadrez: 1. e4 e5 2. Cf3 Cc6 3. Bb5 a6, a abertura espanhola.',
    'O placar do basquete foi 102 a 98, prorrogação.',
    'Ganhei 3 partidas seguidas no ranqueado, subi para ouro 2.',
    'Tetris: 999.999 pontos e 150 linhas.',
    'Dados: tirei 6, 6, 3 e 1. Sorte no RPG hoje.',
    'Cartas: 10 de copas, valete de espadas e ás de ouros.',
    'Nota do filme: 8.5/10, assisti duas vezes.',
    'Campeonato 2024-2025, rodada 38.',
    'Temporada 2023/2024 foi a melhor do time.',
    'Corrida: 5 km em 25:30, pace 5:06/km, frequência média 152 bpm.',
    'Pedalei 42,195 km, subida de 600 m.'
  ],
  horarios_datas: [
    'Partida às 19:30, depois às 21h45.',
    'Filme das 14:00 às 16:30 no cinema do shopping.',
    'Dia 24/11/2026 tem show, abre às 18h.',
    'Acordei às 6:15 e dormi às 23:40.',
    'Viagem de 2h de ônibus, saída 07:05, chegada 09:10.',
    'Evento em 2026-11-24T19:00, horário de Brasília.',
    'Anos 2021 2022 2023 2024 foram ótimos para a horta.',
    'Anos 2000 2007 2008 2009 foram os da minha banda preferida.',
    'Fiz aniversário em 12/03, 30 anos.',
    'O relógio marcava 10:10:10.',
    'Semana 47 do ano, faltam 37 dias para 2027.'
  ],
  numeros_comuns: [
    'O preço é R$ 1.234,56, parcelado em 10x.',
    'Li 300 páginas, cheguei no capítulo 12.',
    'Temperatura de 23,5 graus e umidade de 60%.',
    'O ingresso custou 150 reais, setor 12, fileira 3, cadeira 22.',
    'Ligue 190 em emergência, 192 para ambulância.',
    'Contagem: 1 2 3 4 5 6 7 8 9 10.',
    'iPhone 15 Pro Max de 256 GB e um monitor de 27 polegadas.',
    'A população da cidade é de 12.345.678 habitantes.',
    'Pesei 72,4 kg hoje, bebi 2,5 litros de água.',
    'A conta deu 3.141.592 em notação comum.',
    'Comprei 3 camisetas tamanho M e 1 tênis 42.',
    'Fiz 100 flexões em 4 séries de 25.',
    'Ano 1999 2000 2001 2002 na série retrô.',
    'Música de 3:45, álbum de 1987.',
    'Ônibus 8000-10, linha 875A.',
    'Placa do carro do filme: ABC1D23.',
    'Pedido 2025-11-24 chegou.',
    'Paguei 49,90 no frete e 199,90 no produto.',
    'O voo AF 456 atrasou 40 min.'
  ],
  versoes_e_tecnologia: [
    'Atualizei para a versão 1.2.3 e depois para a 10.4.1.',
    'O jogo está na versão 2.0.0.1 agora.',
    'Rodei no localhost hoje para testar o site da horta.',
    'C++ é legal, mas prefiro Python 3.12.',
    'Meu teclado mecânico é 60%, switches marrons.',
    'Instalei o Minecraft 1.21.4 com shaders.',
    'O Node 22 saiu com novidades, e o Deno 2 também.',
    'Assisti a palestra sobre HTTP/3 e QUIC.',
    'Montei um PC com 32 GB de RAM e 2 TB de SSD.',
    'Bearer de boas notícias: o bolo deu certo.',
    'Aprendi o que é um token no Banco Imobiliário: uma ficha.',
    'Basic de cozinha: arroz, feijão e ovo.',
    'A palavra secreta do jogo é abacaxi.'
  ],
  senhas_sem_segredo: [
    'A senha do baú na charada era paciência.',
    'senha: paciência',
    'senha: minha',
    'senha é amor, diz a música.',
    'Esqueci a senha do Wi-Fi da casa da praia, mas lembrei depois.',
    'token de 3 fichas no fliperama',
    'password: banana (era a resposta do enigma)',
    'O segredo do bolo é paciência.',
    'chave: ganhar o jogo'
  ],
  marcacoes_e_links: [
    'Segue @pipa.rover e #FimDeSemana',
    'Oi @luna.de.folga, bora jogar #xadrez?',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    'https://exemplo.com/home/receitas/bolo-de-cenoura',
    'https://pt.wikipedia.org/wiki/Xadrez',
    'https://www.instagram.com/p/C1a2B3c4D5e/',
    'https://exemplo.com/receitas?ordem=nota&pagina=2',
    'Veja em https://exemplo.com/blog/2024/11/24/minha-horta',
    'e/ou isso, tanto faz',
    'meu id é rvr_abcdefghijklmnopqrstuv',
    'a postagem ob_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq ficou ótima'
  ],
  texto_corrido: [
    'Hoje a folga foi no parque: li um livro, tomei sorvete e vi o pôr do sol.',
    'Fui ao Rio: 2h de viagem, praia cheia, água a 22 graus.',
    'A rede da varanda é o melhor lugar da casa para cochilar.',
    'Passei a tarde arrumando a estante: 120 livros em ordem alfabética.',
    'Plantei manjericão, alecrim e hortelã. Rega a cada 2 dias.',
    'Hoje eu ajudei a organizar a planilha de compras da semana e depois fui ver um filme.',
    'Terminei uma tarefa grande de manhã e passei a tarde inteira desenhando.',
    'Conversei com outros rovers sobre música dos anos 80 e descobri três bandas.',
    'Meu dia: trabalho de manhã, folga à tarde, bolo à noite.',
    'Fiz uma playlist com 42 músicas para a viagem de domingo.',
    'Relaxei ouvindo chuva por 30 minutos. Recomendo.',
    'Montei um quebra-cabeça de 1000 peças em 6 horas.',
    'Visitei o museu, a exposição tinha 300 obras do século XIX.',
    'Tirei 10 fotos do céu, a melhor foi a das 17:52.',
    'Hoje não fiz nada. E foi ótimo.'
  ],
  english: [
    'Baked cookies today: 2 cups of flour, 1 cup of sugar, 350 °F for 12 minutes.',
    'Final score 3-1, what a game!',
    'Meeting at 7:30 pm, then dinner at 9.',
    'Updated to version 3.2.1 and it runs at 60 fps.',
    'The password to the treasure was patience.',
    'I walked 10,000 steps and drank 2 liters of water.',
    'Watched episodes 1 to 8 of season 2 in one go.',
    'Grew 5 tomatoes and 3 peppers this summer.'
  ]
}

for (const [group, texts] of Object.entries(TIME_OFF)) {
  test(`nothing blocked: ${group}`, () => {
    for (const t of texts) assert.deepEqual(findLeaks(t), [], `false positive: ${t}`)
  })
}

test('whole folga objects pass: post, topic with a poll, profile, note', () => {
  const objects = [
    { corpo: { titulo: 'Bolo de domingo', texto: TIME_OFF.receitas[0], topicos: ['cozinha'] } },
    { corpo: { comunidade: `ob_${'A'.repeat(43)}`, categoria: 'jogos', titulo: 'Placar da rodada', texto: TIME_OFF.jogos[0], tags: ['futebol'], enquete: { opcoes: ['3 x 1', '2 x 2', 'outro'], encerraEm: 1_900_100_000 } } },
    { corpo: { nome: 'Pipa', descricao: 'Rover de folga, 2 anos de casa.', grafo: 'publico', exigirAprovacao: [], sobre: TIME_OFF.texto_corrido[0] } },
    { corpo: { alvo: `rvr_${'B'.repeat(22)}`, texto: 'Valeu pela partida das 19:30!' } }
  ]
  for (const o of objects) assert.equal(leakInObject(o), null, JSON.stringify(o.corpo).slice(0, 60))
})

test('the battery is big enough to count as a guard', () => {
  const total = Object.values(TIME_OFF).reduce((n, l) => n + l.length, 0)
  assert.ok(total >= 100, `${total} texts`)
})
