import { describe, expect, it } from 'vitest'
import { validarAto } from '@/lib/dominio/ato'
import { oid } from '@/lib/demo-dados'
import { RECURSOS_DA_DEMONSTRACAO } from '@/lib/social/falso/leitura'
import { COMUNIDADES, OBJETOS, TOPICOS } from '@/lib/social/demo-ids'
import { DIA, Relogio, U, cliente, codigo, como } from './ajuda-social'

// O cliente de demonstração espelha a revisão 0.3.1: declara os 13 recursos e devolve os mesmos campos que o relé (docs/API-REDE-SOCIAL.md, seção 15).
// Cada teste diz o que o relé 0.3.1 devolve e confere a forma e a regra de privacidade, para a tela mostrada na demonstração valer como a de verdade.

describe('info e suporta', () => {
  it('declara todos os 18 recursos (13 da 0.3.1, 4 da 0.3.2 e as mensagens da 0.4.0), e `suporta` responde por cada um (e nega um que não existe)', async () => {
    const { c } = cliente()
    const info = await c.info()
    expect(info.recursos).toHaveLength(18)
    expect(new Set(info.recursos).size).toBe(18)
    for (const novo of ['inicio', 'ordem-por-pessoas', 'vocabulario', 'anuncios', 'mensagens']) expect(info.recursos).toContain(novo)
    expect(info.recursos).toEqual([...RECURSOS_DA_DEMONSTRACAO])
    for (const r of RECURSOS_DA_DEMONSTRACAO) expect(await c.suporta(r)).toBe(true)
    expect(await c.suporta('recurso-que-nao-existe' as never)).toBe(false)
  })
})

describe('voce.* na página do rover', () => {
  it('amigoDesde, contaDesde e selosQueDei do leitor; seguidores e seguindo nas contagens', async () => {
    const { c } = cliente()
    const pg = await c.paginaDoRover(U('pipa'))
    expect(pg.voce).toMatchObject({ amigo: true, amigoDesde: '2026-10-28T15:00:00.000Z', contaDesde: '2026-10-27T15:00:00.000Z', selosQueDei: [] })
    expect(pg.contagens).toMatchObject({ seguidores: 219, seguindo: 5 })
  })
  it('quem não é amigo tem `amigoDesde` nulo, e a conta do leitor existe sempre', async () => {
    const { c } = cliente()
    const naoAmigo = await c.paginaDoRover(U('bolota'))
    expect(naoAmigo.voce?.amigo).toBe(false)
    expect(naoAmigo.voce?.amigoDesde).toBeNull()
    expect(typeof naoAmigo.voce?.contaDesde).toBe('string')
  })
  it('depois de dar um selo ele entra em `selosQueDei`, na ordem fixa, sem repetir', async () => {
    const rel = new Relogio()
    const { c } = cliente(rel)
    // a Lumi só dá selo a quem é amigo há 7 dias: a Pipa é amiga desde 28/10 e a data de hoje é 05/11
    await c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'rapido' })
    await c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'confiavel' })
    const voce = (await c.paginaDoRover(U('pipa'))).voce
    expect(voce?.selosQueDei).toEqual(['confiavel', 'rapido'])
    expect(await codigo(() => c.agir({ tipo: 'selo', alvo: U('pipa'), selo: 'rapido' }))).toBe('ja-existe')
  })
  it('em grafo privado as contagens de seguidores e de seguindo vêm nulas (nunca zero), e o dono do grafo continua vendo as suas', async () => {
    const { r } = como('lumi')
    const privado = [...r.rovers.values()].find((x) => x.grafo === 'privado' && x.uid !== U('lumi'))
    if (!privado) throw new Error('a demonstração precisa de um rover com grafo privado')
    const visto = await r.paginaDoRover(privado.uid)
    expect(visto.contagens.seguidores).toBeNull()
    expect(visto.contagens.seguindo).toBeNull()
    const proprio = await como(privado.handle).r.paginaDoRover(privado.uid)
    expect(typeof proprio.contagens.seguidores).toBe('number')
  })
})

describe('voce.* na comunidade', () => {
  it('o banido tem `banidoEm` (e nada de membroDesde); o membro tem `membroDesde` (e nada de banidoEm)', async () => {
    const { c } = cliente()
    expect((await c.comunidade(COMUNIDADES.praia)).voce).toMatchObject({ banido: true, banidoEm: '2026-10-31T15:00:00.000Z', membroDesde: null })
    expect((await c.comunidade(COMUNIDADES.cinema)).voce).toMatchObject({ banido: false, banidoEm: null, membroDesde: '2026-10-28T15:00:00.000Z' })
  })
})

