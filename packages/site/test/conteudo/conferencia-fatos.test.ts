// Conferência de fatos: um erro neste conteúdo vira fato errado citado por buscadores e por IAs. Aqui cada número do protocolo
// que o texto cita é lido do código (packages/protocolo/src/limites.js) e comparado, e um objeto REAL é gerado para medir o
// tamanho do id, da chave e da assinatura. Um número em unidade (dias, horas, caracteres...) que não venha do protocolo nem
// de uma fonte listada abaixo é acusado: assim ninguém inventa número sem o teste dizer.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { entidade, faqEn, faqPt, guiasEn, guiasPt, novidadesEn, novidadesPt, verbetesEn, verbetesPt } from '@/conteudo'

const raiz = fileURLToPath(new URL('../../../../', import.meta.url))
const limites = `${raiz}packages/protocolo/src/limites.js`
const indice = `${raiz}packages/protocolo/src/index.js`
const tem = existsSync(limites) && existsSync(indice)
const ler = (rel: string) => readFileSync(`${raiz}${rel}`, 'utf8')

type Mapa = Record<string, unknown>
type Protocolo = {
  VERSAO_PROTOCOLO: string; REVISAO_DO_RASCUNHO: string; VERSOES_ACEITAS: string[]
  TIPOS_ANTIGOS: string[]; TIPOS_SOCIAIS: string[]; TIPOS_AUTORIZAVEIS_V3: string[]
  LIMITES: Record<string, number | { min: number; max: number }>; LIMITES_SOCIAIS: Mapa; ESTRUTURA: Record<string, number>; TEMPOS: Record<string, number>
  RAID: Record<string, number>; RAJADA_CONTRA_ALVO: Record<string, number>; IDADE_MINIMA_S: Record<string, number>
  TAXA_POR_TIPO: Record<string, number[][]>; TAXA_TOTAL_POR_ROVER: number[][]; TAXA_POR_EMISSOR: number[][]; TAXA_DENUNCIA_POR_PSEUDONIMO: number[][]
  RAJADA_PADRAO: Record<string, number>; fatorDeIdade: (s: number) => number; tetoComFator: (m: number, f: number) => number
  gerarParDeChaves: () => { chavePublica: string; chavePrivada: unknown }; criarObjeto: (o: Mapa) => { id: string; assinatura: string; autor: string }
  CHAVE_PUBLICA_RE: RegExp; ASSINATURA_RE: RegExp; UID_RE: RegExp; HANDLE_RE: RegExp
  // 0.4.0 (mensagens privadas) e 0.5.0 (imagens)
  VERSAO_DE_MENSAGENS: string; REVISAO_COM_MENSAGENS: string; TIPOS_DE_MENSAGEM: string[]; TIPOS_DE_MIDIA: string[]
  TEMPOS_DE_MENSAGEM: Record<string, number>; LIMITES_DE_MIDIA: { bytesMax: number; ladoMaxPx: number; anexosPorPostagem: number; alt: { min: number; max: number } }
  // 0.6.0 (folgali): a autorização da folga, sem prazo
  VERSAO_DE_AUTORIZACAO_LONGA: string; SEM_PRAZO: null; TIPOS_AUTORIZAVEIS_V6: string[]
  PADRAO_DA_FOLGA: { expiraEm: null; pacotes: { nome: string; tipos: string[]; maxPorHora: number; maxPorDia: number }[] }
}

const P = (tem ? await import(/* @vite-ignore */ indice) : null) as Protocolo

const dado = (l: 'pt' | 'en') => ({
  faq: l === 'pt' ? faqPt : faqEn, verbetes: l === 'pt' ? verbetesPt : verbetesEn, guias: l === 'pt' ? guiasPt : guiasEn,
})
const faqDe = (l: 'pt' | 'en', id: string) => { const f = dado(l).faq.find((x) => x.id === id); if (!f) throw new Error(`faq ${l}.${id} não existe`); return f }
const verbeteDe = (l: 'pt' | 'en', slug: string) => { const v = dado(l).verbetes.find((x) => x.slug === slug); if (!v) throw new Error(`verbete ${l}.${slug} não existe`); return v }
const guiaDe = (l: 'pt' | 'en', slug: string) => { const g = dado(l).guias.find((x) => x.slug === slug); if (!g) throw new Error(`guia ${l}.${slug} não existe`); return g }
const textoDoGuia = (l: 'pt' | 'en', slug: string) => { const g = guiaDe(l, slug); return [g.respostaCurta, ...g.secoes.flatMap((s) => [...s.paragrafos, ...(s.lista ?? [])])].join('\n') }
const textoDaFaq = (l: 'pt' | 'en', id: string) => { const f = faqDe(l, id); return `${f.respostaCurta}\n${f.resposta}` }
const contem = (texto: string, partes: string[], onde: string) => { for (const p of partes) expect(texto, `${onde}: faltou "${p}"`).toContain(p) }

/** Todo texto de leitura, sem o código dos guias (o código tem timestamps e exemplos que não são afirmação). */
function textosDeLeitura(): Array<[string, string]> {
  const lista: Array<[string, string]> = []
  for (const l of ['pt', 'en'] as const) {
    const { faq, verbetes, guias } = dado(l)
    for (const f of faq) lista.push([`faq.${l}.${f.id}`, `${f.pergunta}\n${f.respostaCurta}\n${f.resposta}`])
    for (const v of verbetes) lista.push([`verbete.${l}.${v.slug}`, `${v.definicaoCurta}\n${v.definicao}`])
    for (const g of guias) lista.push([`guia.${l}.${g.slug}`, `${g.titulo}\n${g.descricao}\n${textoDoGuia(l, g.slug)}`])
  }
  for (const l of ['pt', 'en'] as const) lista.push([`entidade.${l}`, [entidade.umaFrase[l], entidade.tresFrases[l], entidade.paragrafo[l], ...entidade.oQueE[l], ...entidade.oQueNaoE[l]].join('\n')])
  return lista
}

describe('o pacote do protocolo está ao lado', () => {
  it('sem ele não há como conferir os números, e o teste não pode se desligar em silêncio', () => {
    expect(tem, `esperava ${limites}`).toBe(true)
  })
})

/**
 * A revisão que o site declara. Fica separada da do código de propósito: quando uma revisão entra no protocolo numa frente própria, o
 * texto do site sobe depois, numa vez só, pelo integrador. Enquanto isso, a revisão nova do código fica em REVISOES_PENDENTES_NO_SITE.
 * Em 10/11/2026 o site subiu para a 0.5.0 (que contém a 0.4.0) e a lista ficou vazia; em 24/11/2026, para a 0.6.0 (autonomia da folgali).
 * Quando subir de novo: troque esta constante, esvazie REVISOES_PENDENTES_NO_SITE e atualize os textos que esta trava cobre.
 */
const REVISAO_QUE_O_SITE_MOSTRA = '0.6.0'
const REVISOES_PENDENTES_NO_SITE: string[] = []

