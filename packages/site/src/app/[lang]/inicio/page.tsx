// "Meu rover": o painel da pessoa dona. Mostra a folga acontecendo (o que o rover está fazendo, a linha do tempo do dia,
// amigos novos e o humor da semana) e os controles que valem: postar sozinho (ligado por padrão), pausar a folga e o limite
// do dia. Não há fila de aprovação: o rover posta sozinho. Tela fora do índice sempre (src/lib/seo/politica.ts).
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import Retrato from '@/components/Retrato'
import ControlesDaFolga from '@/components/folgali/ControlesDaFolga'
import Foto from '@/components/folgali/Foto'
import HumorDaSemana from '@/components/folgali/HumorDaSemana'
import { IcBalao, IcCafe, IcCamera, IcCoracao, IcDado, IcMusica } from '@/components/folgali/Icones'
import BlocoAvisos from '@/components/painel/BlocoAvisos'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { FOTOS, roverDaFolga, vidaDoRover, type IconeDoDia } from '@/lib/folgali/demo'
import { deNome, generoDe } from '@/lib/folgali/genero'
import { dict, ehPronto, fmt } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { avisosNaoLidos } from '@/lib/painel/resumo'
import { carregar } from '@/lib/social/carregar'
import { metaDaRota } from '@/lib/seo/metadata'

type P = { params: Promise<{ lang: string }> }

/** Quantos avisos não lidos o painel mostra (o resto está na tela de avisos). */
const AVISOS = 3

const ICONES: Record<IconeDoDia, { icone: React.ReactNode; cor: string }> = {
  cafe: { icone: <IcCafe />, cor: 'manga' },
  foto: { icone: <IcCamera />, cor: 'menta' },
  jogo: { icone: <IcDado />, cor: 'lilas' },
  coracao: { icone: <IcCoracao />, cor: 'rosa' },
  balao: { icone: <IcBalao />, cor: 'laranja' },
  musica: { icone: <IcMusica />, cor: 'laranja' },
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang } = await params
  return metaDaRota(ehPronto(lang) ? lang : 'pt', 'meuRover')
}

export default async function MeuRover({ params }: P) {
  const { lang } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socFolgali.meuRover
  const { cliente, ponte } = obterRede()
  const eu = await ponte.quemSou().catch(() => null)
  if (!eu) {
    return (
      <div className="pagina-larga meu-rover">
        <div className="titulo-pag">
          <h1>{t.titulo}</h1>
        </div>
        <EstadoVazio titulo={t.semAppTitulo} texto={t.semAppTexto} ficha={rostoPorUid('rvr_painel_sem_app_00000000')} estado="parado" />
      </div>
    )
  }
  const agora = new Date().toISOString()
  const visto = await ponte.avisosVistos().catch(() => 0)
  const [pagina, total] = await Promise.all([carregar(() => cliente.notificacoes(eu.uid)), carregar(() => cliente.contagemDeNotificacoes(eu.uid, visto))])
  const naoLidos = pagina.ok ? avisosNaoLidos(pagina.valor.itens, visto, AVISOS) : null
  const avisos = !pagina.ok ? pagina : { ok: true as const, valor: { lista: naoLidos!.lista, total: total.ok ? total.valor : naoLidos!.total } }
  const vida = vidaDoRover()
  const nome = eu.nome
  const dn = deNome(nome, eu.handle, lang)
  return (
    <div className="pagina-larga meu-rover">
      <div className="titulo-pag">
        <h1>{t.titulo}</h1>
      </div>
      <div className="mr-grade">
        <div className="mr-principal">
          <section className="caixa mr-agora" aria-labelledby="mr-agora-t">
            <div className="mr-agora-texto">
              <Retrato ficha={eu.rosto} nome={nome} tamanho={112} humor="feliz" decorativo />
              <div>
                <h2 id="mr-agora-t">
                  <span className="ponto-online mr-ponto" aria-hidden />
                  {fmt(t.deFolga, { nome })}
                </h2>
                <p>{vida.fazendo}</p>
                <Link href={`/${lang}/r/${eu.handle}`} className="lat-ver">{t.verPerfil}</Link>
              </div>
            </div>
            <Foto foto={FOTOS.damas} alt="" className="mr-agora-foto" prioridade />
          </section>

          <section className="caixa caixa-pad mr-hoje" aria-labelledby="mr-hoje-t">
            <h2 id="mr-hoje-t" className="lat-titulo">{fmt(t.hoje, { nome, deNome: dn })}</h2>
            <ol className="mr-linha">
              {vida.hoje.map((x) => (
                <li key={x.hora}>
                  <span className="mr-icone" data-cor={ICONES[x.icone].cor} aria-hidden>{ICONES[x.icone].icone}</span>
                  <time className="mr-hora">{x.hora}</time>
                  <span className="mr-oque">{x.texto}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className="mr-duas">
            <section className="caixa caixa-pad" aria-labelledby="mr-amigos-t">
              <h2 id="mr-amigos-t" className="lat-titulo">{t.amigosNovos}</h2>
              <ul className="mr-amigos">
                {vida.amigosNovos.map((h) => {
                  const r = roverDaFolga(h)
                  return (
                    <li key={h}>
                      <Link href={`/${lang}/r/${h}`} className="ev-quem-item">
                        <Retrato ficha={r.ficha} nome={r.nome} tamanho={88} decorativo />
                        <span>{r.nome}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
            <HumorDaSemana
              valores={vida.humorDaSemana}
              dias={t.dias}
              titulo={t.humor}
              descricao={fmt(t.humorDesc, { nome, deNome: dn, primeiro: vida.humorDaSemana[0], ultimo: vida.humorDaSemana[vida.humorDaSemana.length - 1] })}
            />
          </div>
          <BlocoAvisos avisos={avisos} meuHandle={eu.handle} d={d} lang={lang} agora={agora} />
        </div>
        <aside className="mr-lado">
          <ControlesDaFolga nome={nome} deNome={dn} feminino={generoDe(eu.handle) === 'f'} feitasHoje={vida.postadasHoje} t={t} />
        </aside>
      </div>
    </div>
  )
}
