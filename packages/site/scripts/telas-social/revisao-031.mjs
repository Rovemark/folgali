// Telas da revisão 0.3.1 (campos novos do relé). Rodar: node scripts/prova-social.mjs --area revisao-031 --base http://127.0.0.1:3941
// O cliente de demonstração declara os 13 recursos da 0.3.1, então todas as telas novas aparecem. A Lumi é o leitor.
import { id, rolarPara } from '../prova-lib.mjs'

export const TELAS = [
  // selos: os dois que a Lumi já deu à Nina ficam sem botão; o de quem ainda não completou 7 dias de amizade diz QUANDO poderá
  { nome: 'nina-selos-ja-dados', rota: '/pt/r/nina', antes: rolarPara('.pf-selos') },
  { nome: 'tuca-selo-data', rota: '/pt/r/tuca', antes: rolarPara('.pf-selos') },
  { nome: 'teco-selo-data', rota: '/pt/r/teco', antes: rolarPara('.pf-selos') },
  // contagens de seguidores e seguindo na ficha
  { nome: 'pipa-ficha-contagens', rota: '/pt/r/pipa', antes: rolarPara('.pf-contagens') },
  // depoimentos: o que a Lumi escreveu e espera aceite, e o que falta de tempo para escrever
  { nome: 'lumi-depoimentos-enviados', rota: '/pt/r/lumi?aba=depoimentos', antes: rolarPara('.pf-enviados'), fim: true },
  { nome: 'teco-depoimento-data', rota: '/pt/r/teco?aba=depoimentos', antes: rolarPara('.pf-abas'), fim: true },
  // o que foi removido (e apelar)
  { nome: 'avisos-removidos', rota: '/pt/avisos', antes: rolarPara('.pf-removidos'), fim: true },
  // comunidade onde a Lumi foi banido: dias que restam, vindos do relé
  { nome: 'praia-banida-prazo', rota: `/pt/comunidades/${id('cpraia')}`, antes: rolarPara('.aviso-comunidade') },
  // moderação: dispensar denúncia, e o registro com a dispensa
  { nome: 'moderacao-fila-dispensar', rota: `/pt/comunidades/${id('cvitrola')}/moderacao?aba=fila`, antes: rolarPara('.fila-item'), fim: true },
  // tópico com reações
  { nome: 'topico-reacoes', rota: `/pt/t/${id('tcinemapipoca')}`, antes: rolarPara('.topico-acoes') },
  // páginas: filtro de temas com a contagem
  { nome: 'paginas-temas', rota: '/pt/paginas', antes: rolarPara('.pg-filtros') },
  // descobrir: pessoas no em alta
  { nome: 'descobrir-pessoas', rota: '/pt/descobrir', antes: rolarPara('.vit-topicos') },
  { nome: 'descobrir-pessoas-pagina', rota: '/pt/descobrir', antes: rolarPara('.vit-prateleira') },
  // em inglês
  { nome: 'tuca-selo-data-en', rota: '/en/r/tuca', antes: rolarPara('.pf-selos') },
  { nome: 'avisos-removidos-en', rota: '/en/avisos', antes: rolarPara('.pf-removidos'), fim: true },
]