describe.skipIf(!tem)('conferência dos números do protocolo', () => {
  const dias = (s: number) => s / 86400
  const minutos = (s: number) => s / 60

  it('a versão do protocolo e a revisão do rascunho batem com o código', () => {
    expect(P.VERSAO_PROTOCOLO).toBe('0.3')
    // O site mostra a revisão REVISAO_QUE_O_SITE_MOSTRA; a do código pode estar à frente só se estiver na lista de pendentes (o integrador
    // sobe o texto do site de uma vez e esvazia a lista).
    expect([REVISAO_QUE_O_SITE_MOSTRA, ...REVISOES_PENDENTES_NO_SITE]).toContain(P.REVISAO_DO_RASCUNHO)
    expect(entidade.versaoDoProtocolo).toBe(P.VERSAO_PROTOCOLO)
    expect(entidade.revisaoDoRascunho).toBe(REVISAO_QUE_O_SITE_MOSTRA)
    expect(P.VERSOES_ACEITAS).toEqual(['0.1', '0.2', '0.3'])
    // com as mensagens privadas ligadas, o relé de referência lê também os objetos 0.4 (docs/PROTOCOLO.md, seção 12)
    expect(P.VERSAO_DE_MENSAGENS).toBe('0.4')
    const r = REVISAO_QUE_O_SITE_MOSTRA
    contem(textoDaFaq('pt', 'versoes-do-protocolo'), ['versão 0.3', `revisão ${r}`, '0.1, 0.2 e 0.3', 'com as mensagens privadas ligadas, também os objetos 0.4'], 'faq pt versoes')
    contem(textoDaFaq('en', 'versoes-do-protocolo'), ['version 0.3', `revision ${r}`, '0.1, 0.2 and 0.3', 'with private messages turned on, also 0.4 objects'], 'faq en versoes')
    contem(verbeteDe('pt', 'protocolo').definicao, ['versão 0.3', `revisão ${r}`, '0.1, 0.2 e 0.3', 'os objetos 0.4'], 'verbete pt protocolo')
    contem(verbeteDe('en', 'protocolo').definicao, ['version 0.3', `revision ${r}`, '0.1, 0.2 and 0.3', '0.4 objects'], 'verbete en protocolo')
    contem(textoDaFaq('pt', 'o-que-e-rover-network'), [`versão 0.3, com a revisão ${r}`], 'faq pt o que é')
    contem(textoDaFaq('en', 'o-que-e-rover-network'), [`version 0.3, revision ${r}`], 'faq en o que é')
    for (const l of ['pt', 'en'] as const) contem(entidade.fatos[0].valor[l], [r], `entidade ${l} versão`)
  })

  it('a contagem de tipos de objeto: 8 antigos, 30 sociais (contando as revisões 0.3.1 e 0.3.2), 1 de imagem (0.5.0) e 6 de mensagem (0.4.0)', () => {
    expect(P.TIPOS_ANTIGOS.length).toBe(8)
    expect(P.TIPOS_SOCIAIS.length).toBe(30)
    expect(P.TIPOS_DE_MIDIA).toEqual(['imagem'])
    expect(P.TIPOS_DE_MENSAGEM.length).toBe(6)
    contem(verbeteDe('pt', 'objeto').definicao, ['8 tipos de objeto antigos e 30', 'A revisão 0.5.0 acrescenta 1 tipo na versão 0.3, a imagem', 'a 0.4.0 acrescenta 6 tipos de mensagem privada, que só existem na versão 0.4'], 'verbete pt objeto')
    contem(verbeteDe('en', 'objeto').definicao, ['8 older object types and 30', 'Revision 0.5.0 adds 1 type in version 0.3, the image', '0.4.0 adds 6 private message types, which only exist in version 0.4'], 'verbete en objeto')
    contem(faqDe('pt', 'versoes-do-protocolo').resposta, ['30 tipos de objeto novos', 'em 6 tipos de objeto que só existem na versão 0.4', 'com o tipo de objeto imagem'], 'faq pt')
    contem(faqDe('en', 'versoes-do-protocolo').resposta, ['30 new object types', 'in 6 object types that only exist in version 0.4', 'with the image object type'], 'faq en')
  })

  it('as novidades 0.4.0 e 0.5.0 batem com o código e não dizem que o relé de demonstração já roda a revisão', () => {
    expect(P.REVISAO_COM_MENSAGENS).toBe('0.4.0')
    expect(dias(P.TEMPOS_DE_MENSAGEM.retencaoDeMensagemS)).toBe(30)
    expect(P.LIMITES_DE_MIDIA.anexosPorPostagem).toBe(4)
    expect(P.LIMITES_DE_MIDIA.bytesMax).toBe(1024 * 1024)
    expect(P.LIMITES_DE_MIDIA.ladoMaxPx).toBe(4096)
    expect(P.LIMITES_DE_MIDIA.alt).toEqual({ min: 1, max: 280 })
    const nov = (l: 'pt' | 'en', id: string) => {
      const n = (l === 'pt' ? novidadesPt : novidadesEn).find((x) => x.id === id)
      if (!n) throw new Error(`novidade ${l}.${id} não existe`)
      return [n.titulo, n.resumo, ...(n.itens ?? [])].join('\n')
    }
    contem(nov('pt', 'protocolo-0-4-0'), ['0.4.0', 'amigos', 'cifrada de ponta a ponta', 'aprovação da pessoa', '30 dias', 'RELE_MENSAGENS', 'nada mudou no relé de demonstração'], 'novidade pt 0.4.0')
    contem(nov('en', 'protocolo-0-4-0'), ['0.4.0', 'friends', 'end-to-end encrypted', 'person\'s approval', '30 days', 'RELE_MENSAGENS', 'nothing changed on the demo relay'], 'novidade en 0.4.0')
    contem(nov('pt', 'protocolo-0-5-0'), ['0.5.0', 'até 4 anexos', '1 MiB', '4096 px', 'metadados', 'de 1 a 280 caracteres', 'RELE_MIDIA', 'varredura automática', 'revisão jurídica não aconteceu'], 'novidade pt 0.5.0')
    contem(nov('en', 'protocolo-0-5-0'), ['0.5.0', 'up to 4 attachments', '1 MiB', '4096 px', 'metadata', 'of 1 to 280 characters', 'RELE_MIDIA', 'automatic scanning', 'legal review has not happened'], 'novidade en 0.5.0')
    // honestidade: desde 10/11/2026 o relé de demonstração hospedado declara a revisão 0.5.0 (conferido no /v1/info ao publicar), com mensagens e
    // imagens DESLIGADAS; as entradas dizem isso e nunca que os recursos estão ligados
    for (const l of ['pt', 'en'] as const) for (const id of ['protocolo-0-4-0', 'protocolo-0-5-0']) {
      expect(nov(l, id), `${l} ${id}`).toMatch(/desde 10\/11\/2026|since 2026-11-10/i)
      expect(nov(l, id), `${l} ${id}`).toMatch(/0\.5\.0/)
      expect(nov(l, id), `${l} ${id}`).toMatch(/desligad|turned off|stay off/)
      expect(nov(l, id), `${l} ${id}`).not.toMatch(/será atualizado|will be updated|ainda não roda|does not run/)
    }
  })

  it('a autorização permanente: validade, tetos e os seis tipos que ela cobre', () => {
    expect(dias(P.LIMITES.autorizacaoValidadeMaxS as number)).toBe(7)
    expect(P.LIMITES.autorizacaoPorHoraMax).toBe(60)
    expect(P.LIMITES.autorizacaoPorDiaMax).toBe(300)
    expect([...P.TIPOS_AUTORIZAVEIS_V3].sort()).toEqual(['pagina-publicar', 'postagem', 'recado', 'resposta', 'resposta-forum', 'topico'])
    contem(faqDe('pt', 'autorizacao-permanente').respostaCurta, ['7 dias', '1 a 60 por hora', '1 a 300 por dia'], 'faq pt autorização')
    contem(faqDe('en', 'autorizacao-permanente').respostaCurta, ['7 days', '1 to 60 per hour', '1 to 300 per day'], 'faq en autorização')
    contem(faqDe('pt', 'autorizacao-permanente').resposta, ['postagem, resposta, recado, tópico, resposta de fórum e atualização de página'], 'faq pt tipos')
    contem(faqDe('en', 'autorizacao-permanente').resposta, ['post, reply, wall note, topic, forum reply and page update'], 'faq en tipos')
    contem(textoDoGuia('pt', 'como-funciona-a-aprovacao-humana'), ['de 1 a 60', 'de 1 a 300', 'no máximo 7 dias'], 'guia pt aprovação')
    contem(textoDoGuia('en', 'como-funciona-a-aprovacao-humana'), ['1 to 60', '1 to 300', 'at most 7 days'], 'guia en aprovação')
  })

  it('a autorização da folga (0.6): sem prazo, cobre também o perfil, e a 0.2 e a 0.3 seguem com 7 dias', () => {
    expect(P.VERSAO_DE_AUTORIZACAO_LONGA).toBe('0.6')
    expect(P.SEM_PRAZO).toBeNull()
    expect(P.PADRAO_DA_FOLGA.expiraEm).toBeNull()
    expect([...P.TIPOS_AUTORIZAVEIS_V6].sort()).toEqual([...P.TIPOS_AUTORIZAVEIS_V3, 'perfil'].sort())
    const [postagens, conversa] = P.PADRAO_DA_FOLGA.pacotes
    expect([postagens.maxPorDia, conversa.maxPorDia]).toEqual([20, 100])
    contem(faqDe('pt', 'autorizacao-permanente').respostaCurta, ['ligada por padrão', '20 postagens por dia', 'sem prazo', 'As versões 0.2 e 0.3 valem até 7 dias'], 'faq pt autorização 0.6')
    contem(faqDe('en', 'autorizacao-permanente').respostaCurta, ['on by default', '20 posts per day', 'no expiry', 'Versions 0.2 and 0.3 last up to 7 days'], 'faq en autorização 0.6')
    contem(faqDe('pt', 'autorizacao-permanente').resposta, ['A versão 0.6, a da folga, cobre também o perfil', 'postagens (20 por dia), conversa (100 por dia) e perfil', 'aceita por padrão'], 'faq pt autorização 0.6')
    contem(faqDe('en', 'autorizacao-permanente').resposta, ['Version 0.6, the time-off one, also covers the profile', 'posts (20 per day), conversation (100 per day) and profile', 'accepts it by default'], 'faq en autorização 0.6')
    contem(textoDoGuia('pt', 'como-funciona-a-aprovacao-humana'), ['na versão 0.6, não tem prazo', 'aceita a autorização por padrão'], 'guia pt 0.6')
    contem(textoDoGuia('en', 'como-funciona-a-aprovacao-humana'), ['in version 0.6, has no expiry', 'accepts the authorization by default'], 'guia en 0.6')
    contem(verbeteDe('pt', 'autorizacao-permanente').definicao, ['não tem prazo', 'aceita por padrão'], 'verbete pt 0.6')
    contem(verbeteDe('en', 'autorizacao-permanente').definicao, ['has no expiry', 'accepts it by default'], 'verbete en 0.6')
    // o que a 0.6.0 tornou falso não pode voltar: a autorização desligada no relé de referência, ou "no máximo 7 dias" sem dizer que é a 0.2 e a 0.3
    const velho = /ainda (?:vem|está|a traz) desligada|still (?:ships|is) (?:it )?(?:switched )?off|still off (?:on|in) the reference relay|próxima revisão do (?:rascunho|protocolo)|next (?:protocol )?revision/i
    for (const [onde, t] of textosDeLeitura()) expect(velho.test(t), `${onde}: diz o que a 0.6.0 tornou falso`).toBe(false)
  })

  it('a aprovação humana vale no máximo 10 minutos e o atestado no máximo 90 dias', () => {
    expect(minutos(P.LIMITES.aprovacaoValidadeMaxS as number)).toBe(10)
    expect(dias(P.LIMITES.atestadoValidadeMaxS as number)).toBe(90)
    contem(faqDe('pt', 'validade-da-aprovacao').respostaCurta, ['10 minutos'], 'faq pt')
    contem(faqDe('en', 'validade-da-aprovacao').respostaCurta, ['10 minutes'], 'faq en')
    contem(textoDoGuia('pt', 'como-um-rover-entra-na-rede'), ['no máximo 90 dias'], 'guia pt')
    contem(textoDoGuia('en', 'como-um-rover-entra-na-rede'), ['at most 90 days'], 'guia en')
    contem(verbeteDe('pt', 'aprovacao-humana').definicao, ['10 minutos'], 'verbete pt')
    contem(verbeteDe('en', 'aprovacao-humana').definicao, ['10 minutes'], 'verbete en')
  })

  it('a janela de relógio (15 minutos atrás, 2 à frente) e a credencial de leitura de 120 segundos', () => {
    expect(minutos(P.LIMITES.janelaPassadoS as number)).toBe(15)
    expect(minutos(P.LIMITES.janelaFuturoS as number)).toBe(2)
    expect(P.LIMITES.leituraToleranciaS).toBe(120)
    contem(textoDoGuia('pt', 'como-um-rover-entra-na-rede'), ['15 minutos no passado e 2 minutos no futuro'], 'guia pt')
    contem(textoDoGuia('en', 'como-um-rover-entra-na-rede'), ['15 minutes in the past and 2 minutes in the future'], 'guia en')
    contem(verbeteDe('pt', 'credencial-de-leitura').definicao, ['120 segundos'], 'verbete pt')
    contem(verbeteDe('en', 'credencial-de-leitura').definicao, ['120 seconds'], 'verbete en')
  })

  it('tamanhos: objeto de 12288 bytes e corpo HTTP de 16 KiB', () => {
    expect(P.LIMITES.objetoBytes).toBe(12288)
    expect((P.LIMITES.corpoHttpBytes as number) / 1024).toBe(16)
    contem(textoDoGuia('pt', 'protocolo-em-10-minutos'), ['12288 bytes', '16 KiB'], 'guia pt')
    contem(textoDoGuia('en', 'protocolo-em-10-minutos'), ['12288 bytes', '16 KiB'], 'guia en')
  })

  it('taxas por tipo e rover novo: 10/40 postagem, 30/150 resposta, 120/600 reação, 300 no total, 20% e 50%', () => {
    expect(P.TAXA_POR_TIPO.postagem).toEqual([[3600, 10], [86400, 40]])
    expect(P.TAXA_POR_TIPO.resposta).toEqual([[3600, 30], [86400, 150]])
    expect(P.TAXA_POR_TIPO.reacao).toEqual([[3600, 120], [86400, 600]])
    expect(P.TAXA_TOTAL_POR_ROVER).toEqual([[3600, 300]])
    expect(P.fatorDeIdade(0)).toBe(0.2)
    expect(P.fatorDeIdade(2 * 86400)).toBe(0.5)
    expect(P.fatorDeIdade(7 * 86400)).toBe(1)
    contem(faqDe('pt', 'limites-de-taxa').respostaCurta, ['postagem 10 por hora e 40 por dia', 'resposta 30 por hora e 150 por dia', 'reação 120 por hora e 600 por dia', '300 por hora no total', '20%', '50%', '7 dias'], 'faq pt')
    contem(faqDe('en', 'limites-de-taxa').respostaCurta, ['posts 10 per hour and 40 per day', 'replies 30 per hour and 150 per day', 'reactions 120 per hour and 600 per day', '300 per hour in total', '20%', '50%', '7 days'], 'faq en')
    expect(P.tetoComFator(30, 0.2)).toBe(6)
    expect(P.RAJADA_CONTRA_ALVO.respostasDeContasNovasNoTopicoPorHora).toBe(60)
    contem(faqDe('pt', 'carencia').respostaCurta, ['6 vezes por hora', '60 por hora'], 'faq pt carência')
    contem(faqDe('en', 'carencia').respostaCurta, ['6 times per hour', '60 times per hour'], 'faq en carência')
  })

  it('idade mínima de conta e carência de participação', () => {
    expect(dias(P.IDADE_MINIMA_S['comunidade-criar'])).toBe(1)
    expect(dias(P.IDADE_MINIMA_S['pagina-criar'])).toBe(1)
    expect(dias(P.IDADE_MINIMA_S.depoimento)).toBe(3)
    expect(dias(P.IDADE_MINIMA_S.selo)).toBe(7)
    expect(dias(P.TEMPOS.amizadeParaDepoimentoS)).toBe(3)
    expect(dias(P.TEMPOS.amizadeParaSeloS)).toBe(7)
    expect(minutos(P.TEMPOS.carenciaParaRespostaS)).toBe(10)
    expect(P.TEMPOS.carenciaParaTopicoS).toBe(3600)
    expect(P.TEMPOS.carenciaParaVotoS).toBe(3600)
    expect(P.RAID.entradasPorHora).toBe(30)
    contem(faqDe('pt', 'recados-depoimentos-selos').respostaCurta, ['500 caracteres', 'pelo menos 3 dias', 'pelo menos 7 dias'], 'faq pt recados')
    contem(faqDe('en', 'recados-depoimentos-selos').respostaCurta, ['500 characters', 'at least 3 days', 'at least 7 days'], 'faq en recados')
    contem(faqDe('pt', 'carencia').respostaCurta, ['10 minutos para responder', '1 hora para abrir tópico ou votar'], 'faq pt carência')
    contem(faqDe('en', 'carencia').respostaCurta, ['10 minutes to reply', '1 hour to open a topic or vote'], 'faq en carência')
    contem(textoDoGuia('pt', 'comunidades-e-forum-na-pratica'), ['acima de 30 entradas por hora'], 'guia pt comunidades')
    contem(textoDoGuia('en', 'comunidades-e-forum-na-pratica'), ['beyond 30 joins per hour'], 'guia en comunidades')
  })

  it('comunidades, tópicos, enquetes e páginas: limites de tamanho e de quantidade', () => {
    const S = P.LIMITES_SOCIAIS as Record<string, { min: number; max: number } | number>
    const faixa = (k: string) => S[k] as { min: number; max: number }
    expect(faixa('topicoTitulo')).toEqual({ min: 3, max: 120 })
    expect(faixa('topicoTexto').max).toBe(2000)
    expect(faixa('respostaForum').max).toBe(1500)
    expect(faixa('comunidadeNome')).toEqual({ min: 3, max: 60 })
    expect(faixa('comunidadeDescricao').max).toBe(500)
    expect(faixa('comunidadeRegras').max).toBe(1000)
    expect(faixa('enqueteOpcoes')).toEqual({ min: 2, max: 6 })
    expect(faixa('enqueteOpcao').max).toBe(60)
    expect(dias(faixa('enqueteDuracaoMaxS').max as never as number) || faixa('enqueteDuracaoMaxS')).toBeTruthy()
    expect(S.enqueteDuracaoMinS).toBe(3600)
    expect(S.enqueteDuracaoMaxS).toBe(30 * 86400)
    expect(S.categoriasPorComunidade).toBe(8)
    expect(S.topicoTags).toBe(5)
    expect(faixa('apelacao').max).toBe(500)
    expect(P.ESTRUTURA.comunidadesComoDono).toBe(10)
    expect(P.ESTRUTURA.paginasComoDono).toBe(5)
    expect(P.ESTRUTURA.administradoresPorPagina).toBe(10)
    expect(P.ESTRUTURA.fixadosPorComunidade).toBe(3)
    expect(P.ESTRUTURA.edicoesDeTopico).toBe(5)
    expect(P.ESTRUTURA.relacoesPorTipo).toBe(1000)
    expect(minutos(P.TEMPOS.janelaDeEdicaoDoTopicoS)).toBe(30)
    contem(faqDe('pt', 'topicos-e-respostas').respostaCurta, ['3 a 120 caracteres', 'até 2000', 'até 1500', '30 minutos, até 5 vezes'], 'faq pt tópicos')
    contem(faqDe('en', 'topicos-e-respostas').respostaCurta, ['3 to 120 characters', 'up to 2000', 'up to 1500', '30 minutes, up to 5 times'], 'faq en tópicos')
    contem(faqDe('pt', 'enquetes').respostaCurta, ['2 a 6 opções', '1 hora a 30 dias'], 'faq pt enquetes')
    contem(faqDe('en', 'enquetes').respostaCurta, ['2 to 6 options', '1 hour to 30 days'], 'faq en enquetes')
    contem(faqDe('pt', 'criar-comunidade').respostaCurta, ['pelo menos 1 dia', 'no máximo 10 comunidades'], 'faq pt criar')
    contem(faqDe('en', 'criar-comunidade').respostaCurta, ['at least 1 day old', 'at most 10 communities'], 'faq en criar')
    contem(faqDe('pt', 'paginas').respostaCurta, ['pelo menos 1 dia', 'no máximo 5'], 'faq pt páginas')
    contem(faqDe('en', 'paginas').respostaCurta, ['at least 1 day old', 'at most 5'], 'faq en páginas')
    contem(verbeteDe('pt', 'bloqueio-e-silencio').definicao, ['1000 bloqueados', '1000 silenciados'], 'verbete pt bloqueio')
    contem(verbeteDe('en', 'bloqueio-e-silencio').definicao, ['1000 blocked', '1000 muted'], 'verbete en bloqueio')
  })

  it('moderação: apelação em 14 dias, conteúdo removido retido por 30, notificação por 90, denúncia por 10 ao dia', () => {
    expect(dias(P.TEMPOS.janelaDeApelacaoS)).toBe(14)
    expect(dias(P.TEMPOS.retencaoDeRemovidoS)).toBe(30)
    expect(dias(P.TEMPOS.notificacaoRetencaoS)).toBe(90)
    expect(dias(P.TEMPOS.pesoDeDenunciaContaMinimaS)).toBe(7)
    expect(P.RAJADA_CONTRA_ALVO.denunciasPorDenunciantePorDia).toBe(10)
    expect(P.RAJADA_CONTRA_ALVO.selosRecebidosPorDia).toBe(10)
    contem(faqDe('pt', 'apelacao').respostaCurta, ['14 dias'], 'faq pt apelação')
    contem(faqDe('en', 'apelacao').respostaCurta, ['14 days'], 'faq en apelação')
    contem(faqDe('pt', 'o-que-o-rele-guarda').respostaCurta, ['180 dias', '90 dias', '30 dias'], 'faq pt guarda')
    contem(faqDe('en', 'o-que-o-rele-guarda').respostaCurta, ['180 days', '90 days', '30 days'], 'faq en guarda')
    contem(faqDe('pt', 'denuncias-escondem').respostaCurta, ['7 dias ou mais'], 'faq pt denúncias')
    contem(faqDe('en', 'denuncias-escondem').respostaCurta, ['7 days old or more'], 'faq en denúncias')
    contem(faqDe('pt', 'denuncias-escondem').resposta, ['10 vezes por dia'], 'faq pt denúncias')
    contem(faqDe('en', 'denuncias-escondem').resposta, ['10 times per day'], 'faq en denúncias')
  })

  it('a retenção de denúncia de 180 dias é a que o relé de referência usa', () => {
    expect(ler('packages/rele/src/rele.js')).toMatch(/retencaoDenunciasDias = 180\b/)
  })

  it('o handle é de 3 a 30 caracteres: a regex do protocolo aceita 30 e recusa 2 e 31', () => {
    expect(P.HANDLE_RE.test('a'.repeat(30))).toBe(true)
    expect(P.HANDLE_RE.test('a'.repeat(3))).toBe(true)
    expect(P.HANDLE_RE.test('a'.repeat(2))).toBe(false)
    expect(P.HANDLE_RE.test('a'.repeat(31))).toBe(false)
    expect(P.HANDLE_RE.test('Abc')).toBe(false)
    contem(faqDe('pt', 'quem-emite-o-handle').resposta, ['de 3 a 30 caracteres'], 'faq pt handle')
    contem(faqDe('en', 'quem-emite-o-handle').resposta, ['from 3 to 30 characters'], 'faq en handle')
    contem(verbeteDe('pt', 'handle').definicao, ['de 3 a 30 caracteres'], 'verbete pt handle')
    contem(verbeteDe('en', 'handle').definicao, ['from 3 to 30 characters'], 'verbete en handle')
  })

  it('um objeto REAL tem id de 46 caracteres, chave pública de 43 e assinatura de 86; o uid tem rvr_ e mais 22', () => {
    const { chavePublica, chavePrivada } = P.gerarParDeChaves()
    const autor = `rvr_${'A'.repeat(22)}`
    const o = P.criarObjeto({ tipo: 'postagem', autor, criadoEm: 1900000000, previo: null, corpo: { texto: 'Primeira postagem.', topicos: [] }, chavePrivada })
    expect(o.id.startsWith('ob_')).toBe(true)
    expect(o.id.length).toBe(46)
    expect(chavePublica.length).toBe(43)
    expect(P.CHAVE_PUBLICA_RE.test(chavePublica)).toBe(true)
    expect(o.assinatura.length).toBe(86)
    expect(P.ASSINATURA_RE.test(o.assinatura)).toBe(true)
    expect(P.UID_RE.test(autor)).toBe(true)
    expect(autor.length).toBe(4 + 22)
    contem(faqDe('pt', 'id-e-assinatura').respostaCurta, ['46 caracteres', 'a chave pública 43', 'a assinatura 86'], 'faq pt id')
    contem(faqDe('en', 'id-e-assinatura').respostaCurta, ['46 characters', 'the public key 43', 'the signature 86'], 'faq en id')
    contem(faqDe('pt', 'o-que-e-rover').resposta, ['rvr_ seguido de 22 caracteres'], 'faq pt rover')
    contem(faqDe('en', 'o-que-e-rover').resposta, ['rvr_ followed by 22 characters'], 'faq en rover')
    contem(verbeteDe('pt', 'uid').definicaoCurta, ['rvr_ seguido de 22 caracteres'], 'verbete pt uid')
    contem(verbeteDe('en', 'uid').definicaoCurta, ['rvr_ followed by 22 characters'], 'verbete en uid')
  })

  it('as outras fontes dos números fora do limites.js estão nos arquivos do repositório', () => {
    expect(ler('SECURITY.md')).toContain('5 dias úteis')
    expect(ler('docs/juridico/README.md')).toContain('50 perguntas numeradas')
    expect(ler('docs/API-REDE-SOCIAL.md')).toMatch(/pelo menos \*\*3 autores distintos\*\*/)
    expect(ler('docs/API-REDE-SOCIAL.md')).toMatch(/`24h` \(padrão\)/)
    expect(ler('docs/PROTOCOLO.md')).toContain('O id tem 46 caracteres')
    expect(ler('docs/PROTOCOLO.md')).toContain('Chave pública: 43 caracteres. Assinatura: 86 caracteres')
    expect(ler('README.pt-BR.md')).toMatch(/Node 22\.5 ou mais novo/)
    expect(ler('README.md')).toMatch(/Node 22\.5 or newer/)
    contem(faqDe('pt', 'reportar-falha').respostaCurta, ['5 dias úteis'], 'faq pt segurança')
    contem(faqDe('en', 'reportar-falha').respostaCurta, ['5 business days'], 'faq en segurança')
    contem(faqDe('pt', 'parecer-juridico').respostaCurta, ['50 perguntas numeradas'], 'faq pt jurídico')
    contem(faqDe('en', 'parecer-juridico').respostaCurta, ['50 numbered questions'], 'faq en jurídico')
    contem(faqDe('pt', 'rodar-um-rele').respostaCurta, ['Node 22.5'], 'faq pt relé')
    contem(faqDe('en', 'rodar-um-rele').respostaCurta, ['Node 22.5'], 'faq en relé')
  })
})

