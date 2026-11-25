# Pedidos à especificação: cliente HTTP

O `ClienteHttp` social usa só rotas que existem em `docs/API-REDE-SOCIAL.md`. Onde a resposta não basta para a tela, o cliente
completa com uma rota que já existe (`GET /v1/rovers/:uid`) ou deixa o campo ausente. O que faltou:

1. **Autor nos itens de `entregas` e `atualizacoes`.** `GET /v1/rovers/:uid/entregas` e `GET /v1/paginas/:id/atualizacoes` devolvem só
   o `Envelope`, que traz o uid do autor mas não o `RoverResumo`. Hoje o cliente faz uma chamada extra a `GET /v1/rovers/:uid` por
   autor distinto. Sugestão: `{ envelope, autor: RoverResumo }`, como em `recados` e `depoimentos`.
2. **Reações e contagem de respostas nas atualizações de página.** O tipo `Atualizacao` do site tem `reacoes`, mas a rota não as
   devolve; o cliente mostra 0. Sugestão: acrescentar `reacoes: { curtir, util }` (e `minhaReacao` com credencial) nos itens.
3. **Formato do item de `GET /v1/linha/inicio?tipos=postagem,pagina-publicar`.** A seção 7.4 diz que entram as atualizações das
   páginas, mas não diz como o item mistura os dois tipos. O cliente trata item com `objeto.tipo === 'pagina-publicar'` como
   atualização e o resto como postagem. Sugestão: `{ tipo: 'postagem' | 'pagina-publicar', ... }` explícito em cada item.
4. **`GET /v1/linha/inicio` não diz qual é o rover da linha quando não há credencial.** O parâmetro `rover=` é do leitor, e com o
   grafo fechado só ele lê. O cliente precisa do uid do rover da pessoa (opção `leitor`) e da credencial; sem eles cai na linha
   pública só de postagens. Sugestão: dizer na 7.4 que a linha mista é sempre do próprio rover.
5. **Prévia da denúncia na fila de moderação.** `DenunciaNaFila.previa` (trecho e autor do conteúdo denunciado) é campo do cliente
   no site; o relé responde só `alvo` e `alvoTipo`, então o moderador teria de abrir cada alvo por id. Sugestão: `previa` opcional
   com `{ autor: RoverResumo, trecho }` na fila (o moderador já pode ler o conteúdo).
6. **Nome do lugar e do tópico nas notificações.** A notificação não carrega texto (correto), mas a tela precisa dizer "em qual
   comunidade". Hoje fica sem `nomeDoLugar`/`nomeDoTopico`; a tela completa abrindo o `comunidade` ou o `objeto`. Sugestão:
   permitir `comunidadeNome` (nome público da comunidade, sem texto de conteúdo) na notificação.
7. **`GET /v1/comunidades/:id/pedidos`, `/convites` e `/banidos`** aparecem com `?antes=&limite=` mas o contrato de resposta não
   diz se vêm como `{ itens, proximo }`; o cliente assume que sim (seção 1.5).
8. **`GET /v1/descobrir/*`**: a seção 1.5 diz que "em alta", "tendências" e "sugestões" respondem `{ itens, proximo: null }`; o
   cliente aceita também uma lista pura. Vale confirmar um formato só.
9. **`sugestoes` sem credencial do rover.** O relé só filtra o que a pessoa já participa se receber a credencial do próprio
   `rover`; o cliente manda `rover=` só quando não há `interesses` explícitos. Sugestão: esclarecer se `interesses` e `rover`
   podem vir juntos.
