import { describe, expect, it } from 'vitest'
import { ClienteFalso } from '@/lib/cliente-falso'
import { uidDe } from '@/lib/demo-dados'
import { COMUNIDADES, PAGINAS, TOPICOS } from '@/lib/social/demo-ids'

const AGORA = new Date('2026-11-05T15:00:00Z')
const novo = () => new ClienteFalso(() => AGORA)
const lumi = uidDe('lumi')

describe('fumaça: toda leitura do contrato responde', () => {
  it('lê tudo sem estourar', async () => {
    const c = novo()
    expect((await c.info()).social).toBe(true)
    const pg = await c.paginaDoRover('pipa')
    expect(pg.selos.confiavel).toBeGreaterThan(0)
    for (const f of [
      () => c.recados(uidDe('pipa')), () => c.depoimentos(uidDe('pipa')), () => c.depoimentos(lumi, { estado: 'pendentes' }), () => c.entregas(lumi), () => c.amigos(uidDe('pipa')),
      () => c.amigosEmComum(uidDe('pipa'), lumi), () => c.comunidadesDoRover(lumi), () => c.paginasDoRover(lumi), () => c.amizadesPendentes(lumi), () => c.convites(lumi), () => c.relacoes(lumi),
      () => c.notificacoes(lumi), () => c.contagemDeNotificacoes(lumi), () => c.comunidades(), () => c.comunidade(COMUNIDADES.cinema), () => c.membros(COMUNIDADES.cinema),
      () => c.pedidosDeEntrada(COMUNIDADES.cinema), () => c.convitesDaComunidade(COMUNIDADES.vitrola), () => c.banidos(COMUNIDADES.vitrola), () => c.topicos(COMUNIDADES.cinema),
      () => c.filaDeModeracao(COMUNIDADES.vitrola), () => c.registroDaComunidade(COMUNIDADES.vitrola), () => c.topico(TOPICOS.cinemaPipoca), () => c.respostas(TOPICOS.cinemaPipoca),
      () => c.historico(TOPICOS.cinemaPipoca), () => c.paginas(), () => c.pagina(PAGINAS.nuvens), () => c.atualizacoes(PAGINAS.nuvens), () => c.seguidoresDaPagina(PAGINAS.nuvens), () => c.linhaMista(),
      () => c.buscarTudo('pasta'), () => c.buscarTipo('pas', 'topicos'), () => c.emAlta('topicos'), () => c.emAlta('comunidades', '7d'), () => c.emAlta('paginas', '7d'),
      () => c.recemChegadosSociais(), () => c.sugestoes('comunidades'), () => c.sugestoes('rovers'), () => c.tendencias('7d'), () => c.registroDoRele(),
    ]) {
      const r = await f()
      expect(r).toBeTruthy()
    }
  })
})