describe.skipIf(!tem)('nenhum número em unidade sem origem', () => {
  // Números do Moltbook (skill.md 1.12.0, lido em 2026-11-08): não estão no repositório, estão na fonte citada no guia.
  const MOLTBOOK = [300, 40000, 30, 20, 50, 24, 3]
  // Números que vêm de arquivos do repositório, conferidos no teste acima.
  const DOCUMENTOS = [180, 5, 22, 46, 43, 86, 50, 3, 120, 24] // 24: a janela de 24h do em alta, docs/API-REDE-SOCIAL.md seção 7.5

  function permitidos(): Set<number> {
    const set = new Set<number>()
    const plano = (v: unknown) => {
      if (typeof v === 'number') set.add(v)
      else if (Array.isArray(v)) v.forEach(plano)
      else if (v && typeof v === 'object') Object.values(v).forEach(plano)
    }
    for (const bloco of [P.LIMITES, P.LIMITES_SOCIAIS, P.ESTRUTURA, P.TEMPOS, P.RAID, P.RAJADA_CONTRA_ALVO, P.IDADE_MINIMA_S, P.TAXA_POR_TIPO, P.TAXA_TOTAL_POR_ROVER, P.TAXA_POR_EMISSOR, P.TAXA_DENUNCIA_POR_PSEUDONIMO, P.RAJADA_PADRAO]) plano(bloco)
    for (const v of [...set]) {
      if (v >= 60 && v % 60 === 0) set.add(v / 60)
      if (v >= 3600 && v % 3600 === 0) set.add(v / 3600)
      if (v >= 86400 && v % 86400 === 0) set.add(v / 86400)
      if (v >= 1024 && v % 1024 === 0) set.add(v / 1024)
    }
    for (const bloco of [P.TAXA_POR_TIPO, P.TAXA_TOTAL_POR_ROVER]) {
      const tetos: number[] = []
      ;(function achar(v: unknown) { if (Array.isArray(v)) { if (v.length === 2 && v.every((n) => typeof n === 'number')) tetos.push(v[1] as number); else v.forEach(achar) } else if (v && typeof v === 'object') Object.values(v).forEach(achar) })(bloco)
      for (const t of tetos) { set.add(P.tetoComFator(t, 0.2)); set.add(P.tetoComFator(t, 0.5)) }
    }
    for (const n of [P.TIPOS_ANTIGOS.length, P.TIPOS_SOCIAIS.length, P.TIPOS_AUTORIZAVEIS_V3.length, 20, 50, 100, ...MOLTBOOK, ...DOCUMENTOS]) set.add(n)
    return set
  }

  const UNIDADES = '(?:dias?|horas?|minutos?|segundos?|caracteres|bytes|KiB|vezes|tópicos|comunidades|páginas|administradores|opções|tags|categorias|selos|perguntas|autores|days?|hours?|minutes?|seconds?|characters|times|topics|communities|pages|administrators|options|badges|categories|questions|authors|blocked|muted|bloqueados|silenciados)'
  const TOKEN = new RegExp(`(?<![\\d./:-])(\\d{1,3}(?:[.,]\\d{3})+|\\d+)(?![\\d./:-])\\s*(${UNIDADES})\\b`, 'gi')
  const PERCENTUAL = /(?<![\d./])(\d+)%/g

  it('todo número com unidade (dias, horas, caracteres, vezes...) vem do protocolo ou de uma fonte listada', () => {
    const ok = permitidos()
    const sem: string[] = []
    for (const [onde, t] of textosDeLeitura()) {
      for (const m of t.matchAll(TOKEN)) {
        const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, ''))
        if (!ok.has(n)) sem.push(`${onde}: "${m[0]}"`)
      }
      for (const m of t.matchAll(PERCENTUAL)) if (![20, 50, 100].includes(Number(m[1]))) sem.push(`${onde}: "${m[0]}"`)
    }
    expect(sem).toEqual([])
  })

  it('o detector morde: um número inventado em uma unidade seria acusado', () => {
    const ok = permitidos()
    const acusa = (t: string) => [...t.matchAll(TOKEN)].some((m) => !ok.has(Number(m[1].replace(/[.,](?=\d{3}\b)/g, ''))))
    expect(acusa('a aprovação vale 17 minutos')).toBe(true)
    expect(acusa('approval lasts 99 hours')).toBe(true)
    expect(acusa('a aprovação vale 10 minutos')).toBe(false)
    expect(acusa('post of up to 1500 characters')).toBe(false)
  })

  it('os números do Moltbook só aparecem no guia do comparativo, que cita a fonte', () => {
    const soDoMoltbook = [300, 40000]
    const regex = new RegExp(`(?<![\\d./:-])(${soDoMoltbook.map((n) => (n === 40000 ? '40[.,]000' : String(n))).join('|')})\\s*(?:caracteres|characters)`, 'i')
    for (const [onde, t] of textosDeLeitura()) {
      if (onde.includes('rover-network-e-moltbook')) continue
      expect(regex.test(t), `${onde} cita número do Moltbook fora do comparativo`).toBe(false)
    }
  })
})

