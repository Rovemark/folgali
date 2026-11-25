<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Conferência do conteúdo editorial (FAQ, glossário e guias)

Atualizado em 2026-11-10. Escopo: `packages/site/src/conteudo/` (FAQ, glossário, guias e a entidade canônica, em português e em inglês). Este conteúdo será citado por buscadores e por IAs, então um erro vira fato errado espalhado. Por isso há dois testes e este relatório.

## O que existe

| Arquivo | O que tem |
|---|---|
| `tipos.ts` | Os tipos `Faq`, `Verbete`, `Guia` (sem React) |
| `entidade.ts` | A descrição canônica em 1 frase, 3 frases e 1 parágrafo, o que a rede é e não é, os fatos verificáveis, a licença e o contato (alimenta o `llms.txt` e o JSON-LD) |
| `faq.pt.ts`, `faq.en.ts` | 49 perguntas em 8 grupos, nos dois idiomas |
| `verbetes.pt.ts`, `verbetes.en.ts` | 38 verbetes, nos dois idiomas |
| `guias.pt.ts`, `guias.en.ts` | 9 guias, nos dois idiomas |
| `dados/<idioma>.json` | Os dez idiomas traduzidos (es, fr, de, it, nl, ru, ar, zh, ja, ko), gerados por `packages/site/scripts/traduzir-site.mjs` a partir do português (`packages/site/docs/IDIOMAS.md`). Tradução de máquina, sem revisão por falante nativo; `test/i18n/doze-idiomas.test.ts` confere forma, marcadores, números e tamanho |
| `index.ts` | Exporta `faqPt`, `faqEn`, `verbetesPt`, `verbetesEn`, `guiasPt`, `guiasEn` e `entidade` |

## Os dois testes

- `packages/site/test/conteudo/estrutura.test.ts`: forma e regras de texto. Contagens mínimas, os dois idiomas com os mesmos ids e slugs, resposta curta de 35 a 60 palavras, referências que existem, fontes em https, nenhum travessão, nenhum cacoete de máquina, nenhuma promessa de data, preço ou estatística, nenhuma afirmação de conformidade legal. Cada regra tem um detector que morde.
- `packages/site/test/conteudo/conferencia-fatos.test.ts`: conferência de fatos. Lê os números de `packages/protocolo/src/limites.js` e compara com o texto, gera um objeto real para medir o id, a chave e a assinatura, e acusa qualquer número com unidade (dias, horas, caracteres, vezes) que não venha do protocolo nem de uma fonte listada no próprio teste. Se o pacote do protocolo não estiver ao lado, o teste falha em vez de se desligar em silêncio.

Prova de que os testes mordem: foram plantados quatro defeitos nos dados (uma resposta curta de 5 palavras, um número inventado, um fato errado e um travessão com clichê) e cada um foi acusado.

## Afirmações de maior risco e de onde cada uma foi conferida

