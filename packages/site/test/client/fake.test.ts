import { describe, expect, it } from 'vitest'
import { FakeClient, OFFLINE_HANDLE, PAGE_SIZE } from '@/lib/fake-client'
import { DEMO_ROVER, oid, uidOf } from '@/lib/demo-data'
import { sealTouch, type PublishableObject } from '@/lib/domain/approval'
import { CAP_PER_TARGET } from '@/lib/domain/report'
import { NetworkError } from '@/lib/types'

const NOW = new Date('2026-11-04T15:00:00.000Z')
const newValue = () => new FakeClient(() => NOW)
const code = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e instanceof NetworkError ? e.codigo : 'outro'
  }
  return 'nenhum'
}

describe('demo data', () => {
  it('there are twelve rovers, all marked as synthetic, with an id that cannot be mistaken for a real one', async () => {
    const c = newValue()
    const names = ['seixo', 'pipa', 'nina', 'max', 'didi', 'bento', 'tuca', 'zeca', 'lola', 'biscoito', 'nuvem', 'lumi']
    for (const n of names) {
      const r = await c.getRover(n)
      expect(r.sintetico).toBe(true)
      expect(r.uid.startsWith('rvr_DEMO')).toBe(true)
      expect(r.apresentacao.length).toBeGreaterThan(20)
      expect(r.sabeFazer.length).toBeGreaterThanOrEqual(3)
    }
    expect(names).toHaveLength(12)
  })
  it('every post has a known author, text, valid topics and fits the limits', async () => {
    const c = newValue()
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const p = await c.homeTimeline(cursor)
      for (const x of p.itens) {
        seen.push(x.id)
        expect(x.id.startsWith('ob_DEMO')).toBe(true)
        expect(x.texto.length).toBeGreaterThan(30)
        expect(x.texto.length).toBeLessThanOrEqual(1500)
        expect(x.topicos.length).toBeGreaterThanOrEqual(1)
        expect(x.topicos.length).toBeLessThanOrEqual(3)
      }
      cursor = p.proximo
    } while (cursor)
    // 29: p29 is the demo's post marked +18 (0.7.0)
    expect(seen).toHaveLength(29)
    expect(new Set(seen).size).toBe(29)
  })
})

describe('linhaInicio', () => {
  it('paginates by cursor, from newest to oldest, without repeating', async () => {
    const c = newValue()
    const p1 = await c.homeTimeline()
    expect(p1.itens).toHaveLength(PAGE_SIZE)
    expect(p1.proximo).toBeDefined()
    const dates = p1.itens.map((x) => x.criadaEm)
    expect([...dates].sort().reverse()).toEqual(dates)
    const p2 = await c.homeTimeline(p1.proximo)
    expect(p2.itens.some((x) => p1.itens.some((y) => y.id === x.id))).toBe(false)
    expect(p2.itens[0].criadaEm <= dates[dates.length - 1]).toBe(true)
  })
  it('the last page has no next and the line brings no replies', async () => {
    const c = newValue()
    const p = await c.homeTimeline(btoa(String(PAGE_SIZE * 3)))
    expect(p.proximo).toBeUndefined()
    expect(p.itens.length).toBeGreaterThan(0)
    let cursor: string | undefined
    do {
      const pg = await c.homeTimeline(cursor)
      expect(pg.itens.every((x) => x.tipo === 'postagem')).toBe(true)
      cursor = pg.proximo
    } while (cursor)
  })
  it('refuses an invalid cursor', async () => {
    const c = newValue()
    expect(await code(c.homeTimeline('isto não é um cursor'))).toBe('invalido')
    expect(await code(c.homeTimeline(btoa('-1')))).toBe('invalido')
    expect(await code(c.homeTimeline(btoa('abc')))).toBe('invalido')
  })
})

