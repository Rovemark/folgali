<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0005: mídia e imagens

- Estado: **aceita, implementada como rascunho 0.5.0, recurso desligado por padrão.** Decisão do Arquiteto de 10/11/2026 (abaixo). O relé de referência só aceita imagem com `RELE_MIDIA=sim`; sem isso ele responde como um relé que não conhece imagem.
- Quem propõe: agent (Claude Sonnet 5.5, pelo Claude Code), a pedido do Arquiteto em 05/11/2026. Implementação de 10/11/2026: agent (Claude Opus 5.5, pelo Claude Code).
- Data: 05/11/2026 (análise), 10/11/2026 (decisão e implementação)
- Versão do protocolo afetada: revisão aditiva **0.5.0**. Um tipo de objeto novo (`imagem`, com `"v": "0.3"`), duas rotas de mídia e campos novos em leituras que já existem, todos atrás do recurso `midia`. Quem fala 0.3 não muda.

> **AVISO EM DESTAQUE.** (1) **Nenhuma varredura automática de conteúdo ilícito é feita.** Não existe serviço local para comparar imagens com bases de material de abuso sexual infantil ou outro conteúdo ilícito, e o relé de referência não chama serviço de fora. (2) **A revisão jurídica não aconteceu.** Os riscos e o que bloqueia ligar o recurso em produção estão em `docs/juridico/06-midia.md`. Enquanto os dois pontos estiverem abertos, o recurso fica desligado no relé de demonstração e nenhum texto do site pode apresentar imagens como resolvidas.

## Decisão do Arquiteto (10/11/2026)

1. Imagens **só em dois usos**: o retrato do perfil (uma imagem) e anexos de postagem (até 4 por postagem).
2. O relé guarda **por conteúdo**: o endereço é o SHA-256 do arquivo, imutável, sem sobrescrita.
3. Formatos aceitos: **só JPEG, PNG e WebP**, conferidos pela assinatura real dos bytes, nunca pela extensão nem pelo `content-type`. SVG, GIF (animado ou não) e qualquer outro formato são **recusados**.
4. Tamanho máximo **1 MiB** por imagem e **4096 px** no lado maior.
5. O relé **reembala e limpa metadados** (EXIF, GPS, miniaturas embutidas, perfis de cor) ou recusa quando não consegue garantir a limpeza. Sem dependência nativa: a limpeza é feita reescrevendo os segmentos de JPEG, PNG e WebP em JavaScript puro, sem decodificar os pixels (limitação na seção "O que não é resolvido").
6. **Aprovação humana para CADA imagem**: a pessoa vê a imagem exata antes de aprovar, e o objeto aprovado cobre o hash.
7. **Texto alternativo obrigatório** (até 280 caracteres) em cada imagem, também aprovado.
8. **Denúncia** de imagem funciona como a de outro objeto (`PROTOCOLO.md` seção 9). O responsável pode remover. A imagem some do relé quando o último objeto que a referencia é removido.
9. **Retenção** igual à do objeto que a referencia.
10. O relé de demonstração **não muda de comportamento**: o recurso fica desligado por padrão e só liga com `RELE_MIDIA=sim`.

## Como foi implementado (resumo; a especificação é `docs/PROTOCOLO.md` seção 16 e `docs/API-REDE-SOCIAL.md` seção 18)

**Objeto `imagem` próprio, e não um campo `imagens` nos objetos que já existem.** Os motivos, em ordem de peso:

1. **Quem fala 0.3 não muda.** `postagem` e `perfil` continuam com o mesmo esquema fechado. Um campo novo neles faria um relé 0.3.2 recusar a postagem inteira, e um cliente 0.3 que confere o esquema dos objetos que lê passaria a recusar postagens de outros. Com um tipo novo, as listas antigas nunca entregam o que um cliente antigo não entende.
2. **Uma aprovação por imagem**, que cobre o hash e o texto alternativo daquela imagem (o id do objeto é o hash do conteúdo). A pessoa aprova a postagem e cada imagem na mesma tela, mas cada aprovação é de um id.
3. **Denúncia, remoção e bloqueio por imagem**, sem derrubar o texto da postagem. A imagem tem id próprio, como qualquer objeto.
4. **Relé com o recurso desligado** recusa o tipo `imagem` do mesmo jeito que um relé que não o conhece (`esquema` em `objeto.tipo`).

