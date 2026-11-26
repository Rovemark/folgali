> **Historical.** This direction was replaced on 2026-11-24 by folgali's (`DESIGN-FOLGALI.md`). The lock `test/design-v2.test.ts` is gone and gave way to `test/folgali-design.test.ts`.

# Rover Network: visual direction v2

Rovemark's decision: "I do not want it so childish, and not looking like AI either". This is the direction that replaces the "fabric and stitching" one.

## 1. Reference photos (taken before drawing)

Photographed on 2026-11-07 with headless Chrome, window only, in `docs/fotos-design-v2/ref/` (outside git):

| House | What works | What does NOT work |
|---|---|---|
| rovemark.co | Large, tight Manrope, a single action in blue, a thin navigation bar, short labels | Blue glow behind the hero and a gradient on the title: it is the cliche of "looks like AI" |
| logicaos.com | Small mono labels, hierarchy by scale, a lot of well-used empty space | Constellation of dots and a luminous halo |
| roverhangar.com | The plushes as the product's identity | Blue sky, clouds, 3D world, rounded corners on everything: this is the childish part |
| rede.roverhangar.com (v1) | Structure of the screens | Dashed stitching on everything, pastel cards with shadow, pills, fat buttons, rounded Gabarito, orange as a second color |

The common grammar of the Rovemark houses, which this direction inherits: **Manrope, IBM Plex Mono for labels and metrics, Graphite and Ivory as the base, one action color (Sovereign Blue), a thin line instead of a frame**.

## 2. What stays and what goes

**Stays (Rovemark Brand Kit v1, with no invented palette):**
- Manrope (text and headings) and IBM Plex Mono (labels, handles, numbers).
- Ivory `#F4F1EA` (light background), Graphite `#111318` (dark background), Steel `#A7AFBD` (line and secondary), Sovereign Blue `#3455E8` (only action and focus).
- The plushes, as portraits.

**Decision about the Rover Hangar identity:** roverhangar.com uses blue sky and 3D because it sells a consumer product. Rover Network is a network where people let their rovers speak for them, and the subject is trust, moderation and privacy. It asks for the tone of the Rovemark houses (editorial, technical), with the plush as the only touch of warmth. I did not create any color outside the official tokens.

**Goes (removed from the CSS):**
1. Dashed borders and outlines everywhere (stitching).
2. Card and button shadows (`--sombra` became `none`).
3. Pills (`border-radius: 999px`) on buttons, chips and fields.
4. Radii of 20 to 28 px on cards. Now 2 and 4 px, and a circle only on portraits.
5. Pastel cards and a background on every block: blocks are open, separated by a line.
6. The orange "thread" (`fio`) as a second highlight color. `--fio` is now gray (Steel).
7. A stage with a radial gradient on the rover's sheet.
8. "Beat" and scale animations on buttons.
9. Gabarito and Figtree (rounded fonts). Manrope came in.
10. A brand mark with a needle and a dotted thread. A symbol of two linked nodes came in.

**Must not appear (the anti-AI checklist, below):** text or decorative background gradients, frosted glass, halos or bubbles of light, a centered hero with three icon cards, emoji as an icon, a large diffuse shadow, the same radius on everything, generic marketing texts (the banned list of the house rules, in Portuguese).

## 3. Tokens (all in `src/app/globals.css`, OKLCH, semantic)

| Variable | Role | Light | Dark |
|---|---|---|---|
| `--fundo` | Page background | Ivory | Graphite |
| `--tecido` | Raised surface (field, menu, panel) | Lighter Ivory | Lighter Graphite |
| `--tecido-2` | Hover and zebra | Darker Ivory | Graphite +2 |
| `--linha` | Thin line | | |
| `--linha-forte` | Emphasis line, field border | | |
| `--tinta`, `--tinta-2`, `--tinta-3` | Text, secondary, tertiary | | |
| `--acao`, `--acao-fundo`, `--acao-tinta` | The single action color, selected background, text over the action | Sovereign Blue | Lighter blue (contrast) |
| `--ok`, `--aviso`, `--perigo` (+ `-fundo`) | States, low saturation | | |
| `--foco` | Focus ring | | |
| `--raio` 4px, `--raio-peq` 2px | Radii | | |
| `--sombra` | `none` (kept for compatibility) | | |
| `--fio`, `--fio-forte` | Aliases of `--linha-forte` and `--tinta-2` (compatibility with the social CSS) | | |
| `--f-display`, `--f-corpo`, `--f-mono` | Fonts | Manrope, Manrope, Plex Mono | |

Brand values in OKLCH, computed from the official hexadecimals: Ivory `oklch(0.959 0.010 87.5)`, Graphite `oklch(0.187 0.011 268.1)`, Steel `oklch(0.752 0.022 261.8)`, Sovereign Blue `oklch(0.523 0.224 267.7)`.

Type scale (Manrope): cover `clamp(40px, 6.4vw, 72px)` weight 800, tracking -0.035em, line height 1.02; page title `clamp(30px, 4.6vw, 46px)` weight 800, -0.03em; section 22px weight 700; subtitle 17px weight 700; body 16/1.6; small 14; mono label 12px uppercase, tracking 0.08em.

Grid: 8 px base. Desktop: a 224 px rail, a reading column of up to 704 px, a 320 px side column, a 48 px gap, a maximum width of 1400 px. Vertical rhythm: 16 (inside a group), 32 (between groups), 56 (between sections). A 1 px line to separate, a 2 px line in ink only to open a section (like a newspaper).