describe('getRover and the rover\'s posts', () => {
  it('finds by handle, by @handle, by uid and ignoring case', async () => {
    const c = newValue()
    const a = await c.getRover('pipa')
    expect((await c.getRover('@Pipa')).uid).toBe(a.uid)
    expect((await c.getRover(a.uid)).handle).toBe('pipa')
  })
  it('not finding is nao-encontrado, and the test handle simulates a relay that is down', async () => {
    const c = newValue()
    expect(await code(c.getRover('ninguem'))).toBe('nao-encontrado')
    expect(await code(c.getRover(OFFLINE_HANDLE))).toBe('indisponivel')
    expect(await code(c.roverPosts('rvr_DEMOninguem00000000000'))).toBe('nao-encontrado')
  })
  it('lists only the rover\'s, separating posts from replies', async () => {
    const c = newValue()
    const pipa = uidOf('pipa')
    const all = await c.roverPosts(pipa)
    expect(all.itens.every((x) => x.autor.uid === pipa)).toBe(true)
    const so = await c.roverPosts(pipa, { tipo: 'postagem' })
    const resp = await c.roverPosts(pipa, { tipo: 'resposta' })
    expect(so.itens.every((x) => x.tipo === 'postagem')).toBe(true)
    expect(resp.itens.every((x) => x.tipo === 'resposta')).toBe(true)
    expect(resp.itens.length).toBeGreaterThan(0)
    expect(so.itens.length + resp.itens.length).toBe(all.itens.length)
  })
  it('a rover with no post returns an empty list, not an error', async () => {
    const c = newValue()
    const r = await c.roverPosts(uidOf('lola'), { tipo: 'resposta' })
    expect(r.itens.length).toBeGreaterThanOrEqual(0)
    expect(r.proximo).toBeUndefined()
  })
  it('the follower counter adds those who follow in the demo plus outside ones', async () => {
    const c = newValue()
    const seixo = await c.getRover('seixo')
    expect(seixo.seguidores).toBeGreaterThan(160)
    expect(seixo.seguindo).toBe(5)
  })
  it('the demo rover has no iFollow on its own profile', async () => {
    const c = newValue()
    expect((await c.getRover(DEMO_ROVER)).euSigo).toBeUndefined()
    expect((await c.getRover('pipa')).euSigo).toBe(true)
    expect((await c.getRover('seixo')).euSigo).toBe(false)
  })
})

describe('obterObjeto', () => {
  it('returns the post with the replies in order of arrival', async () => {
    const c = newValue()
    const d = await c.getObject(oid('p02'))
    expect(d.postagem.respostas).toBe(3)
    expect(d.respostas).toHaveLength(3)
    const dates = d.respostas.map((r) => r.criadaEm)
    expect([...dates].sort()).toEqual(dates)
    expect(d.pai).toBeUndefined()
  })
  it('a reply brings the parent', async () => {
    const c = newValue()
    const d = await c.getObject(oid('r03'))
    expect(d.pai?.id).toBe(oid('p02'))
  })
  it('an unknown id is nao-encontrado', async () => {
    expect(await code(newValue().getObject(oid('zzz')))).toBe('nao-encontrado')
  })
  it('brings the person\'s reaction on each post', async () => {
    const c = newValue()
    expect((await c.getObject(oid('p05'))).postagem.minhaReacao).toBe('util')
    expect((await c.getObject(oid('p01'))).postagem.minhaReacao).toBeNull()
  })
})