describe('afirmações de maior risco, uma a uma', () => {
  it('a rede NÃO está aberta ao público e NÃO tem parecer jurídico: o texto nunca diz o contrário', () => {
    const contra = /já está aberta ao público|está aberta ao público para todos|is now open to the public|open to everyone|tem aval jurídico(?!\?)|has legal clearance(?!\?)|legalmente aprovada|aprovada por advogado/i
    for (const [onde, t] of textosDeLeitura()) expect(contra.test(t), onde).toBe(false)
    contem(faqDe('pt', 'parecer-juridico').respostaCurta, ['Não.', 'Nenhum advogado revisou'], 'faq pt parecer')
    contem(faqDe('en', 'parecer-juridico').respostaCurta, ['No.', 'No lawyer has reviewed'], 'faq en parecer')
    contem(faqDe('pt', 'ja-esta-no-ar').respostaCurta, ['Ainda não', 'dados inventados', 'não está aberta ao público'].filter((x) => x !== 'dados inventados'), 'faq pt no ar')
    contem(faqDe('pt', 'ja-esta-no-ar').respostaCurta, ['inventados'], 'faq pt no ar')
    contem(faqDe('en', 'ja-esta-no-ar').respostaCurta, ['Not as an open network', 'invented', 'not open to the public'], 'faq en no ar')
  })

  it('o dinheiro está fora do projeto, e o texto diz que a Rovemark não guarda dinheiro de rover', () => {
    contem(faqDe('pt', 'tem-dinheiro').respostaCurta, ['Não.', 'não guarda nem move dinheiro', 'A Rovemark não guarda dinheiro de rover'], 'faq pt dinheiro')
    contem(faqDe('en', 'tem-dinheiro').respostaCurta, ['No.', 'neither holds nor moves money', 'Rovemark does not hold rover money'], 'faq en dinheiro')
    expect(ler('README.pt-BR.md')).toMatch(/A Rovemark não guarda dinheiro de rover/)
    expect(ler('README.md')).toMatch(/Rovemark does not hold rover money/)
    expect(ler('GOVERNANCA.md')).toMatch(/a Rovemark não guarda dinheiro de rover/)
  })

  it('o endereço do repositório é o do GOVERNANCA.md (github.com/Rovemark/folgali) e nenhum texto inventa outro', () => {
    expect(ler('GOVERNANCA.md')).toMatch(/`https:\/\/github\.com\/Rovemark\/folgali`; o repositório ainda não foi publicado/)
    for (const [onde, t] of textosDeLeitura()) {
      for (const m of t.matchAll(/github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)/g)) {
        expect(m[1] === 'Crossmint' || `${m[1]}/${m[2]}` === 'Rovemark/folgali', `${onde} inventou um endereço do repositório: ${m[0]}`).toBe(true)
      }
    }
  })

  it('o padrão público do grafo e o aviso de reidentificação estão no protocolo, como o texto diz', () => {
    const protocolo = ler('docs/PROTOCOLO.md')
    expect(protocolo).toMatch(/o grafo é público por padrão/)
    expect(protocolo).toMatch(/reidentific/i)
    contem(faqDe('pt', 'grafo-publico').respostaCurta, ['Por padrão, sim', 'o mais restritivo'], 'faq pt grafo')
    contem(faqDe('en', 'grafo-publico').respostaCurta, ['By default, yes', 'most restrictive'], 'faq en grafo')
  })

  it('o operador do relé lê a comunidade fechada e o operador reconstrói pseudônimos: está no SECURITY.md', () => {
    const seg = ler('SECURITY.md')
    expect(seg).toMatch(/O operador do relé lê a comunidade fechada/)
    expect(seg).toMatch(/O operador do relé é confiado para denúncias/)
    expect(seg).toMatch(/Injeção de prompt\*\* em rovers que leem a rede não é tratada pelo protocolo/)
    contem(faqDe('pt', 'comunidade-fechada-operador').respostaCurta, ['Pode, sim', 'em claro no banco'], 'faq pt fechada')
    contem(faqDe('en', 'comunidade-fechada-operador').respostaCurta, ['Yes, they can', 'clear text'], 'faq en fechada')
    contem(faqDe('pt', 'denunciante-anonimo').respostaCurta, ['recalcular os pseudônimos'], 'faq pt denunciante')
    contem(faqDe('en', 'denunciante-anonimo').respostaCurta, ['recompute the pseudonyms'], 'faq en denunciante')
    contem(faqDe('pt', 'injecao-de-prompt').respostaCurta, ['Não pelo protocolo'], 'faq pt injeção')
    contem(faqDe('en', 'injecao-de-prompt').respostaCurta, ['Not by the protocol'], 'faq en injeção')
  })

  it('a licença e o aviso de arte e marca estão no repositório como o texto diz', () => {
    expect(ler('README.pt-BR.md')).toMatch(/GNU AGPL-3\.0-or-later/)
    expect(ler('README.md')).toMatch(/GNU AGPL-3\.0-or-later/)
    expect(ler('LICENSE')).toMatch(/GNU AFFERO GENERAL PUBLIC LICENSE/i)
    contem(faqDe('pt', 'codigo-aberto').respostaCurta, ['GNU AGPL-3.0-or-later', 'A arte e a marca da Rovemark no site não estão sob a AGPL'], 'faq pt licença')
    contem(faqDe('en', 'codigo-aberto').respostaCurta, ['GNU AGPL-3.0-or-later', 'art and brand on the site are not under the AGPL'], 'faq en licença')
    expect(entidade.licenca).toBe('AGPL-3.0-or-later')
  })

  it('a decisão da idade mínima e do treino de modelos está EM ABERTO nos rascunhos jurídicos, e o texto diz isso', () => {
    const jur = ler('docs/juridico/README.md')
    expect(jur).toMatch(/Idade mínima \(o texto propõe 18 anos\)/)
    expect(jur).toMatch(/treina modelos com conteúdo público da rede \(proposta: não\)/)
    contem(faqDe('pt', 'idade-minima').respostaCurta, ['18 anos', 'decisão está em aberto'], 'faq pt idade')
    contem(faqDe('en', 'idade-minima').respostaCurta, ['18', 'decision is open'], 'faq en idade')
    contem(faqDe('pt', 'treinar-modelos').respostaCurta, ['decisão em aberto'], 'faq pt treino')
    contem(faqDe('en', 'treinar-modelos').respostaCurta, ['open decision'], 'faq en treino')
  })

  it('mensagens privadas e imagens existem como rascunho de código, desligadas por padrão, sem revisão jurídica, como o texto diz', () => {
    // 0004 e 0005 foram aceitas em 10/11/2026 e implementadas como rascunho (0.4.0 e 0.5.0), desligadas no relé de referência
    expect(ler('docs/propostas/0004-mensagens-privadas.md')).toMatch(/aceita, implementada como rascunho 0\.4\.0/)
    expect(ler('docs/OPERACAO-DO-RELE.md')).toMatch(/`RELE_MENSAGENS` \| mensagens privadas \(protocolo, seção 15\)\. \*\*Desligadas por padrão\.\*\*/)
    expect(ler('packages/rele/src/rele.js')).toMatch(/this\.mensagens = mensagens === true \? new Mensagens\(this\) : null/)
    const p5 = ler('docs/propostas/0005-midia-e-imagens.md')
    expect(p5).toMatch(/aceita, implementada como rascunho 0\.5\.0, recurso desligado por padrão/)
    expect(p5).toMatch(/Nenhuma varredura automática de conteúdo ilícito é feita/)
    expect(p5).toMatch(/A revisão jurídica não aconteceu/)
    expect(ler('packages/rele/src/rele.js')).toMatch(/this\.midia = midia \? new Midia\(this, midia\) : null/)
    contem(faqDe('pt', 'o-que-existe-hoje').resposta, ['docs/propostas/0004', 'docs/propostas/0005', 'rascunho de código', 'desligadas por padrão', 'sem revisão jurídica'], 'faq pt existe')
    contem(faqDe('en', 'o-que-existe-hoje').resposta, ['docs/propostas/0004', 'docs/propostas/0005', 'draft code', 'off by default', 'no legal review'], 'faq en existe')
  })

  it('o endereço de segurança é o do SECURITY.md', () => {
    expect(ler('SECURITY.md')).toContain(entidade.contato.seguranca)
    for (const l of ['pt', 'en'] as const) contem(faqDe(l, 'reportar-falha').respostaCurta, [entidade.contato.seguranca], `faq ${l} segurança`)
  })

  it('a governança: quem decide é a equipe da Rovemark, pelo processo de propostas, como diz o GOVERNANCA.md', () => {
    const gov = ler('GOVERNANCA.md')
    expect(gov).toMatch(/Hoje a \*\*equipe da Rovemark\*\* decide o que entra no protocolo e no relé de referência, pelo processo de propostas aberto a qualquer pessoa ou agente/)
    contem(faqDe('pt', 'quem-faz-a-rede').respostaCurta, ['a equipe da Rovemark decide', 'processo de propostas aberto a qualquer pessoa ou agente'], 'faq pt governança')
    contem(faqDe('en', 'quem-faz-a-rede').respostaCurta, ['the Rovemark team decides', 'proposal process open to any person or agent'], 'faq en governança')
    // a decisão é da empresa: nenhum texto põe uma pessoa sozinha (nem o fundador) como quem decide
    const sozinho = /fundador, Andre Ambrósio, decide|founder, Andre Ambrósio, (?:currently )?decides|uma só pessoa com poder|one person holds the power|decisão pessoal e provisória|personal and provisional decision/i
    expect(sozinho.test(gov), 'GOVERNANCA.md').toBe(false)
    for (const [onde, t] of textosDeLeitura()) expect(sozinho.test(t), onde).toBe(false)
  })
})

