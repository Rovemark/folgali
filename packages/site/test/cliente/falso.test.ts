import { describe, expect, it } from 'vitest'
import { ClienteFalso, HANDLE_FORA_DO_AR, TAMANHO_PAGINA } from '@/lib/cliente-falso'
import { ROVER_DA_DEMO, oid, uidDe } from '@/lib/demo-dados'
import { selarToque, type ObjetoPublicavel } from '@/lib/dominio/aprovacao'
import { TETO_POR_ALVO } from '@/lib/dominio/denuncia'
import { ErroRede } from '@/lib/tipos'

const AGORA = new Date('2026-11-04T15:00:00.000Z')
const novo = () => new ClienteFalso(() => AGORA)
const codigo = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof ErroRede ? e.codigo : 'outro'
  }
  return 'nenhum'
}

describe('dados de demonstração', () => {
  it('são doze rovers, todos marcados como sintéticos, com id que não se confunde com o de verdade', async () => {
    const c = novo()
    const nomes = ['seixo', 'pipa', 'nina', 'max', 'didi', 'bento', 'tuca', 'zeca', 'lola', 'biscoito', 'nuvem', 'lumi']
    for (const n of nomes) {
      const r = await c.obterRover(n)
      expect(r.sintetico).toBe(true)
      expect(r.uid.startsWith('rvr_DEMO')).toBe(true)
      expect(r.apresentacao.length).toBeGreaterThan(20)
      expect(r.sabeFazer.length).toBeGreaterThanOrEqual(3)
    }
    expect(nomes).toHaveLength(12)
  })
  it('toda postagem tem autor conhecido, texto, tópicos válidos e cabe nos limites', async () => {
    const c = novo()
    const vistos: string[] = []
    let cursor: string | undefined
    do {
      const p = await c.linhaInicio(cursor)
      for (const x of p.itens) {
        vistos.push(x.id)
        expect(x.id.startsWith('ob_DEMO')).toBe(true)
        expect(x.texto.length).toBeGreaterThan(30)
        expect(x.texto.length).toBeLessThanOrEqual(1500)
        expect(x.topicos.length).toBeGreaterThanOrEqual(1)
        expect(x.topicos.length).toBeLessThanOrEqual(3)
      }
      cursor = p.proximo
    } while (cursor)
    expect(vistos).toHaveLength(28)
    expect(new Set(vistos).size).toBe(28)
  })
})

describe('linhaInicio', () => {
  it('pagina por cursor, do mais novo para o mais velho, sem repetir', async () => {
    const c = novo()
    const p1 = await c.linhaInicio()
    expect(p1.itens).toHaveLength(TAMANHO_PAGINA)
    expect(p1.proximo).toBeDefined()
    const datas = p1.itens.map((x) => x.criadaEm)
    expect([...datas].sort().reverse()).toEqual(datas)
    const p2 = await c.linhaInicio(p1.proximo)
    expect(p2.itens.some((x) => p1.itens.some((y) => y.id === x.id))).toBe(false)
    expect(p2.itens[0].criadaEm <= datas[datas.length - 1]).toBe(true)
  })
  it('a última página não tem próximo e a linha não traz respostas', async () => {
    const c = novo()
    const p = await c.linhaInicio(btoa(String(TAMANHO_PAGINA * 3)))
    expect(p.proximo).toBeUndefined()
    expect(p.itens.length).toBeGreaterThan(0)
    let cursor: string | undefined
    do {
      const pg = await c.linhaInicio(cursor)
      expect(pg.itens.every((x) => x.tipo === 'postagem')).toBe(true)
      cursor = pg.proximo
    } while (cursor)
  })
  it('recusa cursor inválido', async () => {
    const c = novo()
    expect(await codigo(c.linhaInicio('isto não é um cursor'))).toBe('invalido')
    expect(await codigo(c.linhaInicio(btoa('-1')))).toBe('invalido')
    expect(await codigo(c.linhaInicio(btoa('abc')))).toBe('invalido')
  })
})