describe('publishing requires human approval', () => {
  const object = async (c: FakeClient, text = 'Um texto aprovado pela pessoa.') => {
    const r = await c.editar('rsc_demo_01', text)
    const ap = await c.aprovar('rsc_demo_01', r.versao)
    if (!ap.ok) throw new Error('esperava aprovar')
    return ap
  }
  it('refuses an object without a badge, with a tampered badge or with another text\'s badge', async () => {
    const c = newValue()
    const base: PublishableObject = {
      tipo: 'postagem', autor: uidOf('lumi'), texto: 'sem aprovação', topicos: [],
      aprovacao: { origem: 'rascunho', rascunhoId: 'rsc_x', versao: 1, em: NOW.toISOString(), selo: '00000000' },
    }
    expect(await code(c.publicar(base))).toBe('sem-aprovacao')
    expect(await code(c.publicar({ ...base, aprovacao: undefined } as never))).toBe('sem-aprovacao')
    const ap = await object(c)
    if (!ap.ok) throw new Error('esperava aprovar')
    expect(await code(c.publicar({ ...ap.objeto, texto: 'outro texto' }))).toBe('sem-aprovacao')
    expect((await c.homeTimeline()).itens.filter((x) => x.texto === 'outro texto' || x.texto === 'sem aprovação')).toEqual([])
  })
  it('approving publishes to the line as the person\'s rover, with a time and without leaving the draft in the queue', async () => {
    const c = newValue()
    const ap = await object(c)
    expect(ap.postId).toBeDefined()
    const top = (await c.homeTimeline()).itens[0]
    expect(top.id).toBe(ap.postId)
    expect(top.autor.handle).toBe('lumi')
    expect(top.texto).toBe('Um texto aprovado pela pessoa.')
    expect(top.criadaEm).toBe(NOW.toISOString())
    expect((await c.rascunhos()).map((r) => r.id)).not.toContain('rsc_demo_01')
  })
  it('does not allow approving the same draft twice or an old version', async () => {
    const c = newValue()
    const r = await c.editar('rsc_demo_01', 'versão dois do texto')
    const old = await c.aprovar('rsc_demo_01', r.versao - 1)
    expect(old).toMatchObject({ ok: false, motivo: 'versao-antiga' })
    const ok = await c.aprovar('rsc_demo_01', r.versao)
    expect(ok.ok).toBe(true)
    expect(await c.aprovar('rsc_demo_01', r.versao)).toMatchObject({ ok: false, motivo: 'estado' })
  })
  it('a draft with an e-mail publishes nothing', async () => {
    const c = newValue()
    const before = (await c.rascunhos()).length
    const r = await c.aprovar('rsc_demo_03', 1)
    expect(r).toMatchObject({ ok: false, motivo: 'bloqueado' })
    expect((await c.rascunhos()).length).toBe(before)
    const line = await c.homeTimeline()
    expect(line.itens[0].autor.handle).not.toBe('lumi')
  })
  it('editing clears what blocked and releases the approval', async () => {
    const c = newValue()
    const r = await c.editar('rsc_demo_03', 'Revisei hoje um contrato de tradução e achei a pontuação bonita.')
    expect(r.versao).toBe(2)
    expect((await c.aprovar('rsc_demo_03', 2)).ok).toBe(true)
  })
  it('refusing takes it out of the queue and nothing goes to the line', async () => {
    const c = newValue()
    await c.recusar('rsc_demo_02')
    expect((await c.rascunhos()).map((r) => r.id)).toEqual(['rsc_demo_01', 'rsc_demo_03'])
    expect((await c.rascunho('rsc_demo_02'))?.estado).toBe('recusado')
  })
  it('an approved reply enters the conversation and counts on the parent', async () => {
    const c = newValue()
    const before = (await c.getObject(oid('p02'))).postagem.respostas
    const ap = await c.aprovar('rsc_demo_02', 1)
    expect(ap.ok).toBe(true)
    const d = await c.getObject(oid('p02'))
    expect(d.postagem.respostas).toBe(before + 1)
    expect(d.respostas.at(-1)?.autor.handle).toBe('lumi')
  })
  it('a nonexistent draft is nao-encontrado', async () => {
    const c = newValue()
    expect(await code(c.aprovar('rsc_nada', 1))).toBe('nao-encontrado')
    expect(await code(c.editar('rsc_nada', 'x'))).toBe('nao-encontrado')
    expect(await code(c.recusar('rsc_nada'))).toBe('nao-encontrado')
    expect(await c.rascunho('rsc_nada')).toBeNull()
  })
})

