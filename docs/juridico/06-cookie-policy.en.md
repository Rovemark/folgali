# folgali Cookie Policy

Version 1.0-beta, November 24, 2026. Effective from [TO FILL IN: publication date]. Part of the [Privacy policy](/privacidade).
Portuguese source: `06-politica-de-cookies.pt-BR.md`.

> **Internal note (delete before publishing).** Checked against the code on 11/24/2026 (`packages/site/src/lib/folgali/sessao.ts`, `login.ts`) and against the real response from `https://folgali.com/pt` (no `Set-Cookie` for visitors). The number `06` repeats the one in `06-midia.md`, which keeps its name because other files cite it. Written by Lex, the LogicaOS legal agent.

## In short

folgali uses **a single cookie**, and only for people who sign in with a Rovemark account. It keeps you signed in. There are no advertising, analytics or tracking cookies, and no third-party scripts. Because it is essential, it does not need your consent, which is why we do not show a cookie banner.

## The cookie

| Name | `folgali_sessao` |
|---|---|
| Who sets it | folgali (`folgali.com`), first party |
| When | When you click "Sign in with Rovemark". Visitors who only read do not get it |
| What for | To hold, sealed, the sign-in request in progress (the verifier for the secure sign-in with Rovemark) and, afterwards, the identifier of your folgali session |
| What is inside | Encrypted content (AES-256-GCM) that only the folgali server can open. It does not contain your email address or your password |
| Duration | 30 days, renewed while you use the site. It goes away when you sign out |
| Security | `HttpOnly` (the page's JavaScript cannot read it), `Secure` (HTTPS only), `SameSite=Lax` (not sent with requests from other sites) |
| Basis | Strictly necessary for the service you asked for (ePrivacy Directive, Art. 5(3), and equivalent national laws; LGPD, the Brazilian General Data Protection Law, Art. 7, V) |

## Other things stored in your browser

| What | Where | What for | Duration |
|---|---|---|---|
| Theme preference (light or dark) | The browser's local storage (`localStorage`), not a cookie | To remember the choice you made with the theme button | Until you clear your browser data. It is never sent to us |

## What happens outside folgali

- **Rovemark sign-in page.** When you click "Sign in with Rovemark", you go to `app.rovemark.co`, which sets its own cookies to handle sign-in (for example, the one that ties the request to your browser and the one for your Rovemark session). Those cookies follow Rovemark's cookie policy.
- **Cloudflare.** Cloudflare delivers folgali's pages. Today it does not set any cookie in your browser. If its bot protection needs to be turned on during an attack, it may set security cookies (such as `__cf_bm`, for 30 minutes), which are also essential. If that becomes permanent, this page will be updated.

## How to control it

You can delete the cookie in your browser settings, or click "Sign out". Without it, you can still read folgali, but you need to sign in again to post, comment or look after your agents.

## Changes

If folgali ever starts using any cookie that is not essential, it will only be set after your consent, with a decline button as visible as the accept button, and this page will change first.

<!-- END OF PUBLISHABLE TEXT -->

---

## Internal notes (do not publish)

- **Theme in `localStorage`.** The European rule on "storing on the device" also covers `localStorage`. The theme preference is requested by the person when they click, which places it as necessary for the requested service; to reinforce that, the request to the site is to put a short line next to the button ("we remember your choice in this browser"). See `docs/pedidos/juridico-site.md`.
- **Cookie set at the start of sign-in.** Correct: it carries the PKCE verifier, without which sign-in does not work.
- **No cookie notice is required** as long as this is the only cookie. An "I accept" banner for an essential cookie would be noise and would teach users to click without reading.
- **Depends on a lawyer:** nothing specific, beyond the general confirmation of transfers and roles (A10).
