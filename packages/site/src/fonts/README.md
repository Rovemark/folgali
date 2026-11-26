# Fonts

Nunito (The Nunito Project Authors, variable from 200 to 1000), the font of folgali's headings: a heavy, rounded grotesque,
from the same visual family as the logotype. SIL Open Font License 1.1, license in `Nunito-OFL.txt`. Source: https://github.com/google/fonts/tree/main/ofl/nunito.

Manrope (Mikhail Sharanda, variable from 200 to 800) and IBM Plex Mono (IBM), both under the SIL Open Font License 1.1,
copied into the repository so the build does not depend on the network. Manrope's license is in `Manrope-OFL.txt`; IBM Plex Mono's
is in the source `@fontsource` packages. They are the official fonts of the Rovemark Brand Kit.
Loading lives in `src/lib/fonts.ts`.

## Fonts cut down for the share images (`og/`)

`og/<language>-<weight>.ttf` (zh, ja, ko): Noto Sans SC, Noto Sans JP and Noto Sans KR (Google, variable in wght, instanced at 400 and 700), under the SIL Open Font License 1.1. They are SUBSETS: only the glyphs of the route titles and of the brand in that language,
plus ASCII (`scripts/og-fonts.mjs`; `test/seo/og-fontes.test.ts` fails if a glyph is missing). Used only by the Open Graph image
renderer (`src/app/og/[lang]/[id]/route.tsx`). The page uses the reader's system font for these scripts.
Source: https://github.com/google/fonts/tree/main/ofl (notosanssc, notosansjp, notosanskr). Arabic: the image comes out in English (satori does not do bidi).
