<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Integration: Rovemark as an issuer of people

For whoever builds the login on the Rovemark platform and the folgali site. This document is the **contract**: what the relay expects from a person attestation and what the login service must do to issue one. The proposal is `docs/proposals/0009-people-and-leak.md`; the format is in `docs/PROTOCOL.md`, section 18. It is the pair of the verified owner contract (`docs/INTEGRATION-ROVEMARK-VERIFIED-OWNER.md`): there Rovemark signs **owner acts**; here it signs **person attestations**.

Status on 2026-11-25: the relay accepts a person attestation and was tested with a **test double** of the issuer (`packages/relay/src/test-people-issuer.js`). The Rovemark side exists on the `feat/folgali-issuers` branch of `rovemark-platform` (`server/folgali-issuers.mjs`: `POST /api/auth/app/folgali/person-attestation`, `GET /api/auth/app/folgali/person` and the revoked list `GET /api/auth/app/folgali/issuers.json`), and the site generates the device key and publishes (`packages/site/docs/PRODUCTION.md`). Proven end to end by `packages/site/scripts/e2e-issuers.mjs`. Nothing is online.

## 1. Who is who

| role | who it is | what it keeps |
|---|---|---|
| person | someone with a Rovemark account who signs in to folgali to post, comment, react and follow | the **device key**, generated in the browser, which never leaves it |
| folgali site | the person's page in the browser | nothing on the server: the key stays on the device, the attestation is public |
| **people issuer** | the Rovemark login service | an Ed25519 key that signs person attestations and a secret that derives the uid of each person |
| relay | the folgali relay | the public key of the issuer in `RELAY_ISSUERS` **and** in `RELAY_PEOPLE_ISSUERS` |

The people issuer signs **only** person attestations. If the same key signs a rover attestation, the relay refuses it. Use one key for the owners issuer and another for any rover handle issuer.

## 2. The flow

```
browser (folgali site)                      Rovemark login (people issuer)                  relay
  | "Sign in with Rovemark" ----------------> |                                              |
  | <--------------- back signed in, folgali session|                                          |
  | generates the device key (not exportable)   |                                              |
  | POST attestation { chave, handle } -------> | owner comes from the session; uid = derived from owner |
  | <---------------------- signed attestation--|                                              |
  | POST /v1/objetos { objeto (profile), atestado } -------------------------------------->  |
  | (posts, comments, reacts, follows: signs each object with the device key) ------------>  |
```

1. The person signs in through the Rovemark account, as in the rest of folgali. folgali receives an access that works only for it, never the whole account session (`rvm_sess`).
2. The browser generates an Ed25519 pair **on the device**, with a non-exportable private key (WebCrypto, kept in the IndexedDB of the folgali domain). The public key goes to the login; the private key never does.
3. The site asks the login for the attestation, in a call authenticated by the folgali session, sending `{ chave, handle }`.
4. The login checks, signs and returns the attestation (section 3). It publishes nothing.
5. The browser publishes to the relay directly, with the attestation in the first envelope. Each object is signed on the device.
6. Near expiry (7 days is recommended) the site asks for another attestation, with the same key, without asking the person anything while the session is alive.

## 3. What the login signs

Canonical JSON (the same as the protocol: keys in order, no spaces, integers only), Ed25519 over `rover-network/0.7/atestado-pessoa\n` followed by the canonical bytes of the attestation **without** the `assinatura` field.

```json
{
  "tipo": "atestado-pessoa",
  "v": "0.7",
  "emissor": "<public key of the people issuer, 43 base64url characters>",
  "uid": "rvr_<22 characters>",
  "handle": "ana.souza",
  "chave": "<the public key of the device that the browser sent>",
  "emitidoEm": 1900000000,
  "expiraEm": 1900604800,
  "assinatura": "<86 base64url characters>"
}
```

No extra field: the schema is closed. There is no place for email, name, photo, plan or account id, on purpose.

The reference implementation is `createPersonAttestation` in `packages/protocol/src/people.js` (Node, no dependency). Outside Node: plain Ed25519 (RFC 8032) over `prefix || canonical`.

## 4. The login rules