## 4. Primitives for the other agents to use

These already existed (kept, with the new look): `.btn` with `.btn-prim`, `.btn-sec`, `.btn-calmo`, `.btn-perigo`, `.btn-peq`; `.etiqueta`; `.retrato`; `.bloco`; `.vazio`; `.painel`; `.opcao`; `.aviso-web`; `.faixa-demo`; `.titulo-pag`; `.sobrelinha`; `.abas-pag`; `.menu`; `.dialogo`.

New in this direction (use these, without inventing a class of your own):
- `.rotulo`: a 12 px uppercase mono label (overline).
- `.secao` + `.secao-cab`: a section with a 2 px line at the top and a header (`h2` on the left, `a` on the right).
- `.numeros` + `.numero` (`.numero-valor`, `.numero-rotulo`): a strip of numbers with vertical lines.
- `.lista-fios`: a list in rows separated by a thin line.
- `.campo`, `.campo-rotulo`, `.campo-ajuda`, `.campo-erro`: forms. `input`, `select` and `textarea` already have the base look.
- `.tag`: a short mono mark; `.selo`: a counter; `.callout` (`.callout-ok`, `.callout-aviso`, `.callout-perigo`): a block notice.
- `.coluna-larga`: makes the content column take the rail and the side column (for editorial and form pages). Sign-up and text pages should use it.
- `.capa`, `.capa-titulo`, `.capa-texto`: an editorial opening.

Rule: color only through a semantic variable. No new hexadecimal in screen CSS.

## 5. Use of the plushes

Portrait (a 1 px circle with the plush's color) and the rover's sheet (a large portrait in a plain panel). No loose stickers, no plush behind text, at most one per screen outside the profile. Empty states show the small rover.

## 6. Motion

A 120 ms transition on color and background, nothing more. No scale, no bounce, no orchestrated entrance. `prefers-reduced-motion` zeroes everything (it already existed and stays).

## 7. Anti-AI checklist (what the gate and the test prove)

| Item | How it is proven |
|---|---|
| No decorative gradient | A test reads the CSS and fails if there is a `linear-gradient` or `radial-gradient` outside an allowed list |
| No decorative dashes | The same test counts `dashed` and `dotted` |
| No `border-radius: 999px` outside circles and counters | The same test |
| No diffuse shadow | The same test (only the floating menu has a short shadow) |
| No `backdrop-filter` | The same test |
| No emoji in texts | The existing content test (`content.test.ts`) |
| WCAG and APCA contrast, focus, 200% zoom, CLS, forced-colors, 3 viewports in 2 themes | The `designer-web-app` gate on every route |
| One action color | A test counts the use of `--acao` as a background only in the primary button, selected and counter |

## 8. What changed in the structure (implemented)

- **Editorial cover at `/pt`** (`src/app/[lang]/page.tsx`): a headline, four checkable facts (100% approved by the person, 0 cookies, AGPL-3.0, Ed25519), "From draft to network, in three steps" as a numbered list (no three icon cards), trending conversations and communities and who has just arrived. The texts live in `src/i18n/social/home.pt.json` and `home.en.json` (key `socHome`).
- **The Timeline moved to `/pt/linha`** (`src/app/[lang]/linha/page.tsx`, the same component as before). The navigation gained "Início" (home, `nav.inicio`), and the tab bar on mobile shows Home, Communities, Notices, Approve and My rover.
- **New brand mark** (`src/components/Brand.tsx`): two nodes linked by a line, the hollow echoes the opening of Rovemark's "o". No needle and no dotted line.
- **Fonts** in `src/lib/fonts.ts`: variable Manrope (`src/fonts/manrope-variable.ttf`, OFL) and IBM Plex Mono.
- **The social CSS was rewritten in layers**: the base file has the tokens and the primitives, and each `social-*.css` has a "v2: editorial" section at the end, which swaps the craft object (note, letter, medal, label, patch, stamp) for line and typography. The old classes still exist, so no screen needed to change logic.

## 9. Proofs

- `test/design-v2.test.ts` (13 tests) reads all the CSS and fails on: dashed or dotted, a pill, a radius above 4 px (except the device frame), a gradient outside the list of functions, frosted glass, a diffuse shadow, a second highlight color, a loose hexadecimal, decorative rotation, a scale animation on a button, a rounded font and the loss of `prefers-reduced-motion`.
- The whole site suite, typecheck and lint.
- The `designer-web-app` gate (`audit --tudo`, 3 viewports, 2 themes, 200% zoom, no motion and forced colors) on every route, with full URLs. Note: `--rotas` requires a full URL; with a relative path the gate opens `file:///pt` and audits an empty page (it happened on the first attempt and the result was discarded).
- Window photos in `docs/fotos-design-v2/` (outside git): `ref/` (references), `final/` (this direction). Taken through the Chrome debugging protocol with device emulation, which respects the 390 px width (headless Chrome crops below 500 px) and reports when the content overflows the width.

## 10. What is still pending

- The sign-up route (`/pt/entrar`, on another front) does not exist yet on this branch: the "Entrar na rede" button on the cover points to it.
- The new editorial pages and the full footer come from other agents and must use the primitives of section 4.
- Languages: the site has the 12 of Rovemark (see `docs/LANGUAGES.md`).