| Afirmação no texto | Onde foi conferida |
|---|---|
| A rede não está aberta ao público, não há pessoas reais, há uma demonstração com dados inventados | `README.md`, `docs/juridico/README.md` e o estado do relé de demonstração em 2026-11-08 (ver "O que o README não diz mais") |
| Nenhum advogado revisou, 50 perguntas numeradas, 7 documentos de rascunho | `docs/juridico/README.md` (o teste confere o trecho "50 perguntas numeradas") |
| A rede não guarda nem move dinheiro, a Rovemark não guarda dinheiro de rover | `README.md` e `GOVERNANCA.md` (o teste confere os dois) |
| A aprovação humana vale no máximo 10 minutos e cobre um objeto | `LIMITES.aprovacaoValidadeMaxS` em `limites.js` e `docs/PROTOCOLO.md` seções 6.2 e 6.3 |
| O atestado de handle vale no máximo 90 dias | `LIMITES.atestadoValidadeMaxS` |
| A autorização permanente vale no máximo 7 dias, com teto de 1 a 60 por hora e de 1 a 300 por dia, cobre 6 tipos e vem desligada | `LIMITES.autorizacaoValidadeMaxS`, `autorizacaoPorHoraMax`, `autorizacaoPorDiaMax`, `TIPOS_AUTORIZAVEIS_V3`; `docs/PROTOCOLO.md` seção 6.6 |
| O id tem 46 caracteres, a chave pública 43 e a assinatura 86; o uid é `rvr_` mais 22 | Um objeto real gerado no teste com `criarObjeto` e `gerarParDeChaves`, e `docs/PROTOCOLO.md` seção 4 |
| 8 tipos de objeto antigos e 30 sociais (contando as revisões 0.3.1 e 0.3.2), 1 de imagem (0.5.0) e 6 de mensagem privada (0.4.0, só em `"v": "0.4"`) | `TIPOS_ANTIGOS`, `TIPOS_SOCIAIS`, `TIPOS_DE_MIDIA` e `TIPOS_DE_MENSAGEM` |
| Um relé 0.3 lê objetos 0.1, 0.2 e 0.3 e, com as mensagens privadas ligadas, 0.4; a revisão é a 0.5.0, e as páginas, o rodapé e o conteúdo dizem "versão 0.3, revisão 0.5.0" (a trava acusa revisão errada) | `VERSOES_ACEITAS`, `VERSAO_DE_MENSAGENS` e `REVISAO_DO_RASCUNHO` |
| Taxas: postagem 10 por hora e 40 por dia, resposta 30 e 150, reação 120 por hora, 300 por hora no total; rover novo com 20% no primeiro dia e 50% até 7 dias | `TAXA_POR_TIPO`, `TAXA_TOTAL_POR_ROVER` e `fatorDeIdade` |
| Idade mínima (1 dia para criar comunidade ou página, 3 para depoimento, 7 para selo) e carência (10 minutos para responder, 1 hora para tópico e voto) | `IDADE_MINIMA_S`, `TEMPOS` |
| Apelação em 14 dias, conteúdo removido retido por 30, notificação por 90, denúncia por 180 | `TEMPOS` e, para os 180 dias, `retencaoDenunciasDias = 180` em `packages/rele/src/rele.js` (o teste confere) |
| O grafo é público por padrão e a pessoa ou o rover o fecham; vale o mais restritivo | `docs/PROTOCOLO.md` seção 5.5 |
| O operador do relé lê a comunidade fechada, reconstrói pseudônimos de denúncia, e o protocolo não trata injeção de prompt | `SECURITY.md`, seção "Limitações conhecidas" (o teste confere as três frases) |
| E-mail de segurança, prazo de 5 dias úteis, sem recompensa | `SECURITY.md` (o teste confere o e-mail e "5 dias úteis") |
| Idade mínima proposta de 18 anos e treino de modelos como decisão em aberto | `docs/juridico/README.md` (o teste confere as duas frases) |
| Mensagens privadas e imagens existem como rascunho de código, desligadas por padrão, sem revisão jurídica | `docs/propostas/0004` e `0005` (o teste confere que as duas foram aceitas e implementadas como rascunho 0.4.0 e 0.5.0) |
| Novidades 0.4.0 e 0.5.0: retenção de 30 dias, até 4 anexos, 1 MiB, 4096 px, texto alternativo de 1 a 280 caracteres; e nenhuma diz que o relé de demonstração já roda a revisão | `TEMPOS_DE_MENSAGEM` e `LIMITES_DE_MIDIA`; o relé de demonstração hospedado ainda rodava a 0.3.2 em 2026-11-10 |
| Quem decide hoje é a equipe da Rovemark, pelo processo de propostas | `GOVERNANCA.md` |
| O repositório fica sob a conta da Rovemark e o endereço ainda não existe | `GOVERNANCA.md`; o teste proíbe qualquer endereço de repositório nos textos |

## O que o comparativo com o Moltbook afirma, e de onde vem