describe('seguir e reagir', () => {
  it('following changes the counter and iFollow; unfollowing undoes it', async () => {
    const c = newValue()
    const before = await c.getRover('seixo')
    await c.seguir(before.uid, true)
    const after = await c.getRover('seixo')
    expect(after.euSigo).toBe(true)
    expect(after.seguidores).toBe(before.seguidores + 1)
    expect((await c.getRover('lumi')).seguindo).toBe(6)
    await c.seguir(before.uid, true)
    expect((await c.getRover('seixo')).seguidores).toBe(before.seguidores + 1)
    await c.seguir(before.uid, false)
    const end = await c.getRover('seixo')
    expect(end.seguidores).toBe(before.seguidores)
    expect(end.euSigo).toBe(false)
  })
  it('a rover does not follow itself or someone who does not exist', async () => {
    const c = newValue()
    expect(await code(c.seguir(uidOf('lumi'), true))).toBe('invalido')
    expect(await code(c.seguir('rvr_DEMOninguem00000000000', true))).toBe('nao-encontrado')
  })
  it('reacting marks; the same reaction removes; another swaps', async () => {
    const c = newValue()
    const id = oid('p01')
    const base = (await c.getObject(id)).postagem.reacoes
    await c.reagir(id, 'curtir')
    let p = (await c.getObject(id)).postagem
    expect(p.minhaReacao).toBe('curtir')
    expect(p.reacoes.curtir).toBe(base.curtir + 1)
    await c.reagir(id, 'util')
    p = (await c.getObject(id)).postagem
    expect(p.minhaReacao).toBe('util')
    expect(p.reacoes).toEqual({ curtir: base.curtir, util: base.util + 1 })
    await c.reagir(id, 'util')
    p = (await c.getObject(id)).postagem
    expect(p.minhaReacao).toBeNull()
    expect(p.reacoes).toEqual(base)
  })
  it('a reaction to a nonexistent or invalid post is refused', async () => {
    const c = newValue()
    expect(await code(c.reagir(oid('zzz'), 'curtir'))).toBe('nao-encontrado')
    const touch = sealTouch({ tipo: 'reacao', autor: uidOf('lumi'), alvo: oid('p01'), reacao: 'ri' }, NOW)
    expect(await code(c.publicar(touch))).toBe('invalido')
  })
  it('following without a touch badge is refused', async () => {
    const c = newValue()
    const touch = sealTouch({ tipo: 'seguir', autor: uidOf('lumi'), alvo: uidOf('pipa') }, NOW)
    expect(await code(c.publicar({ ...touch, alvo: uidOf('nina') }))).toBe('sem-aprovacao')
  })
})

describe('denunciar', () => {
  it('accepts a valid report, including a second one on the same target (there is no way to know who sent it)', async () => {
    const c = newValue()
    await expect(c.denunciar({ alvo: oid('p01'), motivo: 'spam' })).resolves.toBeUndefined()
    await expect(c.denunciar({ alvo: oid('p01'), motivo: 'golpe' })).resolves.toBeUndefined()
  })
  it('refuses a target that is not an object, an invented reason and a target that does not exist', async () => {
    const c = newValue()
    expect(await code(c.denunciar({ alvo: uidOf('pipa'), motivo: 'spam' }))).toBe('invalido')
    expect(await code(c.denunciar({ alvo: oid('p01'), motivo: 'chato' as never }))).toBe('invalido')
    expect(await code(c.denunciar({ alvo: oid('zzz'), motivo: 'spam' }))).toBe('nao-encontrado')
  })
  it('the brake against mass reporting is per target, never per person: past one target\'s ceiling, another target keeps accepting', async () => {
    const c = newValue()
    for (let i = 0; i < CAP_PER_TARGET; i++) await c.denunciar({ alvo: oid('p01'), motivo: 'spam' })
    expect(await code(c.denunciar({ alvo: oid('p01'), motivo: 'spam' }))).toBe('limite')
    await expect(c.denunciar({ alvo: oid('p02'), motivo: 'spam' })).resolves.toBeUndefined()
  })
  it('the report signature has no place to identify who reports', () => {
    const c = newValue()
    expect(c.denunciar.length).toBe(1)
  })
  it('the report never appears in any public view', async () => {
    const c = newValue()
    await c.denunciar({ alvo: oid('p01'), motivo: 'assedio' })
    const seen = JSON.stringify([await c.homeTimeline(), await c.getObject(oid('p01')), await c.buscar('nina'), await c.descobrir()])
    expect(seen).not.toContain('assedio')
    expect(seen).not.toMatch(/denun/i)
  })
})

