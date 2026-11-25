# Pedidos e decisões do cliente falso social

Onde `docs/API-REDE-SOCIAL.md` não decide, o cliente falso (src/lib/social/falso) escolheu o caminho mais conservador. O relé real pode responder diferente; as telas só dependem do código de erro.

## Pedidos à especificação

1. **Código de erro do pedido de amizade dentro do prazo de recusa (7 dias).** A seção 4.3 diz que não pode pedir, mas não diz o código. O falso responde `limite` (429). Sugestão: `limite_de_taxa` com `Retry-After`, para a tela dizer quando dá para tentar de novo.
2. **Código do depoimento durante a espera de 7 dias depois de recusado.** Mesmo caso: o falso responde `limite`. A tela precisa do `Retry-After`.
3. **Título e nome do lugar na notificação.** A notificação não carrega texto, o que é certo, mas a tela de avisos precisa dizer "em Oficina de Pastas, no tópico X". O cliente falso completa isso (`nomeDoLugar`, `nomeDoTopico`) lendo a comunidade e o tópico de agora, e respeitando a visibilidade (nulo quando o leitor não lê mais). O cliente HTTP vai precisar de um GET por aviso, ou o relé pode devolver os dois nomes (nunca texto de conteúdo) quando o leitor pode ler o lugar.
4. **Pré-visualização do conteúdo denunciado na fila de moderação.** A fila devolve só `alvo`, `alvoTipo`, motivos, total e peso. Para decidir, o moderador precisa ver o que foi denunciado. O falso inclui `previa` (autor, trecho, título do tópico). No relé real o cliente teria de buscar o objeto por id; seria mais simples a fila trazer a prévia.
5. **Quem decide a apelação.** O falso só lista na fila do dono as apelações cujo `agiuPor` é moderador (a decisão é do dono). As de remoção ou banimento feitas pelo próprio dono caem na fila do relé e aparecem no cartão do banido com `apelacao: aberta`, mas não na fila do dono. A seção 7.2 diz que a fila traz apelações "só para o dono", sem separar; sugiro dizer isso na especificação.
6. **`Topico.enquete` (booleano) e `Topico.pesquisa`.** A seção 7.3 usa o mesmo nome `enquete` para o booleano do cartão e para o objeto do tópico. O tipo do site separa em `enquete: boolean` e `pesquisa: Enquete | null`. O cliente HTTP faz a troca; vale a especificação distinguir.
7. **Resposta a `reacao` em objeto novo.** `reacao` é tipo livre e vale para tópico, resposta de fórum, atualização e entrega, mas as rotas de leitura de resposta e de atualização não devolvem `minhaReacao`. O falso devolve; no relé real, só com credencial.

## Decisões do falso (conservadoras)

- Denúncia de objeto que o denunciante não vê: `202` silencioso e descartada (seção 10.1). Denúncia de id desconhecido: `nao-encontrado`, como o cliente da fase 1 (para os testes antigos). O relé real responde igual nos dois casos.
- Moderador ou dono removendo o **próprio** conteúdo por `remocao-por-responsavel`: `sem-permissao` (para o próprio, há `remocao-pelo-autor`).
- Voto em enquete encerrada: `enquete-encerrada` antes de `ja-existe`.
- As reações dos objetos novos não têm hora; para o "em alta" valem se o tópico teve vida na janela.
- Notificação de menção só vai a quem existe, pode ver o conteúdo (comunidade fechada: só membro) e não bloqueou nem silenciou o autor. Cada pessoa recebe no máximo uma por resposta, na ordem tópico, mãe, citação, menção.
- O Teco de demonstração tem 9 dias de conta: por isso não pode dar selo a quem é amigo dele há menos de 7 dias e há exemplos de `conta-nova`.
