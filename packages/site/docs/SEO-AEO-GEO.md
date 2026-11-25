# SEO, AEO e GEO da Rover Network

Este documento descreve como o site é achado e citado por buscadores (SEO), por respostas diretas (AEO) e por assistentes de IA (GEO), o que está ligado, o que ficou desligado de propósito e o que foi provado de verdade. Os números da seção "Resultados" são de 08/11/2026, medidos neste branch.

## 1. Como ligar (e por que está desligado)

O site **nasce fechado**. A flag `ROVER_NETWORK_INDEXAVEL` só vale com o valor exato `sim`; qualquer outra coisa (ausente, `1`, `true`, `SIM`) mantém tudo fechado.

| Superfície | Fechado (padrão) | Aberto (`sim`) |
|---|---|---|
| `<meta name="robots">` | `noindex, nofollow, noarchive` | `index, follow` + limites de trecho e imagem; telas de credencial seguem `noindex` |
| Cabeçalho `X-Robots-Tag` (vem do `proxy.ts`, lido em tempo de execução) | `noindex, nofollow, noarchive` | igual ao meta |
| `robots.txt` | `Disallow: /` para todos | liberado, com as rotas de credencial bloqueadas e `Sitemap:` |
| `sitemap.xml` | vazio | 80 endereços com hreflang (hoje, com dados de demonstração) |
| `llms.txt`, `llms-full.txt` | 404 com `noindex` | servidos |
| JSON-LD global (Organization, WebSite) | ausente | presente |

Tudo isso lê da mesma política (`src/lib/seo/politica.ts`) e da mesma flag (`src/lib/site.ts`), então ligar é uma decisão só. O teste `test/seo/politica.test.ts` prova que a flag muda as quatro superfícies de uma vez.

Para abrir: definir `ROVER_NETWORK_INDEXAVEL=sim` no ambiente do contêiner **e** `ROVER_NETWORK_URL_BASE` se o endereço público deixar de ser `https://folgali.com`. Não precisa rebuild: a flag é lida em runtime (por isso o `X-Robots-Tag` saiu do `next.config.ts`, que é resolvido no build, e foi para o proxy).

**Não abrir antes de:** (a) o relé de demonstração ser trocado por dados reais ou o site declarar em cada página que é demonstração (hoje declara na faixa do topo e no rodapé), (b) o parecer jurídico sobre Termos e Privacidade, que hoje estão marcados como rascunho não revisado, (c) o conteúdo editorial (FAQ, glossário, guias) substituir os exemplos de `src/conteudo/_exemplo/`.

## 2. Política de rastreadores de IA

Decisão (editável em `RASTREADORES_DE_IA`, `src/lib/seo/politica.ts`): o projeto é de código aberto e quer ser achado e citado. Entram, só no conteúdo público:

- **Busca**: OAI-SearchBot, Claude-SearchBot, PerplexityBot.
- **Resposta sob pedido do usuário**: ChatGPT-User, Claude-User, Perplexity-User.
- **Treino**: GPTBot, ClaudeBot, Google-Extended, Applebot-Extended.

Os de treino entram porque a licença do código é AGPL e a arte tem aviso próprio no rodapé; quem não quiser treino remove as quatro linhas da lista e roda os testes. Tudo o que depende de credencial (aprovar, avisos, amigos, gestão de comunidade e página, denúncia) fica fechado para todos. Perfis de rover (`/r/**`) e resultados de busca ficam fora do índice por privacidade, mas seus links podem ser seguidos.

O robots.txt usa três linhas precisas por rota fechada (`$`, `/` e `?`) em vez de prefixo, porque prefixo como `/*/r` bloquearia também `/pt/regras`.

## 3. O que o site entrega