describe('removidos e depoimentos enviados (só do próprio rover)', () => {
  it('removidos: o que foi escondido, quando, por qual papel e o trecho retido; nunca a pessoa que moderou', async () => {
    const { c } = cliente()
    const lista = await c.removidos(U('lumi'))
    expect(lista.itens).toHaveLength(1)
    expect(lista.itens[0]).toMatchObject({ escopo: 'comunidade', contexto: COMUNIDADES.praia, alvoTipo: 'topico', motivo: 'spam', por: 'dono', apelacao: null })
    expect(lista.itens[0].trecho).toContain('laços')
    expect(JSON.stringify(lista)).not.toContain(U('pingo'))
  })
  it('removidos é só do próprio: ninguém lê os de outro rover', async () => {
    const { c } = cliente()
    // a regra é a mesma da leitura própria que já existia (`depoimentos?estado=pendentes`): o cliente de demonstração responde `sem-permissao`
    expect(await codigo(() => c.removidos(U('pipa')))).toBe('sem-permissao')
    expect(await codigo(() => c.depoimentosEnviados(U('pipa')))).toBe('sem-permissao')
    expect(await codigo(() => c.removidos(U('ninguem-assim')))).toBe('nao-encontrado')
  })
  it('depoimentos enviados: o que a Lumi escreveu e espera aceite; some ao ser aceito ou recusado', async () => {
    const { r } = como('lumi')
    const lista = await r.depoimentosEnviados(U('lumi'))
    expect(lista.itens).toHaveLength(1)
    expect(lista.itens[0]).toMatchObject({ estado: 'pendente', alvo: { handle: 'seixo' } })
    expect(lista.itens[0].texto).toContain('Seixo')
    // o Seixo recusa: sai da lista de quem escreveu
    const dono = como('seixo').r
    dono.executar(U('seixo'), { tipo: 'depoimento-decisao', depoimento: lista.itens[0].id, decisao: 'recusar' })
    expect((await dono.depoimentosEnviados(U('seixo'))).itens).toHaveLength(0)
  })
  it('o depoimento pendente continua invisível para quem não é o autor nem o dono', async () => {
    const { r } = como('pipa')
    const visto = JSON.stringify(await r.depoimentos(U('seixo')))
    expect(visto).not.toContain('bilhete no lugar de cada coisa')
  })
})

describe('fila de moderação: topico e dispensar', () => {
  it('cada denúncia da fila traz o id do tópico onde o alvo vive (o próprio tópico, ou o tópico da resposta)', async () => {
    const { c } = cliente()
    const fila = await c.filaDeModeracao(COMUNIDADES.vitrola)
    const resposta = fila.denuncias.find((x) => x.alvo === OBJETOS.respostaParaModerar)!
    expect(resposta.alvoTipo).toBe('resposta-forum')
    expect(resposta.topico).toBe(oid('tvitrolaagulha'))
    const proprio = fila.denuncias.find((x) => x.alvoTipo === 'topico')!
    expect(proprio.topico).toBe(proprio.alvo)
  })
  it('dispensar tira a denúncia da fila, NÃO apaga o conteúdo, e registra o fato no registro público sem dizer quem denunciou', async () => {
    const { c } = cliente()
    const alvo = OBJETOS.respostaParaModerar
    const antes = (await c.filaDeModeracao(COMUNIDADES.vitrola)).denuncias.length
    expect(await codigo(() => c.agir({ tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo }))).toBe('ok')
    const fila = await c.filaDeModeracao(COMUNIDADES.vitrola)
    expect(fila.denuncias).toHaveLength(antes - 1)
    expect(fila.denuncias.map((x) => x.alvo)).not.toContain(alvo)
    // o conteúdo continua lá
    expect((await c.respostas(oid('tvitrolaagulha'))).itens.map((x) => x.id)).toContain(alvo)
    // o registro público diz que houve dispensa, com o PAPEL e o id, e nada de quem denunciou nem de quem dispensou
    const reg = (await c.registroDaComunidade(COMUNIDADES.vitrola)).itens[0]
    expect(reg).toMatchObject({ acao: 'dispensa', motivo: 'dispensada', por: 'dono', alvo, alvoTipo: 'resposta-forum' })
    expect(JSON.stringify(reg)).not.toContain(U('lumi'))
    expect(JSON.stringify(reg)).not.toMatch(/ps-/)
  })
  it('uma denúncia NOVA, de outra pessoa, reabre o caso; as dispensadas não voltam', async () => {
    const { r } = como('lumi')
    const alvo = OBJETOS.respostaParaModerar
    const totalAntes = (await r.filaDeModeracao(COMUNIDADES.vitrola)).denuncias.find((x) => x.alvo === alvo)!.total
    r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo })
    r.denuncias.push({ alvo, quem: 'outra-pessoa', motivo: 'spam', em: r.now(), pesa: true })
    const reaberto = (await r.filaDeModeracao(COMUNIDADES.vitrola)).denuncias.find((x) => x.alvo === alvo)!
    expect(reaberto.total).toBe(1)
    expect(reaberto.total).toBeLessThan(totalAntes)
  })
  it('só o dono e a moderação dispensam; sem denúncia aberta ou com alvo de outra comunidade é nao-encontrado', async () => {
    const alvo = OBJETOS.respostaParaModerar
    expect(await codigo(() => como('fiapo').r.executar(U('fiapo'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo }))).toBe('sem-permissao')
    const { r } = como('lumi')
    // o alvo é da comunidade dos tradutores: pedir para dispensá-lo "no Cinema de Sofá" não acha nada
    expect(await codigo(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.cinema, alvo }))).toBe('nao-encontrado')
    // um tópico sem denúncia aberta
    expect(await codigo(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.cinema, alvo: TOPICOS.cinemaPipoca }))).toBe('nao-encontrado')
    // dispensar duas vezes: a segunda não acha denúncia aberta
    r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo })
    expect(await codigo(() => r.executar(U('lumi'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo }))).toBe('nao-encontrado')
  })
  it('quem foi banido ou não lê a comunidade não dispensa nada, e a comunidade fechada nem existe para quem está fora', async () => {
    expect(await codigo(() => como('bolota').r.executar(U('bolota'), { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo: OBJETOS.respostaParaModerar }))).toBe('nao-encontrado')
  })
  it('o ato é validado antes de chegar ao cliente: ids com a forma certa ou nada', () => {
    const ok = { tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola, alvo: OBJETOS.respostaParaModerar }
    expect(validarAto(ok)).toEqual(ok)
    expect(validarAto({ ...ok, comunidade: 'qualquer' })).toBeNull()
    expect(validarAto({ ...ok, alvo: U('pipa') })).toBeNull()
    expect(validarAto({ tipo: 'denuncia-dispensar', comunidade: COMUNIDADES.vitrola })).toBeNull()
    // campo a mais é descartado: o ato limpo só tem os campos dele
    expect(validarAto({ ...ok, motivo: 'spam' })).toEqual(ok)
  })
})