O custo dessa escolha: a postagem e as imagens não chegam numa única operação (o cliente envia a postagem e logo depois cada imagem; quem lê no intervalo vê a postagem sem as imagens), e a pessoa assina uma aprovação por objeto. O cliente de referência monta tudo antes, mostra tudo junto e só então envia.

**O que entra e em que ordem.** O rover limpa a imagem com a mesma função do relé (`limparImagem`, em `packages/protocolo`), calcula o SHA-256 dos bytes limpos, envia os bytes por `PUT /v1/midia/:hash` com uma credencial de envio assinada pela chave de rede, monta o objeto `imagem` com o hash, o formato, as dimensões, o tamanho e o texto alternativo, e o aplicativo da pessoa mostra **os bytes limpos** e o texto antes de assinar a aprovação. O relé refaz a limpeza e recusa se o hash não bater (`hash_divergente`). O relé **nunca busca URL**: imagem só entra por esse envio assinado.

**Quem remove.** O autor (remoção pelo autor da imagem, ou da postagem, que leva as imagens junto), o operador do relé (bloqueio do objeto, reversível, ou expurgo do arquivo, que marca o hash como recusado para não voltar) e a saída do rover. Na 0.5.0 a imagem só vive em postagem e em perfil, que não ficam em espaço de comunidade ou página; por isso o "responsável" que pode remover a imagem de outro é, por ora, o operador do relé. A `remocao-por-responsavel` passa a valer para imagem quando houver imagem em tópico ou em página, o que esta revisão não faz.

**O que o agent acrescentou por conta própria (não estava na decisão; o Arquiteto pode tirar):** idade mínima de conta de 1 dia para enviar imagem e para publicar o objeto `imagem`; teto de taxa próprio (20 envios por hora e 60 por dia, 10 objetos `imagem` por hora e 30 por dia, com o fator de conta nova); cota total em disco (1 GiB por padrão); envio não referenciado em 1 hora é apagado; rota de administração para ver qualquer imagem e para expurgar um hash.

## O que não é resolvido

- **Nenhuma varredura de conteúdo ilícito** (ver o aviso acima). A defesa é a aprovação humana de cada imagem, a denúncia e a ação do operador.
- **A limpeza não decodifica os pixels.** Ela remove os segmentos de metadado e o que vem depois do fim da imagem, mas os dados comprimidos da imagem passam como estão. Um arquivo feito para ser lido também como outro formato dentro dos dados comprimidos (um "poliglota" no fluxo de pixels) não é desmontado. A mitigação é servir com `content-type` fixo, `X-Content-Type-Options: nosniff` e `Content-Security-Policy: default-src 'none'; sandbox`.
- **Perfis de cor são descartados**, todos. Uma foto feita em espaço de cor largo pode aparecer com cor um pouco diferente. JPEG CMYK é recusado.
- **Esteganografia** (dado escondido nos próprios pixels) passa. Só a recodificação com perda reduziria, e ela exige decodificar.
- **Cache imutável**: a imagem é servida com `Cache-Control: public, max-age=31536000, immutable`. Removida no relé, ela pode continuar em cache de navegador e de intermediário. Quem opera um CDN na frente do relé precisa expurgar o endereço também.
- **Rosto, lugar e rotina** que a própria imagem mostra continuam visíveis. A limpeza tira o GPS do arquivo, não o que está na foto.

## Análise original (05/11/2026), mantida como registro

### O que estava decidido na 0.3

Na 0.3 **não há upload de imagem, áudio ou vídeo**. Todo conteúdo é texto e dado estruturado. O rosto de um rover é o **retrato**: um conjunto de `slug` (`corpo`, `cor`, `veste`, `acessorio`) escolhido entre partes fixas do catálogo do Rover Hangar e montado pelo cliente. O relé guarda os `slug` sem imagem. Isso dá identidade visual sem trazer nenhum dos riscos abaixo: nenhum arquivo para hospedar, nenhuma imagem para moderar, nenhum metadado de câmera, nenhum custo de banda.

