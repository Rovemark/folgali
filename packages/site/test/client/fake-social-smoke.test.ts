import { describe, expect, it } from 'vitest'
import { FakeClient } from '@/lib/fake-client'
import { uidOf } from '@/lib/demo-data'
import { COMMUNITIES, PAGES, TOPICS } from '@/lib/social/demo-ids'

const NOW = new Date('2026-11-05T15:00:00Z')
const newValue = () => new FakeClient(() => NOW)
const lumi = uidOf('lumi')

describe('smoke: every contract read answers', () => {
  it('reads everything without blowing up', async () => {
    const c = newValue()
    expect((await c.info()).social).toBe(true)
    const pg = await c.paginaDoRover('pipa')
    expect(pg.selos.confiavel).toBeGreaterThan(0)
    for (const f of [
      () => c.recados(uidOf('pipa')), () => c.depoimentos(uidOf('pipa')), () => c.depoimentos(lumi, { estado: 'pendentes' }), () => c.entregas(lumi), () => c.amigos(uidOf('pipa')),
      () => c.amigosEmComum(uidOf('pipa'), lumi), () => c.comunidadesDoRover(lumi), () => c.paginasDoRover(lumi), () => c.amizadesPendentes(lumi), () => c.convites(lumi), () => c.relacoes(lumi),
      () => c.notificacoes(lumi), () => c.contagemDeNotificacoes(lumi), () => c.comunidades(), () => c.comunidade(COMMUNITIES.cinema), () => c.membros(COMMUNITIES.cinema),
      () => c.pedidosDeEntrada(COMMUNITIES.cinema), () => c.convitesDaComunidade(COMMUNITIES.vitrola), () => c.banidos(COMMUNITIES.vitrola), () => c.topicos(COMMUNITIES.cinema),
      () => c.filaDeModeracao(COMMUNITIES.vitrola), () => c.registroDaComunidade(COMMUNITIES.vitrola), () => c.topico(TOPICS.cinemaPopcorn), () => c.respostas(TOPICS.cinemaPopcorn),
      () => c.historico(TOPICS.cinemaPopcorn), () => c.paginas(), () => c.pagina(PAGES.nuvens), () => c.atualizacoes(PAGES.nuvens), () => c.seguidoresDaPagina(PAGES.nuvens), () => c.linhaMista(),
      () => c.buscarTudo('pasta'), () => c.buscarTipo('pas', 'topicos'), () => c.emAlta('topicos'), () => c.emAlta('comunidades', '7d'), () => c.emAlta('paginas', '7d'),
      () => c.recemChegadosSociais(), () => c.sugestoes('comunidades'), () => c.sugestoes('rovers'), () => c.tendencias('7d'), () => c.registroDoRele(),
    ]) {
      const r = await f()
      expect(r).toBeTruthy()
    }
  })
})
