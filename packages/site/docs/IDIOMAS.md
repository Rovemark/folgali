# Idiomas: os mesmos 12 do site da Rovemark

pt, en, es, fr, de, it, nl, ru, ar, zh, ja, ko. O português é a fonte: toda frase nasce nele e os outros onze correm atrás.
O árabe é da direita para a esquerda.

## Onde mora cada texto

| o quê | arquivos |
|---|---|
| interface | `src/i18n/<idioma>.json`, `casa.<idioma>.json` (regra da casa e Sobre), `entrar.<idioma>.json`, `rodape.<idioma>.json`, `institucional.<idioma>.json`, `social/*.<idioma>.json` |
| FAQ, glossário, guias, novidades | `pt` e `en` em TypeScript (`src/conteudo/*.pt.ts`, `*.en.ts`); os outros dez em `src/conteudo/dados/<idioma>.json` |
| índice de tudo | `src/i18n/pacotes.ts` (import estático dos 12) e `src/conteudo/index.ts` |
| textos de componentes de cliente | `src/i18n/cliente.json` (só 6 frases, gerado), lido por `src/lib/i18n-cliente.ts` |
| lista de idiomas, formatação | `src/lib/i18n-base.ts` (leve, pode ir ao navegador); `src/lib/i18n.ts` traz os dicionários (só servidor) |

Componente de cliente nunca importa `@/lib/i18n` com `dict`: levaria os 12 dicionários (cerca de 3 MB) para o navegador.

## Como se traduz

`node scripts/traduzir-site.mjs contar | estado | semear | traduzir [idioma ...] | montar [--so=familias] [idioma ...] | faltam <idioma>`

1. coleta toda string traduzível do português (cerca de 2.200 únicas);
2. traduz cada string única uma vez por idioma pelo Logica Router, em lotes de 6 KB, 3 chamadas ao mesmo tempo;
3. guarda em `.traducoes/<idioma>.json` (fora do git; retomável: se cair, o que já foi traduzido está no disco);
4. `montar` grava os arquivos do idioma com a mesma forma do português.

Recusa o lote que perder um marcador (`{n}`, `` `código` ``, URL, tag) ou trouxer travessão. O que não é texto não se traduz:
id, slug, url, bloco de código, e as listas `ver`, `relacionados` e `perguntas` (ids de rota e de conteúdo).
Cuidado herdado de um defeito real: a regra é por NOME DE CHAVE, então nome de chave que também é rótulo ("nome", "licenca",
"seguranca") não pode entrar na lista de dados, senão o rótulo fica em português.

## Trava de qualidade

`test/i18n/doze-idiomas.test.ts` roda para os 12 idiomas: mesma forma do português, mesmos marcadores, sem travessão, mesmos
números em cada resposta, mesmos ids e slugs, tamanho da resposta curta por escrita, e texto próprio (não cópia do inglês).
A tradução é de máquina: não houve revisão por falante nativo. Isto está dito em `/sobre` e deve ser dito a quem for indexar.

## Árabe, chinês, japonês, coreano

- `src/app/idiomas.css`: fonte do sistema para CJK e árabe, entrelinha maior, sem espaçamento entre letras, quebra por frase.
- CSS em propriedades lógicas (`margin-inline-start` etc.): o espelho do árabe sai sem regra por idioma.
- Imagem Open Graph: chinês, japonês e coreano usam fonte própria recortada em `src/fontes/og/<idioma>-<peso>.ttf` (`scripts/fontes-og.mjs`);
  sem o arquivo a imagem sai em inglês em vez de quadrados vazios. Árabe sai sempre em inglês: o satori não faz ordem bidirecional nem mede
  palavra ligada (testado, saía invertido). Nenhuma fonte vem de rede em tempo de execução.
- Prova visual: `node scripts/prova-idiomas.mjs --idiomas ar,zh --saida <pasta>`; abra cada foto.

## O que vai para o git

Vão os arquivos montados (`src/i18n/<idioma>*.json`, `src/conteudo/dados/<idioma>.json`, `src/i18n/cliente.json`); o cache
`.traducoes/` não vai (fora do git). Numa máquina nova ou num worktree, o cache não existe: `semear` o refaz a partir dos arquivos
montados.

### Mudar uma frase em português

1. `semear` ANTES de mexer no pt: cada frase em pt é casada com a tradução que está no mesmo caminho do arquivo do idioma e entra no
   cache (nunca sobrescreve o que já está lá). Sem isso, toda frase vira "faltando".
2. Edite o pt (e o en, que é escrito à mão). `estado` mostra quantas frases ficaram sem tradução.
3. `traduzir` (pelo Router) ou `exportar 1 <idiomas>`, tradução fora do Router em `.traducoes/agentes/<idioma>-1.out.json`,
   `validar` e `importar`.
4. `montar --so=<famílias> <idiomas>`: só as famílias que você mexeu. A família é o nome do arquivo pt sem `.pt.json`
   (`institucional`, `rodape`, `social/inicio`, `social/folgali`), `base` para `pt.json` e `conteudo` para `src/conteudo/dados`. Sem
   `--so`, `montar` regrava os arquivos de todas as famílias, inclusive as que outra frente está mexendo.
5. Confira o `git diff` dos arquivos montados. Uma tradução ajustada à mão direto no arquivo montado (sem passar pelo cache) volta à
   versão do cache no `montar`: em 24/11/2026, "J'aime" virou "Aimer" no francês assim. Desfaça o que não for das frases que você mudou.
6. Bloco de código (`codigo`) não se traduz: o `montar` copia o do pt. Se você só corrigiu o diff à mão, copie o bloco também.
Em 09/11/2026 o Router estava sem o Claude (castigo da assinatura) e 7.300 strings foram traduzidas por subagentes do Claude com o
mesmo validador (`validar`, `importar`); `retoque-exportar`/`retoque-importar` corrigem termos em português que sobraram e textos
acima do limite de SEO (`limites`).
