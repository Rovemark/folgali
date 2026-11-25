> **Histórico.** Esta direção foi substituída em 24/11/2026 pela da folgali (`DESIGN-FOLGALI.md`). A trava `test/design-v2.test.ts` saiu e deu lugar a `test/folgali-design.test.ts`.

# Rover Network: direção visual v2

Decisão do Arquiteto: "não quero tão infantilizado, e nem com cara de IA". Esta é a direção que substitui a de "tecido e costura".

## 1. Fotos de referência (feitas antes de desenhar)

Fotografadas em 07/11/2026 com Chrome headless, só janela, em `docs/fotos-design-v2/ref/` (fora do git):

| Casa | O que serve | O que NÃO serve |
|---|---|---|
| rovemark.co | Manrope grande e apertado, uma única ação em azul, barra de navegação fina, rótulos curtos | Brilho azul atrás do herói e gradiente no título: é o clichê de "cara de IA" |
| logicaos.com | Rótulos mono pequenos, hierarquia por escala, muito vazio bem usado | Constelação de pontos e halo luminoso |
| roverhangar.com | As pelúcias como identidade do produto | Céu azul, nuvens, mundo 3D, cantos redondos em tudo: é a parte infantil |
| rede.roverhangar.com (v1) | Estrutura das telas | Costura tracejada em tudo, cartões pastel com sombra, pílulas, botões gordos, Gabarito arredondada, laranja como segunda cor |

A gramática comum das casas Rovemark, que esta direção herda: **Manrope, IBM Plex Mono para rótulo e métrica, Graphite e Ivory como base, uma cor de ação (Sovereign Blue), fio fino em vez de moldura**.

## 2. O que fica e o que sai

**Fica (Brand Kit v1 da Rovemark, sem inventar paleta):**
- Manrope (texto e título) e IBM Plex Mono (rótulos, handles, números).
- Ivory `#F4F1EA` (fundo claro), Graphite `#111318` (fundo escuro), Steel `#A7AFBD` (fio e secundário), Sovereign Blue `#3455E8` (só ação e foco).
- As pelúcias, como retratos.

**Decisão sobre a identidade do Rover Hangar:** o roverhangar.com usa céu azul e 3D porque vende um produto de consumo. A Rover Network é uma rede onde as pessoas deixam seus rovers falarem por elas, e o assunto é confiança, moderação e privacidade. Pede o tom das casas Rovemark (editorial, técnico), com a pelúcia como o único toque de afeto. Não criei cor fora dos tokens oficiais.

**Sai (removido do CSS):**
1. Bordas e contornos tracejados em todo lugar (costura).
2. Sombras de cartão e de botão (`--sombra` virou `none`).
3. Pílulas (`border-radius: 999px`) em botões, chips e campos.
4. Raios de 20 a 28 px em cartões. Agora 2 e 4 px, e círculo só em retrato.
5. Cartões pastel e fundo de cada bloco: os blocos são abertos, separados por fio.
6. O laranja "fio" como segunda cor de destaque. `--fio` agora é cinza (Steel).
7. Palco com gradiente radial na ficha do rover.
8. Animações de "batida" e de escala em botões.
9. Gabarito e Figtree (arredondadas). Entrou a Manrope.
10. Marca com agulha e linha pontilhada. Entrou um símbolo de dois nós ligados.

**Não pode aparecer (a checklist anti-IA, abaixo):** gradiente de texto ou de fundo decorativo, vidro fosco, halo ou bolha de luz, herói centralizado com três cartões de ícone, emoji como ícone, sombra difusa grande, o mesmo raio em tudo, textos genéricos ("desbloqueie", "mergulhe", "potencialize", "sem esforço", "revolucionário", "poderoso").

## 3. Tokens (todos em `src/app/globals.css`, OKLCH, semânticos)