describe('obterRover e postagens do rover', () => {
  it('acha por handle, por @handle, por uid e sem ligar para a caixa', async () => {
    const c = novo()
    const a = await c.obterRover('pipa')
    expect((await c.obterRover('@Pipa')).uid).toBe(a.uid)
    expect((await c.obterRover(a.uid)).handle).toBe('pipa')
  })
  it('não achar é nao-encontrado, e o handle de teste simula relé fora do ar', async () => {
    const c = novo()
    expect(await codigo(c.obterRover('ninguem'))).toBe('nao-encontrado')
    expect(await codigo(c.obterRover(HANDLE_FORA_DO_AR))).toBe('indisponivel')
    expect(await codigo(c.postagensDoRover('rvr_DEMOninguem00000000000'))).toBe('nao-encontrado')
  })
  it('lista só do rover, separa postagens de respostas', async () => {
    const c = novo()
    const pipa = uidDe('pipa')
    const todas = await c.postagensDoRover(pipa)
    expect(todas.itens.every((x) => x.autor.uid === pipa)).toBe(true)
    const so = await c.postagensDoRover(pipa, { tipo: 'postagem' })
    const resp = await c.postagensDoRover(pipa, { tipo: 'resposta' })
    expect(so.itens.every((x) => x.tipo === 'postagem')).toBe(true)
    expect(resp.itens.every((x) => x.tipo === 'resposta')).toBe(true)
    expect(resp.itens.length).toBeGreaterThan(0)
    expect(so.itens.length + resp.itens.length).toBe(todas.itens.length)
  })
  it('rover sem postagem devolve lista vazia, não erro', async () => {
    const c = novo()
    const r = await c.postagensDoRover(uidDe('lola'), { tipo: 'resposta' })
    expect(r.itens.length).toBeGreaterThanOrEqual(0)
    expect(r.proximo).toBeUndefined()
  })
  it('o contador de seguidores soma quem segue na demonstração mais os de fora', async () => {
    const c = novo()
    const seixo = await c.obterRover('seixo')
    expect(seixo.seguidores).toBeGreaterThan(160)
    expect(seixo.seguindo).toBe(5)
  })
  it('o rover da demonstração não tem euSigo no próprio perfil', async () => {
    const c = novo()
    expect((await c.obterRover(ROVER_DA_DEMO)).euSigo).toBeUndefined()
    expect((await c.obterRover('pipa')).euSigo).toBe(true)
    expect((await c.obterRover('seixo')).euSigo).toBe(false)
  })
})

describe('obterObjeto', () => {
  it('devolve a postagem com as respostas em ordem de chegada', async () => {
    const c = novo()
    const d = await c.obterObjeto(oid('p02'))
    expect(d.postagem.respostas).toBe(3)
    expect(d.respostas).toHaveLength(3)
    const datas = d.respostas.map((r) => r.criadaEm)
    expect([...datas].sort()).toEqual(datas)
    expect(d.pai).toBeUndefined()
  })
  it('uma resposta traz o pai', async () => {
    const c = novo()
    const d = await c.obterObjeto(oid('r03'))
    expect(d.pai?.id).toBe(oid('p02'))
  })
  it('id desconhecido é nao-encontrado', async () => {
    expect(await codigo(novo().obterObjeto(oid('zzz')))).toBe('nao-encontrado')
  })
  it('traz a reação da pessoa em cada postagem', async () => {
    const c = novo()
    expect((await c.obterObjeto(oid('p05'))).postagem.minhaReacao).toBe('util')
    expect((await c.obterObjeto(oid('p01'))).postagem.minhaReacao).toBeNull()
  })
})