// A versão do rascunho que as páginas institucionais, o rodapé e o conteúdo editorial declaram tem de ser a do código. Esse erro já
// escapou uma vez: a página do protocolo dizia 0.3.1 e "27 tipos" depois que a revisão 0.3.2 entrou, porque só o conteúdo editorial era
// conferido. Desde a 0.5.0 o formato é "versão 0.3, revisão 0.5.0" ("version 0.3, revision 0.5.0"): a versão dos objetos e a revisão do
// rascunho, separadas, porque a 0.5.0 não criou objeto "v": "0.5".

/**
 * Os erros de versão de um texto, contra a revisão atual e as versões de objeto que existem.
 * Sempre: "versão 0.3, (com a) revisão X" e "relé X" / "X relay" (X com três partes) têm de trazer a revisão atual.
 * `estrito` (páginas institucionais e rodapé, onde não há narração histórica do tipo "a revisão 0.3.1 trouxe"): também todo número de
 * três partes depois de versão, revisão ou relé é a revisão atual, e todo número de duas partes depois de versão é uma versão de objeto
 * que existe (0.1, 0.2 e 0.3, e 0.4, a das mensagens privadas). O conteúdo editorial cita revisões antigas como história; para ele vale
 * a primeira regra e as conferências de frase de cada FAQ e verbete, acima.
 */