| Variável | Papel | Claro | Escuro |
|---|---|---|---|
| `--fundo` | Fundo da página | Ivory | Graphite |
| `--tecido` | Superfície elevada (campo, menu, painel) | Ivory mais claro | Graphite mais claro |
| `--tecido-2` | Hover e zebra | Ivory mais escuro | Graphite +2 |
| `--linha` | Fio fino | | |
| `--linha-forte` | Fio de ênfase, borda de campo | | |
| `--tinta`, `--tinta-2`, `--tinta-3` | Texto, secundário, terciário | | |
| `--acao`, `--acao-fundo`, `--acao-tinta` | Única cor de ação, fundo de selecionado, texto sobre a ação | Sovereign Blue | Azul mais claro (contraste) |
| `--ok`, `--aviso`, `--perigo` (+ `-fundo`) | Estados, baixa saturação | | |
| `--foco` | Anel de foco | | |
| `--raio` 4px, `--raio-peq` 2px | Raios | | |
| `--sombra` | `none` (mantido por compatibilidade) | | |
| `--fio`, `--fio-forte` | Alias de `--linha-forte` e `--tinta-2` (compatibilidade com o CSS social) | | |
| `--f-display`, `--f-corpo`, `--f-mono` | Fontes | Manrope, Manrope, Plex Mono | |

Valores de marca em OKLCH, calculados dos hexadecimais oficiais: Ivory `oklch(0.959 0.010 87.5)`, Graphite `oklch(0.187 0.011 268.1)`, Steel `oklch(0.752 0.022 261.8)`, Sovereign Blue `oklch(0.523 0.224 267.7)`.

Escala tipográfica (Manrope): capa `clamp(40px, 6.4vw, 72px)` peso 800, tracking -0.035em, linha 1.02; título de página `clamp(30px, 4.6vw, 46px)` peso 800, -0.03em; seção 22px peso 700; subtítulo 17px peso 700; corpo 16/1.6; miúdo 14; rótulo mono 12px maiúsculo, tracking 0.08em.

Grade: base de 8 px. Desktop: trilho de 224 px, coluna de leitura de até 704 px, lateral de 320 px, vão de 48 px, largura máxima 1400 px. Ritmo vertical: 16 (dentro do grupo), 32 (entre grupos), 56 (entre seções). Fio de 1 px para separar, fio de 2 px em tinta só para abrir seção (como jornal).

## 4. Primitivos para os outros agentes usarem

Já existiam (mantidos, com a cara nova): `.btn` com `.btn-prim`, `.btn-sec`, `.btn-calmo`, `.btn-perigo`, `.btn-peq`; `.etiqueta`; `.retrato`; `.bloco`; `.vazio`; `.painel`; `.opcao`; `.aviso-web`; `.faixa-demo`; `.titulo-pag`; `.sobrelinha`; `.abas-pag`; `.menu`; `.dialogo`.

Novos nesta direção (use estes, sem inventar classe própria):
- `.rotulo`: rótulo mono maiúsculo de 12 px (sobrelinha).
- `.secao` + `.secao-cab`: seção com fio de 2 px no topo e cabeçalho (`h2` à esquerda, `a` à direita).
- `.numeros` + `.numero` (`.numero-valor`, `.numero-rotulo`): faixa de números com fios verticais.
- `.lista-fios`: lista em linhas separadas por fio fino.
- `.campo`, `.campo-rotulo`, `.campo-ajuda`, `.campo-erro`: formulário. `input`, `select` e `textarea` já têm o visual base.
- `.tag`: marca curta mono; `.selo`: contador; `.callout` (`.callout-ok`, `.callout-aviso`, `.callout-perigo`): aviso em bloco.
- `.coluna-larga`: faz a coluna de conteúdo ocupar o trilho e a lateral (para páginas editoriais e de formulário). Cadastro e páginas de texto devem usar.
- `.capa`, `.capa-titulo`, `.capa-texto`: abertura editorial.

Regra: cor só via variável semântica. Nenhum hexadecimal novo no CSS de tela.

## 5. Uso das pelúcias

Retrato (círculo de 1 px com a cor da pelúcia) e ficha do rover (retrato grande em painel liso). Nada de adesivo solto, nada de pelúcia atrás de texto, no máximo uma por tela fora do perfil. Estados vazios mostram o rover pequeno.

## 6. Movimento

Transição de 120 ms em cor e em fundo, nada além. Sem escala, sem bounce, sem entrada orquestrada. `prefers-reduced-motion` zera tudo (já existia e continua).

