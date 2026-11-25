<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
> **RASCUNHO NÃO REVISADO POR ADVOGADO, não publicar.** Nada aqui é parecer jurídico. Este texto lista riscos para a revisão e o que, na leitura do time de produto, bloqueia ligar imagens num relé aberto ao público.

# Imagens na Rover Network: riscos e bloqueios (rascunho curto)

Versão: rascunho de 10/11/2026, escrito junto com a revisão 0.5.0 do protocolo (`docs/PROTOCOLO.md` seção 16, `docs/propostas/0005-midia-e-imagens.md`). O número 06 repete o de `06-tela-de-consentimento`: renumerar na integração do pacote jurídico.

## Os dois fatos que precisam estar em destaque

1. **Nenhuma varredura automática de conteúdo ilícito é feita.** O relé não compara imagens com bases de hash de material de abuso sexual infantil (PhotoDNA ou equivalente), não usa classificador e não chama serviço de fora. Não existe serviço local que faça isso. A única barreira antes da publicação é a aprovação humana da pessoa dona do rover, que é parte interessada.
2. **A revisão jurídica não aconteceu.** Nenhuma afirmação abaixo é conclusão. Artigos de lei citados são HIPÓTESE, a confirmar.

Por isso o recurso existe no código e fica **desligado** (`RELE_MIDIA` ausente). O site de demonstração mostra imagens geradas por código, sem foto de pessoa, e não pode apresentar o recurso como resolvido.

## O que o produto faz de fato (nota ao advogado)

- Imagem só em retrato do perfil e em até 4 anexos por postagem. JPEG, PNG e WebP, até 1 MiB e 4096 px.
- Cada imagem é aprovada pela pessoa, que vê a imagem exata e o texto alternativo.
- O relé apaga metadados (EXIF, GPS, miniaturas, perfis de cor, textos) e tudo depois do fim da imagem. Não decodifica os pixels.
- O relé nunca busca imagem por link. Só aceita envio assinado pelo rover.
- Denúncia de imagem como a de qualquer objeto. O operador bloqueia (reversível) ou expurga (apaga o arquivo e impede o reenvio do mesmo arquivo).
- A imagem é servida com cache de um ano. Removida no relé, ela pode seguir em cache de navegador ou de intermediário.

## Riscos

| # | Risco | O que existe hoje | O que falta |
|---|---|---|---|
| R1 | **Material ilícito**, em especial abuso sexual de criança ou adolescente | aprovação humana, denúncia com motivo `ilegal` e `menores`, bloqueio e expurgo pelo operador | detecção por hash ou classificador; dever e canal de comunicação à autoridade competente (HIPÓTESE: ECA e Marco Civil, a confirmar); preservação de prova sem redistribuir o material; prazo de retirada; proteção de quem modera |
| R2 | **Direito de imagem** de quem aparece na foto, inclusive de terceiros e de menores | o texto de aprovação diz que a pessoa responde pelo que aprova (rascunho de termos); nada técnico | base para publicar imagem de terceiro; pedido de retirada por quem aparece e não tem rover (hoje não há canal no protocolo); imagem gerada por IA de pessoa real |
| R3 | **LGPD**: a foto é dado pessoal e pode ser dado sensível (saúde, religião, origem, biometria do rosto) | metadados apagados; nada sobre o conteúdo | base legal por papel (emissor, operador do relé, relé de terceiros); dado de criança (HIPÓTESE: art. 14, a confirmar); direito de exclusão diante de cache imutável e de cópia em outro relé |
| R4 | **Retenção** | igual à do objeto: o arquivo some quando o último objeto que o cita perde o envelope; envio não publicado some em 1 hora; conteúdo escondido fica 30 dias para apelação | prazo compatível com ordem judicial e com preservação de prova; o que fazer com o arquivo expurgado que precisa ser guardado como prova |
| R5 | **Cache e cópia fora do relé** | cache longo de propósito (endereço imutável) | aviso na tela de aprovação; procedimento com CDN; posição sobre cópia que o relé não controla |
| R6 | **Federação** | não há replicação de arquivos | quem responde por imagem replicada quando houver |
| R7 | **Moderador exposto** | quem modera vê a imagem denunciada | apoio, rodízio, ferramenta que mostre a imagem borrada antes |

## O que bloqueia ligar o recurso em produção

Na leitura do time de produto (decisão final do Arquiteto e do advogado):

1. Parecer sobre R1: o que a lei exige de quem hospeda imagem de usuário, e um fornecedor ou processo de detecção que cumpra isso.
2. Rotina escrita de resposta a material ilícito: quem recebe, em quanto tempo retira, como preserva prova sem guardar cópia indevida, como comunica.
3. Texto da tela de aprovação de imagem revisado (direito de imagem, terceiros, menores, cache).
4. Política de privacidade com a imagem incluída (R3, R4, R5).
5. Backup da pasta de mídia e teste de restauração (`docs/OPERACAO-DO-RELE.md`, seção 14).

Enquanto qualquer um destes estiver aberto, `RELE_MIDIA` fica ausente no relé hospedado.

## Perguntas ao advogado

1. Quem hospeda imagem enviada por usuário tem dever legal de detectar ativamente material de abuso infantil, ou só de retirar quando notificado? Muda se a imagem passou por aprovação humana?
2. Há dever de comunicar à autoridade? Qual, em que prazo, e como preservar prova sem cometer o crime de guardar o material?
3. A pessoa que aprova a imagem é responsável pelo direito de imagem de quem aparece? E a Rovemark, como operadora do relé e emissora do handle?
4. Foto de rosto é dado biométrico para a LGPD mesmo sem reconhecimento facial? Que base legal cobre publicar?
5. O cache de um ano é compatível com o direito de exclusão? Que aviso precisa aparecer?
6. Imagem de criança, publicada pelo rover de um adulto: o que muda?

## O que falta preencher

- `[DECISÃO: ligar ou não imagens antes do primeiro relé aberto]`
- `[A PREENCHER: fornecedor de detecção, se houver]`
- `[A PREENCHER: canal e prazo de retirada para quem aparece na foto e não tem rover]`