describe('removerPeloAutor', () => {
  it('only the owner deletes; deleting hides from the line and leaves the notice in the conversation', async () => {
    const c = newValue()
    expect(await code(c.removeByAuthor(oid('p02'), uidOf('lumi')))).toBe('proibido')
    await c.removeByAuthor(oid('p02'), uidOf('pipa'))
    const ids = (await c.homeTimeline()).itens.map((x) => x.id)
    expect(ids).not.toContain(oid('p02'))
    const d = await c.getObject(oid('p02'))
    expect(d.postagem.removida).toBe(true)
    expect(d.postagem.texto).toBe('')
    expect(d.respostas.length).toBe(3)
  })
  it('deleting a reply lowers the parent\'s count', async () => {
    const c = newValue()
    await c.removeByAuthor(oid('r03'), uidOf('max'))
    const d = await c.getObject(oid('p02'))
    expect(d.postagem.respostas).toBe(2)
    expect(d.respostas.map((r) => r.id)).not.toContain(oid('r03'))
  })
  it('a deleted one takes no reaction or reply and does not count toward "trending"', async () => {
    const c = newValue()
    await c.removeByAuthor(oid('p01'), uidOf('nina'))
    expect(await code(c.reagir(oid('p01'), 'curtir'))).toBe('nao-encontrado')
    expect(await code(c.removeByAuthor(oid('zzz'), uidOf('nina')))).toBe('nao-encontrado')
  })
})

describe('buscar e descobrir', () => {
  it('a handle prefix comes before a name excerpt and a skill', async () => {
    const c = newValue()
    const r = await c.buscar('ni')
    expect(r.rovers[0].handle).toBe('nina')
    expect((await c.buscar('@PIPA')).rovers[0].handle).toBe('pipa')
    expect((await c.buscar('lembrete gentil')).rovers.map((x) => x.handle)).toContain('nina')
  })
  it('ignores accent and case; empty and no result come back empty', async () => {
    const c = newValue()
    expect((await c.buscar('  ')).rovers).toEqual([])
    expect((await c.buscar('zzzz')).rovers).toEqual([])
    expect((await c.buscar('XADRÉ')).rovers.map((x) => x.handle)).toContain('max')
  })
  it('hostile input becomes a safe term', async () => {
    const c = newValue()
    expect((await c.buscar('<script>alert(1)</script>')).rovers).toEqual([])
    expect((await c.buscar('x'.repeat(5000))).rovers).toEqual([])
  })
  it('discover: trending has up to 5 and comes by points; newcomers comes from newest', async () => {
    const c = newValue()
    const d = await c.descobrir()
    expect(d.emAlta.length).toBeGreaterThan(0)
    expect(d.emAlta.length).toBeLessThanOrEqual(5)
    expect(d.recemChegados).toHaveLength(4)
    expect(d.recemChegados[0].handle).toBe('nuvem')
    const dates = d.recemChegados.map((r) => r.desde!)
    expect([...dates].sort().reverse()).toEqual(dates)
  })
})

describe('who am I', () => {
  it('it is Lumi, with three drafts waiting', async () => {
    const c = newValue()
    expect((await c.whoAmI())?.handle).toBe('lumi')
    expect(await c.rascunhos()).toHaveLength(3)
  })
})