## 7. Checklist anti-IA (o que o gate e o teste provam)

| Item | Como é provado |
|---|---|
| Sem gradiente decorativo | Teste lê o CSS e falha se houver `linear-gradient` ou `radial-gradient` fora de uma lista permitida |
| Sem tracejado decorativo | O mesmo teste conta `dashed` e `dotted` |
| Sem `border-radius: 999px` fora de círculo e contador | O mesmo teste |
| Sem sombra difusa | O mesmo teste (só o menu flutuante tem sombra curta) |
| Sem `backdrop-filter` | O mesmo teste |
| Sem emoji nos textos | Teste de conteúdo já existente (`conteudo.test.ts`) |
| Contraste WCAG e APCA, foco, zoom 200%, CLS, forced-colors, 3 viewports em 2 temas | Gate `designer-web-app` em todas as rotas |
| Uma cor de ação | Teste conta o uso de `--acao` como fundo só em botão primário, selecionado e contador |

## 8. O que mudou na estrutura (implementado)

- **Capa editorial em `/pt`** (`src/app/[lang]/page.tsx`): manchete, quatro fatos que dá para conferir (100% aprovado pela pessoa, 0 cookies, AGPL-3.0, Ed25519), "Do rascunho à rede, em três passos" em lista numerada (nada de três cartões de ícone), conversas e comunidades em alta e quem chegou. Os textos moram em `src/i18n/social/home.pt.json` e `home.en.json` (chave `socHome`).
- **A Linha foi para `/pt/linha`** (`src/app/[lang]/linha/page.tsx`, o mesmo componente de antes). A navegação ganhou "Início" (`nav.inicio`), e a barra de abas do celular mostra Início, Comunidades, Avisos, Aprovar e Meu rover.
- **Marca nova** (`src/components/Marca.tsx`): dois nós ligados por um fio, o vazado ecoa a abertura do "o" da Rovemark. Sem agulha e sem pontilhado.
- **Fontes** em `src/lib/fontes.ts`: Manrope variável (`src/fontes/manrope-variable.ttf`, OFL) e IBM Plex Mono.
- **O CSS social foi reescrito por camadas**: o arquivo base tem os tokens e os primitivos, e cada `social-*.css` tem uma seção "v2: editorial" no fim, que troca o objeto de artesanato (bilhete, carta, medalha, etiqueta, remendo, carimbo) por fio e tipografia. As classes antigas continuam existindo, então nenhuma tela precisou mudar de lógica.

## 9. Provas

- `test/design-v2.test.ts` (13 testes) lê todo o CSS e falha com: tracejado ou pontilhado, pílula, raio acima de 4 px (fora a moldura do aparelho), gradiente fora da lista de funções, vidro fosco, sombra difusa, segunda cor de destaque, hexadecimal solto, rotação decorativa, animação de escala em botão, fonte arredondada e perda do `prefers-reduced-motion`.
- Suíte do site inteira, typecheck e lint.
- Gate `designer-web-app` (`audit --tudo`, 3 viewports, 2 temas, zoom 200%, sem movimento e cores forçadas) em todas as rotas, com URLs completas. Atenção: `--rotas` exige URL completa; com caminho relativo o gate abre `file:///pt` e audita uma página vazia (aconteceu na primeira tentativa e o resultado foi descartado).
- Fotos de janela em `docs/fotos-design-v2/` (fora do git): `ref/` (referências), `final/` (esta direção). Feitas pelo protocolo de depuração do Chrome com emulação de dispositivo, que respeita a largura de 390 px (o Chrome sem tela recorta abaixo de 500 px) e informa quando o conteúdo estoura a largura.

## 10. O que ficou pendente

- A rota de cadastro (`/pt/entrar`, em outra frente) ainda não existe nesta branch: o botão "Entrar na rede" da capa aponta para ela.
- As páginas editoriais novas e o rodapé completo vêm de outros agentes e devem usar os primitivos da seção 4.
- Idiomas: o site tem os 12 da Rovemark (ver `docs/IDIOMAS.md`).
