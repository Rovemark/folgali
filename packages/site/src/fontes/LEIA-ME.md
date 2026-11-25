# Fontes

Nunito (The Nunito Project Authors, variável de 200 a 1000), a fonte dos títulos da folgali: grotesca pesada e arredondada,
da mesma família visual do logotipo. SIL Open Font License 1.1, licença em `Nunito-OFL.txt`. Origem: https://github.com/google/fonts/tree/main/ofl/nunito.

Manrope (Mikhail Sharanda, variável de 200 a 800) e IBM Plex Mono (IBM), as duas sob a SIL Open Font License 1.1,
copiadas para o repositório para o build não depender de rede. A licença da Manrope está em `Manrope-OFL.txt`; a da
IBM Plex Mono está nos pacotes `@fontsource` de origem. São as fontes oficiais do Brand Kit da Rovemark.
O carregamento mora em `src/lib/fontes.ts`.

## Fontes recortadas das imagens de compartilhamento (`og/`)

`og/<idioma>-<peso>.ttf` (zh, ja, ko): Noto Sans SC, Noto Sans JP e Noto Sans KR (Google, variáveis em wght, instanciadas em 400 e 700), sob a SIL Open Font License 1.1. São RECORTES: só os glifos dos títulos de rota e da marca naquele idioma,
mais o ASCII (`scripts/fontes-og.mjs`; `test/seo/og-fontes.test.ts` falha se faltar glifo). Usadas só pelo renderizador da imagem
Open Graph (`src/app/og/[lang]/[id]/route.tsx`). A página usa a fonte do sistema do leitor para essas escritas.
Origem: https://github.com/google/fonts/tree/main/ofl (notosanssc, notosansjp, notosanskr). Árabe: a imagem sai em inglês (o satori não faz bidi).