- **Metadados em todas as rotas** (`generateMetadata`): título e descrição únicos por idioma, canonical sem consulta, hreflang `pt-BR`, `en` e `x-default`, Open Graph com `locale` correto, Twitter card, imagem OG 1200x630 gerada por `next/og` (`/og/[lang]/[id]`), sem cor escrita à mão (`og-cores.ts`, com teste de contraste).
- **Registro único de rotas** (`src/lib/seo/rotas.ts`): alimenta rodapé, sitemap, llms.txt, RSS e os testes. Rota nova entra num lugar só.
- **JSON-LD tipado** (`src/lib/seo/jsonld.ts`) validado por JSON Schema nos testes: Organization, WebSite com SearchAction, BreadcrumbList, FAQPage, DefinedTermSet e DefinedTerm, TechArticle, CollectionPage, SoftwareApplication (Rover Hangar, sem `offers`, só macOS, Windows e Linux porque o app de celular ainda não existe), DiscussionForumPosting (só para tópicos públicos quando indexável). A serialização escapa `<`, `>`, `&`, U+2028 e U+2029.
- **AEO**: toda página editorial abre com "Resposta curta", perguntas viram títulos, FAQ visível (sem acordeão), data de atualização e fontes.
- **GEO**: `llms.txt` e `llms-full.txt` gerados do mesmo conteúdo, com fatos citáveis, política de rastreamento e licença; entidade escrita igual em todo lugar (nome, empresa, licença).
- **RSS** em `/pt/rss.xml` e `/en/rss.xml` (novidades).
- **404 de verdade**: endereço desconhecido, verbete ou guia inexistente respondem **status 404** (o esqueleto de carregamento do app já manda 200 antes da página descobrir, então o proxy e uma rota de captura cuidam disso), com `noindex` e links úteis.
- **Rodapé** com seis colunas (Rede, Pessoas, Agentes e desenvolvedores, Recursos, Confiança, Empresa), seletor de idioma, aviso de arte e marca, versão do protocolo. Sem cookie, sem rastreio, sem script de terceiros (`test/privacidade-do-site.test.ts`).
- **Core Web Vitals**: as quatro fontes locais são pré-carregadas pelo cabeçalho `Link` do Next; o rodapé é componente de servidor (só o seletor de idioma é cliente) e as páginas novas não têm imagem sem dimensão. **Não medi** LCP, CLS nem INP (a ferramenta de PageSpeed da skill recusa 127.0.0.1); o gate de design só checa a página parada e o reflow a 200 %.

## 4. Conteúdo editorial

Os tipos estão em `src/conteudo/tipos.ts` (Faq, Verbete, Guia, Novidade). Quem escreve o conteúdo exporta `faqPt`, `faqEn`, `verbetesPt`, `verbetesEn`, `guiasPt`, `guiasEn` em `src/conteudo/index.ts`. Hoje o `index.ts` aponta para `src/conteudo/_exemplo/` (3 FAQ, 3 verbetes, 3 guias, ids `exemplo-*`). Slugs obrigatórios que as páginas já linkam: guias `aprovacao-humana`, `como-participar`, `agentes-e-protocolo`; verbetes `rover`, `rele`, `aprovacao-humana` (`obrigatorios.ts`, com teste). Trocar o conteúdo não exige mexer em nenhuma página.

## 5. Como reproduzir a prova

```bash
npm run build
node scripts/preview.mjs --porta 3965                          # fechado
ROVER_NETWORK_INDEXAVEL=sim node scripts/preview.mjs --porta 3966   # aberto
node scripts/varrer-rodape.mjs http://127.0.0.1:3965           # todo link do rodapé responde 200
node scripts/conferir-sitemap.mjs http://127.0.0.1:3966        # sitemap x páginas: canonical, robots, hreflang e reciprocidade, título e descrição únicos
node scripts/mutacao-seo.mjs                                   # medidor de mutação
```

Auditoria da skill `seo` (`node skills/seo/index.js`): ver a limitação abaixo.

## 6. Resultados (08/11/2026)

### O que foi verificado e passou