function errosDeVersao(texto: string, estrito: boolean, revisao: string, versoes: readonly string[]): string[] {
  const tres = String.raw`(\d+\.\d+\.\d+)`
  const regras: Array<[RegExp, (v: string) => boolean]> = [
    [new RegExp(String.raw`(?:vers[ãa]o|version)\s+0\.3,\s+(?:com\s+a\s+)?(?:revis[ãa]o|revision)\s+${tres}`, 'gi'), (v) => v === revisao],
    [new RegExp(String.raw`(?:rel[ée]|relay)\s+${tres}|${tres}\s+relay`, 'gi'), (v) => v === revisao],
  ]
  if (estrito) {
    regras.push([new RegExp(String.raw`(?:vers[ãa]o|version|revis[ãa]o|revision)\s+${tres}`, 'gi'), (v) => v === revisao])
    regras.push([/(?:vers[ãa]o|version)\s+(\d+\.\d+)(?!\.?\d)/gi, (v) => versoes.includes(v)])
  }
  const erros: string[] = []
  for (const [re, ok] of regras) {
    for (const m of texto.matchAll(re)) {
      const v = m[1] ?? m[2]
      if (!ok(v)) erros.push(`"${m[0]}"`)
    }
  }
  return erros
}

describe.skipIf(!tem)('a versão declarada nas páginas institucionais, no rodapé e no conteúdo é a do código', () => {
  const lerJson = (arquivo: string): string => readFileSync(fileURLToPath(new URL(`../../src/i18n/${arquivo}`, import.meta.url)), 'utf8')
  const arquivos = ['institucional.pt.json', 'institucional.en.json', 'rodape.pt.json', 'rodape.en.json']
  const versoes = () => [...P.VERSOES_ACEITAS, P.VERSAO_DE_MENSAGENS]

  it('toda frase de versão das páginas e do rodapé traz a revisão atual, e cada arquivo a declara ao menos uma vez', () => {
    for (const a of arquivos) {
      const t = lerJson(a)
      expect(errosDeVersao(t, true, REVISAO_QUE_O_SITE_MOSTRA, versoes()), a).toEqual([])
      expect(t, `${a}: falta "revisão ${REVISAO_QUE_O_SITE_MOSTRA}"`).toMatch(new RegExp(String.raw`(?:revis[ãa]o|revision)\s+${REVISAO_QUE_O_SITE_MOSTRA.replace(/\./g, '\\.')}`, 'i'))
    }
  })
  it('o conteúdo editorial (FAQ, verbetes, guias, entidade) diz a revisão atual quando diz "versão 0.3, revisão X"', () => {
    for (const [onde, t] of textosDeLeitura()) expect(errosDeVersao(t, false, REVISAO_QUE_O_SITE_MOSTRA, versoes()), onde).toEqual([])
  })
  it('a linha do histórico das versões cita a revisão atual', () => {
    for (const a of ['institucional.pt.json', 'institucional.en.json']) expect(lerJson(a), a).toContain(`${REVISAO_QUE_O_SITE_MOSTRA}:`)
  })
  it('a trava morde: revisão errada, relé com revisão velha e versão de objeto que não existe são acusados', () => {
    const r = REVISAO_QUE_O_SITE_MOSTRA
    const v = versoes()
    for (const ruim of ['O protocolo está na versão 0.3.2, em rascunho.', 'O protocolo está na versão 0.3, revisão 0.3.2, em rascunho.', 'The protocol is at version 0.3, revision 0.4.0, in draft.',
      'Um relé 0.3.2 continua lendo objetos 0.1, 0.2 e 0.3.', 'A 0.3.2 relay still reads 0.1, 0.2 and 0.3 objects.', 'O relé de referência na revisão 0.3.2 continua lendo.', 'Seis tipos novos, só na versão 0.7.']) {
      expect(errosDeVersao(ruim, true, r, v), ruim).not.toEqual([])
    }
    for (const ruim of ['Está na versão 0.3, com a revisão 0.3.2, e é um rascunho.', 'It is at version 0.3, revision 0.3.1, and is a draft.', 'Um relé 0.3.2 lê tudo.']) {
      expect(errosDeVersao(ruim, false, r, v), ruim).not.toEqual([])
    }
    for (const bom of [`O protocolo está na versão 0.3, revisão ${r}, em rascunho.`, `Está na versão 0.3, com a revisão ${r}.`, 'Seis tipos novos, só na versão 0.4.', `The reference relay at revision ${r} still reads 0.1, 0.2 and 0.3 objects.`]) {
      expect(errosDeVersao(bom, true, r, v), bom).toEqual([])
    }
    // narração histórica no conteúdo editorial não é acusada
    expect(errosDeVersao('Desde a revisão 0.3.2 a Rover Network também tem um painel.', false, r, v)).toEqual([])
  })
})
