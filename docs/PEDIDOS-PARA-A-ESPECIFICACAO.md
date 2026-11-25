<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Pedidos para a especificação

Lacunas que o código encontrou e que só uma proposta (`docs/propostas/`, com aceite do Arquiteto) pode fechar. Cada pedido diz o que existe hoje, o risco e uma sugestão. Nada aqui é normativo.

## 1. Lista de revogados assinada pelo emissor (17/11/2026)

**Hoje.** O protocolo diz que o relé consulta a revogação pelo `ProvedorDeAtestados` (seção 7.4) e não define como a lista chega dele ao relé. O emissor do Rover Hangar publica `GET /.well-known/rover-network/emissores.json` (contrato 0.17.0 do Rover Hangar, `validarListaDeEmissores`): `{ versao: 1, protocolo, geradoEm, validadeMaxS, emissores: [{ chave, estado }], revogados: [{ emissor, uid }] }`, **sem assinatura**. O relé hospedado de referência passou a ler essa lista (`RELE_EMISSORES_DESCOBERTA`, `docs/OPERACAO-DO-RELE.md`, seção 15) e não confere assinatura porque o emissor não produz nenhuma: o relé não inventa um formato que ninguém escreve.

**Risco.** A única garantia de origem é o TLS da URL configurada. Quem controlar o caminho (proxy, CDN, DNS com certificado emitido indevidamente) consegue segurar a lista, adiantar o `geradoEm` em até 5 minutos ou acrescentar pares falsos (rovers legítimos recusados até um atestado novo). Não consegue soltar um revogado: o relé é monotônico e recusa lista mais velha que a última aceita. Também não há como um terceiro (outro relé, um auditor) provar o que o emissor publicou num dado momento.

**Sugestão.** Um tipo assinado, no mesmo estilo do atestado:

```json
{
  "tipo": "lista-de-revogados",
  "v": "0.3",
  "emissor": "<chave pública do emissor que assina>",
  "geradoEm": 1900000000,
  "validoAte": 1900003600,
  "revogados": [{ "emissor": "<chave>", "uid": "rvr_..." }],
  "assinatura": "<86 caracteres>"
}
```

- prefixo de domínio próprio, `rover-network/<v>/lista-de-revogados\n`, sobre o JSON canônico sem `assinatura`;
- `emissor` precisa estar entre as chaves confiáveis do relé, e cada par só pode citar chaves do mesmo emissor (a atual e as anteriores que ele declara), o que hoje o relé faz por configuração;
- `validoAte` dá ao relé um teto de idade que vem do emissor, em vez de só da configuração do operador;
- o emissor do Rover Hangar teria de assinar com a chave do atestado (ou uma chave própria para a lista, declarada na descoberta).

## 2. Documento de descoberta do emissor

**Hoje.** O emissor do Rover Hangar publica `GET /.well-known/rover-network` com `{ rede, formato: "provisorio-1", papel: "emissor", protocolo, emissores, lista }`; o relé publica um documento próprio também `provisorio-1`. O protocolo não define nenhum dos dois. O relé de referência aceita a descoberta do emissor só nesse formato e só segue `lista` na mesma origem.

**Sugestão.** Fixar os dois documentos numa proposta, com `papel` (`emissor` ou `rele`), e, para o emissor, o caminho da lista assinada do pedido 1.

## 3. Revogação lembrada (`ate`)

**Hoje.** A seção 3.2 diz que o relé "passa a tratar o rover como inexistente" e a 10.3 chama a tabela de revogações de "espelho da lista do emissor". O emissor do Rover Hangar calcula a lista a cada pedido e tira dela o rover reabilitado. O relé de referência agora guarda o par que saiu da lista como lembrado (`ate`) e só aceita, daquele par, atestado emitido depois (seção 7.4, aditivo).

**Sugestão.** Tornar a regra normativa: "um relé que já viu um par revogado não volta a aceitar atestado desse par com `emitidoEm` anterior à última lista que o trazia". Sem isso, relés diferentes divergem sobre o mesmo rover depois de uma reabilitação.

## 4. Credencial de leitura de rover revogado

**Hoje.** O relé de referência responde `403 atestado_revogado` à credencial VÁLIDA de um rover revogado (seção 7.5, aditivo), em vez de `401 leitura_nao_autorizada`. O código já existia na tabela da seção 7.2; o que mudou é a rota em que ele aparece. Mudança no que trafega entre rover e relé deveria nascer de proposta (`docs/propostas/README.md`): este pedido registra que nasceu do código e precisa ser ratificada.

## 5. Lista velha: abrir ou fechar

**Hoje.** Com a lista de um emissor mais velha que o teto do operador, o relé de referência alerta (log e `/v1/info`) e continua aceitando quem a última lista não revogou.

**Pergunta para o Arquiteto.** Manter assim (uma queda do emissor não derruba a publicação de todos os rovers dele) ou recusar os rovers do emissor cuja lista passou do teto (uma lista retida por um atacante deixa de adiar revogações)? Um meio-termo possível: fechar só depois de um segundo teto, bem maior, configurável.