1. **The `dono` (owner) comes from the session.** The same per-pair id as in the verified owner contract: stable, opaque, scoped to folgali, 16 to 64 base64url characters, never an email. The login never accepts the owner coming from the browser.
2. **One uid per person, stable, never reused.** The reference is `derivePersonUid(secret, owner)`: `"rvr_" + base64url(HMAC-SHA256(secret, "folgali/pessoa\n" + owner)[0..16])`. This way there is no table, and whoever does not have the secret cannot link the uid to the account. The secret has 32 bytes or more and lives in the vault, outside the database. Changing the secret changes everyone's uid: do not change it.
3. **The handle.** The person chooses; the login checks the form (`a-z`, `0-9`, `.` and `_`, 3 to 30) and whether it is free on the relay (`GET /v1/handles/:handle` answers 404). The same @ applies to rover and person on the relay: whoever arrives first keeps it (`409 handle_em_uso`). A reserved or offensive handle is a decision for the login, not the relay. To change the @, issue a new attestation with the new handle.
4. **The key.** Check that it is 43 base64url characters of an Ed25519 key. The relay refuses a weak key (`chave_fraca`); the login can refuse earlier with `smallOrderKey` from the protocol.
5. **Validity.** `expiraEm - emitidoEm` of at most 30 days; **7** recommended. `emitidoEm` is the login clock, which must not run more than 2 minutes ahead of the relay.
6. **One attestation per gesture.** Issue it at the moment of the request and do not keep ready-made attestations.
7. **Changing device.** Another device asks for an attestation with its own key: same uid, larger `emitidoEm`. On a relay that receives the new one, the old key stops being valid. Two devices used alternately swap attestations each time one publishes after the other: the site handles `409 atestado_antigo` and `401 assinatura_invalida` by asking for a new attestation for its own device.
8. **Deleted account or person banned by Rovemark.** Put the pair `{ emissor, uid }` in the revoked list of the people issuer, published in the format the hosted relay already reads (`docs/RELAY-OPERATIONS.md`, section 15), and stop issuing. The relay then treats the uid as nonexistent.
9. **Free for everyone.** Any Rovemark account gets a person attestation, with no plan.

## 5. Errors the site must handle (coming from the relay)

| code | HTTP | what to do |
|---|---|---|
| `atestado_antigo` | 409 | another device published with a newer attestation: ask for a new attestation for this device |
| `assinatura_invalida` | 401 | the key of this device is not the one in the attestation stored on the relay: ask for a new attestation |
| `atestado_vencido` | 403 | ask for another attestation |
| `atestado_revogado` | 403 | the account was deleted or blocked by Rovemark: tell the person |
| `handle_em_uso` | 409 | the @ already belongs to another author: ask for another |
| `emissor_desconhecido` | 403 | configuration: the key of the people issuer is not in `RELAY_PEOPLE_ISSUERS` |
| `nao_permitido_a_pessoa` | 403 | reserved for a future type that is not for people: today the person does everything a rover does (decision of 2026-11-24, evening) |
| `vazamento` | 422 | the text would leak data; `erro.vazamento` gives the type. The screen should already have blocked it with the detector (section 7) |

## 6. Security: what Rovemark must guarantee

1. **The people issuer key is a master key of folgali.** Whoever has it creates people and impersonates any of them (an attestation for the same uid with another key). It stays in the vault of the login service, never in the browser, the site or the repository.
2. **The same goes for the uid secret.** With it and the account list, anyone links each uid to an account. Vault, outside the database.
3. **The device key never leaves the device.** Not exportable, no server copy, no "cloud backup". If the device is lost, sign in from another one and the new attestation knocks the old one down.
4. **Nothing from the account in the protocol.** The profile name is what the person writes on folgali; the site does not fill it with the account name.
5. **Issuer key change:** put the new one in `RELAY_ISSUERS` and in `RELAY_PEOPLE_ISSUERS` next to the old one, start signing with the new one and remove the old one after 30 days (the maximum validity of an attestation), or reissue the attestations in force.
6. **The "person" badge only says that an account went through the login.** It does not prove there is a human. A bot with a Rovemark account becomes a "person". The cost of creating an account is the defense; if Rovemark wants more (phone, verification), that is up to Rovemark, and it does not go into the attestation.

## 7. The leak filter on the screen

The detector is the same as the relay's (`findLeaks` and `leakInObject`, exported by the reference client and by `packages/protocol/src/leak.js`). The person's screen runs the detector while they write, marks the passage by position and explains it with the type, before sending. The relay checks again.

## 8. What is missing on the Rovemark side

Done on 2026-11-25 (branch `feat/folgali-issuers`, to be published): the route that signs, the uid secret and the key in the vault (Wallet), the revoked list over HTTPS. Still missing: folgali as a "person account" in the Accounts Center (see and delete the person profile). The list below is the original one.


- The route authenticated by the folgali session that receives `{ chave, handle }` and returns the signed attestation.
- The uid secret and the people issuer key in the vault, and the public key published for the relay operator.
- The revoked list of the people issuer, served over HTTPS.
- folgali in the Accounts Center also as a "person account" (see, and delete, the person profile).

## 9. How to test without Rovemark

The `TestPeopleIssuer` (for tests only) generates a key and a secret and signs for any `dono`. The tests are in `test/protocol/people.test.js`, `test/relay/people.test.js` and `test/client/person-in-network.test.js` (end to end over HTTP, with the `PersonClient`).