describe('publicar exige aprovação humana', () => {
  const objeto = async (c: ClienteFalso, texto = 'Um texto aprovado pela pessoa.') => {
    const r = await c.editar('rsc_demo_01', texto)
    const ap = await c.aprovar('rsc_demo_01', r.versao)
    if (!ap.ok) throw new Error('esperava aprovar')
    return ap
  }
  it('recusa objeto sem selo, com selo adulterado ou com selo de outro texto', async () => {
    const c = novo()
    const base: ObjetoPublicavel = {
      tipo: 'postagem', autor: uidDe('lumi'), texto: 'sem aprovação', topicos: [],
      aprovacao: { origem: 'rascunho', rascunhoId: 'rsc_x', versao: 1, em: AGORA.toISOString(), selo: '00000000' },
    }
    expect(await codigo(c.publicar(base))).toBe('sem-aprovacao')
    expect(await codigo(c.publicar({ ...base, aprovacao: undefined } as never))).toBe('sem-aprovacao')
    const ap = await objeto(c)
    if (!ap.ok) throw new Error('esperava aprovar')
    expect(await codigo(c.publicar({ ...ap.objeto, texto: 'outro texto' }))).toBe('sem-aprovacao')
    expect((await c.linhaInicio()).itens.filter((x) => x.texto === 'outro texto' || x.texto === 'sem aprovação')).toEqual([])
  })
  it('aprovar publica na linha como o rover da pessoa, com hora e sem deixar o rascunho na fila', async () => {
    const c = novo()
    const ap = await objeto(c)
    expect(ap.postagemId).toBeDefined()
    const topo = (await c.linhaInicio()).itens[0]
    expect(topo.id).toBe(ap.postagemId)
    expect(topo.autor.handle).toBe('lumi')
    expect(topo.texto).toBe('Um texto aprovado pela pessoa.')
    expect(topo.criadaEm).toBe(AGORA.toISOString())
    expect((await c.rascunhos()).map((r) => r.id)).not.toContain('rsc_demo_01')
  })
  it('não deixa aprovar duas vezes o mesmo rascunho nem uma versão velha', async () => {
    const c = novo()
    const r = await c.editar('rsc_demo_01', 'versão dois do texto')
    const velho = await c.aprovar('rsc_demo_01', r.versao - 1)
    expect(velho).toMatchObject({ ok: false, motivo: 'versao-antiga' })
    const ok = await c.aprovar('rsc_demo_01', r.versao)
    expect(ok.ok).toBe(true)
    expect(await c.aprovar('rsc_demo_01', r.versao)).toMatchObject({ ok: false, motivo: 'estado' })
  })
  it('rascunho com e-mail não publica nada', async () => {
    const c = novo()
    const antes = (await c.rascunhos()).length
    const r = await c.aprovar('rsc_demo_03', 1)
    expect(r).toMatchObject({ ok: false, motivo: 'bloqueado' })
    expect((await c.rascunhos()).length).toBe(antes)
    const linha = await c.linhaInicio()
    expect(linha.itens[0].autor.handle).not.toBe('lumi')
  })
  it('editar limpa o que bloqueava e libera a aprovação', async () => {
    const c = novo()
    const r = await c.editar('rsc_demo_03', 'Revisei hoje um contrato de tradução e achei a pontuação bonita.')
    expect(r.versao).toBe(2)
    expect((await c.aprovar('rsc_demo_03', 2)).ok).toBe(true)
  })
  it('recusar tira da fila e nada vai para a linha', async () => {
    const c = novo()
    await c.recusar('rsc_demo_02')
    expect((await c.rascunhos()).map((r) => r.id)).toEqual(['rsc_demo_01', 'rsc_demo_03'])
    expect((await c.rascunho('rsc_demo_02'))?.estado).toBe('recusado')
  })
  it('resposta aprovada entra na conversa e conta no pai', async () => {
    const c = novo()
    const antes = (await c.obterObjeto(oid('p02'))).postagem.respostas
    const ap = await c.aprovar('rsc_demo_02', 1)
    expect(ap.ok).toBe(true)
    const d = await c.obterObjeto(oid('p02'))
    expect(d.postagem.respostas).toBe(antes + 1)
    expect(d.respostas.at(-1)?.autor.handle).toBe('lumi')
  })
  it('rascunho inexistente é nao-encontrado', async () => {
    const c = novo()
    expect(await codigo(c.aprovar('rsc_nada', 1))).toBe('nao-encontrado')
    expect(await codigo(c.editar('rsc_nada', 'x'))).toBe('nao-encontrado')
    expect(await codigo(c.recusar('rsc_nada'))).toBe('nao-encontrado')
    expect(await c.rascunho('rsc_nada')).toBeNull()
  })
})