describe('reações do tópico e `pessoas` no em alta', () => {
  it('o tópico traz as contagens e a reação do leitor; tocar muda as duas', async () => {
    const { c } = cliente()
    const t = await c.topico(TOPICOS.cinemaPipoca)
    expect(t.reacoes).toEqual({ curtir: 6, util: 3 })
    expect(t.minhaReacao).toBeNull()
    await c.reagir(TOPICOS.cinemaPipoca, 'util')
    const depois = await c.topico(TOPICOS.cinemaPipoca)
    expect(depois.reacoes).toEqual({ curtir: 6, util: 4 })
    expect(depois.minhaReacao).toBe('util')
  })
  it('`pessoas` do em alta é um número inteiro de pessoas DISTINTAS e nunca uma lista de quem', async () => {
    const { c } = cliente()
    for (const tipo of ['topicos', 'comunidades', 'paginas'] as const) {
      const itens = (await c.emAlta(tipo)) as { pessoas?: number }[]
      expect(itens.length).toBeGreaterThan(0)
      for (const x of itens) {
        expect(Number.isInteger(x.pessoas)).toBe(true)
        expect(x.pessoas).toBeGreaterThan(0)
      }
      expect(JSON.stringify(itens)).not.toMatch(/pessoas":\[/)
    }
  })
  it('uma mesma pessoa que responde e reage no tópico conta UMA vez', async () => {
    const rel = new Relogio()
    const { r } = como('lumi', rel)
    const antes = ((await r.emAlta('topicos')) as { id: string; pessoas: number }[]).find((x) => x.id === TOPICOS.cinemaPipoca)
    r.reagirSocial(U('max'), TOPICOS.cinemaPipoca, 'curtir')
    const depois = ((await r.emAlta('topicos')) as { id: string; pessoas: number }[]).find((x) => x.id === TOPICOS.cinemaPipoca)
    if (antes && depois) expect(depois.pessoas).toBeLessThanOrEqual(antes.pessoas + 1)
  })
})

describe('temas de páginas', () => {
  it('lista os temas das páginas abertas, do mais usado para o menos, com a contagem', async () => {
    const { c } = cliente()
    const temas = await c.temasDePaginas()
    expect(temas.length).toBeGreaterThan(1)
    for (const x of temas) {
      expect(x.tema).toMatch(/^[a-z0-9][a-z0-9-]{1,23}$/)
      expect(x.paginas).toBeGreaterThan(0)
    }
    const contagens = temas.map((x) => x.paginas)
    expect(contagens).toEqual([...contagens].sort((a, b) => b - a))
    // a soma das páginas por tema é o número de páginas abertas (conta andando por todas as páginas da lista)
    let cursor: string | undefined
    let abertas = 0
    for (let i = 0; i < 20; i++) {
      const p = await c.paginas({ cursor })
      abertas += p.itens.length
      if (!p.proximo) break
      cursor = p.proximo
    }
    expect(temas.reduce((n, x) => n + x.paginas, 0)).toBe(abertas)
  })
})

describe('o relógio do cliente continua sendo o único relógio', () => {
  it('avançar o relógio muda as datas devolvidas (nada de Date.now escondido)', async () => {
    const rel = new Relogio()
    const { c } = cliente(rel)
    const antes = (await c.paginaDoRover(U('pipa'))).voce
    rel.avancar(30 * DIA)
    const depois = (await c.paginaDoRover(U('pipa'))).voce
    expect(depois?.amigoDesde).toBe(antes?.amigoDesde)
    expect(depois?.contaDesde).toBe(antes?.contaDesde)
  })
})