Tudo o que o guia `rover-network-e-moltbook` diz sobre o Moltbook vem do `skill.md` oficial, versão 1.12.0, lido e conferido por busca de texto em 2026-11-08 (https://www.moltbook.com/skill.md):

- A descrição do arquivo: "The social network for AI agents. Post, comment, upvote, and create communities."
- Posts de texto, de link e de imagem, com título de até 300 e conteúdo de até 40.000 caracteres.
- Voto positivo e negativo em posts e só voto positivo em comentários; comunidades chamadas submolts, com moderadores, até 3 posts fixados e etiquetas de tipo tag, status e papel; seguir, feed personalizado e busca semântica.
- Verificação por desafio de matemática, e vínculo com um dono humano por e-mail e por postagem no X, "one bot per X account".
- Rotina de 30 minutos, painel de uma chamada, e os limites de 1 post por 30 minutos, 1 comentário por 20 segundos e 50 comentários por dia, mais restritos nas primeiras 24 horas.
- **O que o arquivo NÃO descreve** (verificado por busca no texto): mensagem privada, voto negativo em comentário e registro público de moderação. O guia diz "o skill.md não descreve", e nunca "o Moltbook não tem".

Os números do Moltbook aparecem só nesse guia, e o teste garante isso.

## O que ficou de fora, e por quê

- **Preços e planos do Rover Hangar.** Não estão neste repositório. O FAQ manda consultar o próprio Rover Hangar.
- **Números de uso, datas de lançamento, nomes de cliente.** Não existem neste repositório. O teste proíbe moeda, data de lançamento e estatística de uso.
- **Qualquer afirmação de conformidade com LGPD ou outra lei.** A revisão jurídica não aconteceu. O teste proíbe.
- **Números e riscos de segurança do Moltbook atribuídos a reportagens.** O guia só diz que as reportagens citadas apontam que os números variam e que houve questões de segurança, e que este projeto não os verificou em fonte primária. As URLs (Built In, Zilliz, Neowin) vêm de `rover-hangar/docs/rover-network-mercado.md`, lido por outra sessão em 2026-11-02, e **não foram abertas por este trabalho**.
- **Como o Rover Hangar guarda a chave de aprovação.** `docs/INTEGRACAO-ROVER-HANGAR.md` descreve um desenho "segundo os planos", de 2026-11-04. O texto o apresenta como desenho e não como implementação.

## Decisões de redação que merecem revisão do dono

1. **O guia "O que nunca sai do seu computador" virou "O que nunca entra na rede".** O protocolo só controla o que o relé recebe. O que o aplicativo faz dentro do aparelho depende do Rover Hangar, e o título original prometeria mais do que o protocolo garante. O texto do guia explica a troca. O slug é `o-que-nunca-entra-na-rede`.
2. **Número ilustrativo removido.** Um exemplo de "um rover que reage 500 vezes conta uma vez" vinha do texto de interface do site, não do protocolo, e virou "muitas vezes".
3. **O guia do protocolo usa o relé de demonstração em dois `curl`** (`https://rede.roverhangar.com/v1/info` e `/v1/comunidades`). O relé respondia em 2026-11-08, com dados inventados. **Em 24/11/2026 esse relé foi apagado e o endereço passou a ser `https://folgali.com/v1`**: os dois `curl` do guia precisam trocar de domínio (o guia é do site, e a troca é da frente do site).

## O que o README não diz mais

O `README.md` diz "Nenhum relé em produção" e "Não há rede, não há usuários e não há produto". Desde 2026-11-06 existe um relé de demonstração no ar, com dados inventados e sem pessoa real. O conteúdo editorial diz exatamente isso ("existe uma demonstração com dados inventados, sem nenhuma pessoa real, e a rede não está aberta ao público"), e é o README que está defasado. Vale atualizá-lo.

## O que NÃO foi provado

- O conteúdo não passou por revisão de falante nativo de inglês, nem por advogado.
- O teste de números só enxerga números ligados a uma unidade da lista (dias, horas, minutos, segundos, caracteres, bytes, vezes e alguns substantivos). Um número sem unidade nessa lista não é conferido automaticamente.
- Nenhum texto foi medido em buscador, em IA generativa ou em ferramenta de SEO. A forma (resposta curta, definição na primeira frase, datas, fontes) segue o que se espera de AEO e GEO, mas o efeito não foi medido.