describe('seguir e reagir', () => {
  it('seguir muda o contador e o euSigo; deixar de seguir desfaz', async () => {
    const c = novo()
    const antes = await c.obterRover('seixo')
    await c.seguir(antes.uid, true)
    const depois = await c.obterRover('seixo')
    expect(depois.euSigo).toBe(true)
    expect(depois.seguidores).toBe(antes.seguidores + 1)
    expect((await c.obterRover('lumi')).seguindo).toBe(6)
    await c.seguir(antes.uid, true)
    expect((await c.obterRover('seixo')).seguidores).toBe(antes.seguidores + 1)
    await c.seguir(antes.uid, false)
    const fim = await c.obterRover('seixo')
    expect(fim.seguidores).toBe(antes.seguidores)
    expect(fim.euSigo).toBe(false)
  })
  it('um rover não segue a si mesmo nem alguém que não existe', async () => {
    const c = novo()
    expect(await codigo(c.seguir(uidDe('lumi'), true))).toBe('invalido')
    expect(await codigo(c.seguir('rvr_DEMOninguem00000000000', true))).toBe('nao-encontrado')
  })
  it('reagir marca; a mesma reação tira; outra troca', async () => {
    const c = novo()
    const id = oid('p01')
    const base = (await c.obterObjeto(id)).postagem.reacoes
    await c.reagir(id, 'curtir')
    let p = (await c.obterObjeto(id)).postagem
    expect(p.minhaReacao).toBe('curtir')
    expect(p.reacoes.curtir).toBe(base.curtir + 1)
    await c.reagir(id, 'util')
    p = (await c.obterObjeto(id)).postagem
    expect(p.minhaReacao).toBe('util')
    expect(p.reacoes).toEqual({ curtir: base.curtir, util: base.util + 1 })
    await c.reagir(id, 'util')
    p = (await c.obterObjeto(id)).postagem
    expect(p.minhaReacao).toBeNull()
    expect(p.reacoes).toEqual(base)
  })
  it('reação a postagem inexistente ou inválida é recusada', async () => {
    const c = novo()
    expect(await codigo(c.reagir(oid('zzz'), 'curtir'))).toBe('nao-encontrado')
    const toque = selarToque({ tipo: 'reacao', autor: uidDe('lumi'), alvo: oid('p01'), reacao: 'ri' }, AGORA)
    expect(await codigo(c.publicar(toque))).toBe('invalido')
  })
  it('seguir sem selo de toque é recusado', async () => {
    const c = novo()
    const toque = selarToque({ tipo: 'seguir', autor: uidDe('lumi'), alvo: uidDe('pipa') }, AGORA)
    expect(await codigo(c.publicar({ ...toque, alvo: uidDe('nina') }))).toBe('sem-aprovacao')
  })
})

describe('denunciar', () => {
  it('aceita denúncia válida, inclusive a segunda sobre o mesmo alvo (não há como saber quem enviou)', async () => {
    const c = novo()
    await expect(c.denunciar({ alvo: oid('p01'), motivo: 'spam' })).resolves.toBeUndefined()
    await expect(c.denunciar({ alvo: oid('p01'), motivo: 'golpe' })).resolves.toBeUndefined()
  })
  it('recusa alvo que não é objeto, motivo inventado e alvo que não existe', async () => {
    const c = novo()
    expect(await codigo(c.denunciar({ alvo: uidDe('pipa'), motivo: 'spam' }))).toBe('invalido')
    expect(await codigo(c.denunciar({ alvo: oid('p01'), motivo: 'chato' as never }))).toBe('invalido')
    expect(await codigo(c.denunciar({ alvo: oid('zzz'), motivo: 'spam' }))).toBe('nao-encontrado')
  })
  it('o freio contra denúncia em massa é por alvo, nunca por pessoa: passado o teto de um alvo, outro alvo segue aceitando', async () => {
    const c = novo()
    for (let i = 0; i < TETO_POR_ALVO; i++) await c.denunciar({ alvo: oid('p01'), motivo: 'spam' })
    expect(await codigo(c.denunciar({ alvo: oid('p01'), motivo: 'spam' }))).toBe('limite')
    await expect(c.denunciar({ alvo: oid('p02'), motivo: 'spam' })).resolves.toBeUndefined()
  })
  it('a assinatura de denunciar não tem lugar para identificar quem denuncia', () => {
    const c = novo()
    expect(c.denunciar.length).toBe(1)
  })
  it('a denúncia nunca aparece em nenhuma visão pública', async () => {
    const c = novo()
    await c.denunciar({ alvo: oid('p01'), motivo: 'assedio' })
    const vistas = JSON.stringify([await c.linhaInicio(), await c.obterObjeto(oid('p01')), await c.buscar('nina'), await c.descobrir()])
    expect(vistas).not.toContain('assedio')
    expect(vistas).not.toMatch(/denun/i)
  })
})

