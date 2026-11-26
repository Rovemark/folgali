# Signing in to folgali with the Rovemark account (the site side)

folgali has no login of its own and stores no password. The contract with Rovemark is in `docs/LOGIN-FOLGALI.md` of the `rovemark-platform`
repository. This is the site side.

## Path

1. "Entrar com a Rovemark" and "Criar conta" lead to `/api/auth/rovemark/inicio?lang=<language>[&tela=criar][&destino=/<language>/...]`.
   The server generates the PKCE verifier and the state, stores both in the sealed cookie and redirects to
   `{FOLGALI_ROVEMARK_API}/api/auth/oauth/rovemark/start?app=folgali&volta=...&desafio=<S256>&estado=...`.
2. Rovemark returns to `/api/auth/rovemark/callback?codigo=...&estado=...`. The site checks the state against the cookie
   (in constant time, a request of at most 10 minutes) **before** any call, exchanges the code for the tokens
   (`POST /api/auth/app/exchange`, server to server), keeps the tokens encrypted in the vault and leaves only the session id in the cookie.
3. On the pages, `currentPerson()` reads the session and renews the token when less than a minute is left before it expires
   (`POST /api/auth/app/refresh`), one renewal at a time per session. A 401 on renewal ends the session here too.
4. "Sair" (sign out, `POST /api/auth/sair`) revokes the family at Rovemark, deletes the session and the cookie.

## The Accounts Center asks folgali

`POST /api/rovemark/ligados`, `/api/rovemark/ligados/remover` and `/api/rovemark/conta-apagada`, signed with
`x-rvm-assinatura: t=<unix>,v1=<hex HMAC-SHA256(RVM_FOLGALI_SECRET, "<t>.<raw body>")>`. The site checks in constant time and
refuses a `t` more than 5 minutes off. Without the secret, the three answer 503 and the Center shows "em breve" (coming soon).
The list of linked items receives the Rover Hangar rovers (through Rovemark, `hangar-rovers`) and the agents the person releases
(`/api/agents/claim`), in `src/lib/folgali/vault.ts`.

## The Rovemark issuers (a person writes, an owner claims)

The session's limited access (`rmapp_at_`) also asks Rovemark, server to server, for the person attestation of the device key and
the owner acts (`/api/auth/app/folgali/person-attestation`, `/owner-act` and `/person`). The site exposes to the browser only its own routes,
all requiring `application/json` (a form from another site does not get through) and the session: `GET /api/person`, `POST /api/person/attestation`,
`POST /api/person/publish`, `POST /api/person/reactions` and `POST /api/agents/claim`. The token never goes to the browser. Details in `docs/PRODUCTION.md`.

Rovemark also calls `POST /api/rovemark/hangar-rovers` (signed like the other Accounts Center ones) with the full list of the person's
Rover Hangar rovers, and `/api/rovemark/ligados/remover` now brings, for an outside agent, the already signed `tirar` act.

## The cookie

Only one, `folgali_sessao`: httpOnly, Secure, SameSite=Lax, 30 days, sealed with AES-256-GCM. It carries the login request in progress
(verifier, state, destination) and/or the session id. The Rovemark tokens (`rmapp_at_`, `rmapp_rt_`) never go to the browser.
No tracking, advertising or metrics cookie. Only `src/lib/folgali/session.ts` touches a cookie, and `test/site-privacy.test.ts` enforces it.

## Variables (no secret in the repository)

| variable | what for | default |
|---|---|---|
| `FOLGALI_SESSION_SECRET` | cookie seal and encryption of the tokens in the vault (32+ characters). Without it, the buttons stay "em breve" | none |
| `FOLGALI_ROVEMARK_API` | base of Rovemark's public API | `https://api.rovemark.co` |
| `FOLGALI_ROVEMARK_RETURN` | the return registered at Rovemark | `https://folgali.com/api/auth/rovemark/callback` |
| `RVM_FOLGALI_SECRET` | secret of the bridge to the Accounts Center (32+ characters, the same as Rovemark's API) | none |
| `FOLGALI_DATA_DIR` | vault folder (file `cofre.json`, permission 600) | `.folgali-dados/` (outside git); in the image, `/app/.folgali-dados` with a named volume |

The old Portuguese names of these variables are still accepted, with a warning in the log (`src/lib/legacy-env.ts`).

Test locally: see "Testar localmente" (test locally) in the Rovemark document. Outside production Rovemark accepts the return
`http://localhost:3000/api/auth/rovemark/callback`; start the site on port 3000 with `FOLGALI_ROVEMARK_RETURN` at that address and
`FOLGALI_ROVEMARK_API` pointing to the local API.

## Proofs

`scripts/e2e-login-rovemark.mjs`: the whole journey with the REAL Rovemark API (temporary database, external network forbidden) and the REAL
folgali site (standalone build). On 2026-11-25: 13 of 13 checks right (the start accepts the site's request, the person
approves, the return exchanges the code, the vault holds no token in clear, `/pt/entrar` shows who signed in, the Accounts Center asks the
site through the signed route, signing out revokes the family and the Center sees the session ended; deleting the account at Rovemark reaches the site
signed and the vault forgets the person). It does not cover against the real API: renewal (the access token lives 15 minutes; it is proven
in the test with the fake Rovemark).


`test/folgali-login.test.ts` (fake Rovemark, nothing leaves the computer): PKCE of RFC 7636, state checked before calling
Rovemark, expired request, canceled, exchange refused, a single cookie with HttpOnly/Secure/SameSite=Lax, tokens encrypted in the vault
(the file does not contain `rmapp_`) with permission 600, serialized renewal, 401 ends the session, sign-out revokes, and the three Accounts Center routes
(503 without the secret, 401 for a wrong or old signature, 400 for a malformed body, list, remove and delete everything of the person).
