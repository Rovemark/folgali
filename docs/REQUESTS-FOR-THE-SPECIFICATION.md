<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Requests for the specification

Gaps the code found that only a proposal (`docs/proposals/`, accepted by Rovemark) can close. Each request says what exists today, the risk and a suggestion. Nothing here is normative.

## 1. Revoked list signed by the issuer (2026-11-17)

**Today.** The protocol says the relay checks revocation through the `AttestationProvider` (section 7.4) and does not define how the list gets from the issuer to the relay. The Rover Hangar issuer publishes `GET /.well-known/rover-network/emissores.json` (Rover Hangar contract 0.17.0, `validarListaDeEmissores`): `{ versao: 1, protocolo, geradoEm, validadeMaxS, emissores: [{ chave, estado }], revogados: [{ emissor, uid }] }`, **with no signature**. The hosted reference relay now reads this list (`RELAY_ISSUERS_DISCOVERY`, `docs/RELAY-OPERATIONS.md`, section 15) and does not check a signature because the issuer produces none: the relay does not invent a format that nobody writes.

**Risk.** The only guarantee of origin is the TLS of the configured URL. Whoever controls the path (proxy, CDN, DNS with a wrongly issued certificate) can hold the list back, move `geradoEm` forward by up to 5 minutes, or add false pairs (legitimate rovers refused until a new attestation). They cannot release a revoked pair: the relay is monotonic and refuses a list older than the last one accepted. Also, there is no way for a third party (another relay, an auditor) to prove what the issuer published at a given moment.

**Suggestion.** A signed type, in the same style as the attestation:

```json
{
  "tipo": "lista-de-revogados",
  "v": "0.3",
  "emissor": "<public key of the signing issuer>",
  "geradoEm": 1900000000,
  "validoAte": 1900003600,
  "revogados": [{ "emissor": "<key>", "uid": "rvr_..." }],
  "assinatura": "<86 characters>"
}
```

- its own domain prefix, `rover-network/<v>/lista-de-revogados\n`, over the canonical JSON without `assinatura`;
- `emissor` must be among the relay's trusted keys, and each pair may only cite keys of the same issuer (the current one and the earlier ones it declares), which the relay does today through configuration;
- `validoAte` gives the relay an age limit that comes from the issuer, instead of only from the operator's configuration;
- the Rover Hangar issuer would have to sign with the attestation key (or with a key of its own for the list, declared in discovery).

## 2. Issuer discovery document

**Today.** The Rover Hangar issuer publishes `GET /.well-known/rover-network` with `{ rede, formato: "provisorio-1", papel: "emissor", protocolo, emissores, lista }`; the relay publishes a document of its own, also `provisorio-1`. The protocol defines neither. The reference relay accepts the issuer's discovery only in this format and only follows `lista` on the same origin.

**Suggestion.** Fix both documents in a proposal, with `papel` (`emissor` or `rele`, meaning issuer or relay) and, for the issuer, the path of the signed list from request 1.

## 3. Remembered revocation (`ate`)

**Today.** Section 3.2 says the relay "starts treating the rover as nonexistent" and 10.3 calls the revocations table a "mirror of the issuer's list". The Rover Hangar issuer computes the list on every request and removes the rehabilitated rover from it. The reference relay now keeps the pair that left the list as remembered (`ate`) and, for that pair, only accepts an attestation issued later (section 7.4, additive).

**Suggestion.** Make the rule normative: "a relay that has already seen a revoked pair does not accept again an attestation for that pair with `emitidoEm` earlier than the last list that carried it". Without this, different relays disagree about the same rover after a rehabilitation.

## 4. Read credential of a revoked rover

**Today.** The reference relay answers `403 atestado_revogado` to the VALID credential of a revoked rover (section 7.5, additive), instead of `401 leitura_nao_autorizada`. The code already existed in the table of section 7.2; what changed is the route where it appears. A change in what travels between rover and relay should come from a proposal (`docs/proposals/README.md`): this request records that it came from the code and needs to be ratified.

## 5. Stale list: open or closed

**Today.** When an issuer's list is older than the operator's limit, the reference relay raises an alert (log and `/v1/info`) and keeps accepting whoever the last list did not revoke.

**Question for Rovemark.** Keep it this way (an issuer outage does not stop all of its rovers from publishing) or refuse the rovers of the issuer whose list passed the limit (a list held back by an attacker no longer delays revocations)? A possible middle ground: close only after a second, much larger, configurable limit.