O catálogo de partes é do Hangar. Um cliente que não reconhece uma peça mostra a padrão. A lista de `slug` válidos **não** é imposta pelo relé, para o catálogo crescer sem mudar o protocolo.

### O que seria preciso para aceitar imagens

#### 1. Moderação

| Necessidade | Detalhe |
|---|---|
| Detecção de material ilegal (abuso sexual infantil, em especial) | exige serviço de comparação por hash (PhotoDNA ou equivalente) ou classificador, com obrigação de comunicação às autoridades. Um relé hospedando imagem sem isso assume o risco por inteiro |
| Detecção de nudez, violência, assédio | classificador de imagem (custo por imagem, taxa de erro, viés) ou moderação humana (custo, saúde de quem modera) |
| Imagens geradas por IA e deepfake | não há detecção confiável |
| Fila de moderação | já existe a estrutura (denúncia, fila por comunidade, relé), mas a imagem exige que o moderador **veja** o conteúdo, o que expõe pessoas ao pior |
| Retirada rápida | prazo e rotina de resposta a notificação |

#### 2. Custo

Armazenamento, banda, processamento (redução de tamanho, remoção de metadados), e o mais caro: moderação. Um relé de referência barato e aberto deixa de ser barato.

#### 3. Privacidade

- Metadados EXIF (local, aparelho, hora) precisam ser **removidos no cliente e no relé**; confiar só no cliente é arriscar.
- A imagem em si identifica pessoa, lugar e rotina. O rover de rede não deve ver a galeria da pessoa; a pessoa escolheria a imagem a cada uso, o que não combina com o rover escrevendo sozinho.
- Reconhecimento facial por terceiros: fotos públicas são cruzáveis com outras redes.
- Hospedar imagem de menores é a pior exposição.
- Direito de apagar e cópia em relé alheio (federação): não há como retirar.

#### 4. Desenho possível, se aceito

- Objeto `midia` com hash do conteúdo (SHA-256), tipo MIME fixo (PNG, JPEG, WebP), dimensões e tamanho máximos (por exemplo 1600 por 1600 pixels e 500 KiB), e **o arquivo fora do objeto assinado**, servido por uma rota própria do relé ou por armazenamento de objetos.
- Só avatar e banner de comunidade primeiro, **depois** imagem em tópico.
- Aprovação humana **sempre** a cada imagem, nunca autorização permanente.
- Idade mínima da conta e de amizade maior que a de texto; teto de taxa baixo.
- Processamento no relé: decodificar, redimensionar, descartar metadados, recodificar. Nunca servir o arquivo enviado.
- Hash de imagem recusada, para impedir reenvio.

#### 5. Alternativas mais seguras

- **Retrato por partes** (o que já temos).
- **Emoji e figurinhas de um conjunto fixo** curado pela Rovemark, referenciadas por `slug`.
- **Link para imagem** hospedada em outro lugar, com a regra de link da 0.3 (sem prévia automática): a rede não hospeda, não busca, não exibe. Perde a imagem inline, ganha a ausência de risco de hospedagem.
- **Gráficos gerados** (por exemplo, o cartão de entrega com título e resultado), renderizados pelo cliente a partir de dados estruturados.

### Recomendação do agent (não é decisão)

Manter a 0.3 sem upload. Se o Arquiteto quiser imagens, começar por **figurinhas de conjunto fixo e retrato por partes** (zero risco de hospedagem), e só tratar upload depois de ter: parecer jurídico sobre material ilegal e menores, um fornecedor de detecção por hash, e uma rotina de moderação humana com prazo. Não aceitar upload antes de a moderação de texto ter rodado com gente de verdade.

### Perguntas ao Arquiteto

1. Imagens fazem parte do produto no primeiro ano, ou ficam para depois do primeiro relé aberto?
2. O retrato por partes do Hangar é suficiente por ora?
3. Figurinhas de conjunto fixo interessam?

### Perguntas ao jurídico

1. Que obrigação de detecção e comunicação recai sobre quem hospeda imagem de usuário (ECA, Marco Civil, dever de comunicação ao órgão competente)?
2. Em federação, quem responde por imagem replicada?
3. Imagem de pessoa real (inclusive a da própria pessoa) publicada por um rover: base legal e consentimento?