- Testes: suíte completa do site 1518 passam, 2 pulados (63 arquivos); `test/seo` e o rodapé: 213 testes em 14 arquivos; `tsc --noEmit` e `eslint` sem erro (o `tsc` silencioso foi provado não cego: acusou um erro de tipo real durante o trabalho).
- Mutação: guarda de defeito letal 32 de 32; Stryker 97,29 % nos módulos de SEO (a primeira rodada deu 74,57 %).
- Gate de design: 18 rotas novas, 2 reprovações (alvo de toque de 22 px no link de pergunta do guia, celular), corrigidas; rodada de conferência em 5 rotas: 0 reprovações.
- Fotos de janela (Chrome headless) abertas e lidas: rodapé em desktop e celular, claro e escuro, em `/pt` e `/en`; 14 páginas novas em desktop claro; 404; ajuda no celular.
- Preview fechado: `/pt` 200, `X-Robots-Tag: noindex, nofollow, noarchive`, `robots.txt` com `Disallow: /`, `sitemap.xml` vazio, `llms.txt` 404, nenhum bloco JSON-LD.
- Preview aberto: `X-Robots-Tag: index, follow, ...`, `robots.txt` com os 10 rastreadores de IA e `Sitemap:`, `sitemap.xml` com 80 endereços, `llms.txt` 200, `rss.xml` 200 `application/rss+xml`.
- `conferir-sitemap.mjs` nos 80 endereços: todos respondem 200, canonical igual ao `<loc>`, meta robots permite indexar, hreflang da página igual ao do sitemap e recíproco, título e descrição únicos dentro de cada idioma, um `h1` em cada. Achado e corrigido nesta rodada: o título do início era só "Rover Network" nos dois idiomas; agora descreve a rede.
- `varrer-rodape.mjs`: 28 links internos e 2 externos em `/pt` e em `/en`, todos 200.
- `validar-schema` da skill `seo` em todos os blocos JSON-LD das páginas início, glossário, ajuda, guias e protocolo: "Nenhum problema de JSON-LD encontrado" em cada um.
- `parse_html` da skill `seo` em 6 páginas (pt e en): título 13 a 44 caracteres (antes da correção do início), descrição 109 a 134, canonical presente, `h1` único, hreflang `pt-BR`, `en`, `x-default`, 11 propriedades Open Graph, schema esperado em cada página.

### O que NÃO foi verificado, e por quê

- `node skills/seo/index.js auditar <url>` **recusou o preview**: a proteção SSRF da skill bloqueia `127.0.0.1` ("Blocked hostname"), e o JSON (`etapas` seguranca_url, pagina, sitemap, acesso_agente_ia, preload_lcp, pagespeed, todas `ok: false`) não contém auditoria alguma. Não contornei a proteção nem expus o preview à internet (sem deploy era a regra). Ficam sem prova: a nota de auditoria técnica da skill, `sitemap_discovery`, `agent_ux_check`, PageSpeed/CrUX e o teste de GEO/AEO contra o site real. O que cobre o mesmo terreno localmente é `conferir-sitemap.mjs` mais os testes. **Rodar a auditoria da skill contra a URL pública assim que o site for aberto.**
- Nenhum rastreador de verdade (Google, Bing, assistentes de IA) viu o site. Indexação, citação por IA e rich results são hipóteses até a primeira rodada em produção.
- Search Console, Bing Webmaster e IndexNow não foram configurados (dependem de conta e de o site estar aberto). Credenciais da skill `seo` ausentes nesta máquina: PageSpeed, Google, DataForSEO, Moz, Bing.
- O sitemap não lista perfis de rover (privacidade) nem tópicos (não há rota global de tópicos); só comunidades, páginas e o conteúdo editorial.
- A página `/entrar` é provisória (a frente de cadastro deve substituí-la; há risco de conflito de arquivo ao juntar).
- O 404 do endereço desconhecido é uma página mínima sem o layout do app (o esqueleto de carregamento do app já manda 200 antes da página descobrir que não há nada; por isso a rota de captura devolve HTML próprio). Funcional, mas sem a marca.
- Conteúdo editorial é de EXEMPLO até o outro agente entregar `src/conteudo/`.
- Termos e Privacidade são "em revisão", por causa do aviso de rascunho não revisado por advogado.
- Inconsistência de licença para resolver: `package.json` diz `AGPL-3.0-only` e os documentos dizem "ou posterior". O texto público diz só "AGPL-3.0".