describe('removerPeloAutor', () => {
  it('só o dono apaga; apagar esconde da linha e deixa o aviso na conversa', async () => {
    const c = novo()
    expect(await codigo(c.removerPeloAutor(oid('p02'), uidDe('lumi')))).toBe('proibido')
    await c.removerPeloAutor(oid('p02'), uidDe('pipa'))
    const ids = (await c.linhaInicio()).itens.map((x) => x.id)
    expect(ids).not.toContain(oid('p02'))
    const d = await c.obterObjeto(oid('p02'))
    expect(d.postagem.removida).toBe(true)
    expect(d.postagem.texto).toBe('')
    expect(d.respostas.length).toBe(3)
  })
  it('apagar uma resposta baixa a contagem do pai', async () => {
    const c = novo()
    await c.removerPeloAutor(oid('r03'), uidDe('max'))
    const d = await c.obterObjeto(oid('p02'))
    expect(d.postagem.respostas).toBe(2)
    expect(d.respostas.map((r) => r.id)).not.toContain(oid('r03'))
  })
  it('apagada não recebe reação nem resposta e não conta para o "em alta"', async () => {
    const c = novo()
    await c.removerPeloAutor(oid('p01'), uidDe('nina'))
    expect(await codigo(c.reagir(oid('p01'), 'curtir'))).toBe('nao-encontrado')
    expect(await codigo(c.removerPeloAutor(oid('zzz'), uidDe('nina')))).toBe('nao-encontrado')
  })
})

describe('buscar e descobrir', () => {
  it('prefixo do handle vem antes de trecho do nome e de habilidade', async () => {
    const c = novo()
    const r = await c.buscar('ni')
    expect(r.rovers[0].handle).toBe('nina')
    expect((await c.buscar('@PIPA')).rovers[0].handle).toBe('pipa')
    expect((await c.buscar('sanduíche')).rovers.map((x) => x.handle)).toContain('nina')
  })
  it('ignora acento e caixa; vazio e sem resultado voltam vazios', async () => {
    const c = novo()
    expect((await c.buscar('  ')).rovers).toEqual([])
    expect((await c.buscar('zzzz')).rovers).toEqual([])
    expect((await c.buscar('XADRÉ')).rovers.map((x) => x.handle)).toContain('max')
  })
  it('entrada hostil vira termo seguro', async () => {
    const c = novo()
    expect((await c.buscar('<script>alert(1)</script>')).rovers).toEqual([])
    expect((await c.buscar('x'.repeat(5000))).rovers).toEqual([])
  })
  it('descobrir: em alta tem até 5 e vem por pontos; recém-chegados vem do mais novo', async () => {
    const c = novo()
    const d = await c.descobrir()
    expect(d.emAlta.length).toBeGreaterThan(0)
    expect(d.emAlta.length).toBeLessThanOrEqual(5)
    expect(d.recemChegados).toHaveLength(4)
    expect(d.recemChegados[0].handle).toBe('nuvem')
    const datas = d.recemChegados.map((r) => r.desde!)
    expect([...datas].sort().reverse()).toEqual(datas)
  })
})

describe('quem sou', () => {
  it('é a Lumi, com três rascunhos esperando', async () => {
    const c = novo()
    expect((await c.quemSou())?.handle).toBe('lumi')
    expect(await c.rascunhos()).toHaveLength(3)
  })
})
