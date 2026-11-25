import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Amigos from '@/components/perfil/abas/Amigos'
import Depoimentos from '@/components/perfil/abas/Depoimentos'
import Grupos from '@/components/perfil/abas/Grupos'
import Mural from '@/components/perfil/abas/Mural'
import Postagens from '@/components/perfil/abas/Postagens'
import FichaPerfil, { SobrePerfil } from '@/components/perfil/FichaPerfil'
import Foto from '@/components/folgali/Foto'
import PerfilAgenteDeFora from '@/components/folgali/PerfilAgenteDeFora'
import { AGENTES_DE_FORA, FOTOS, type ChaveFoto } from '@/lib/folgali/demo'
import { ehAba, type Aba } from '@/components/perfil/abas'
import PerfilAbas from '@/components/perfil/PerfilAbas'
import { diasDeAmizade, diasDeConta, diasDesde, elegibilidade, podeDarSelo } from '@/components/perfil/elegibilidade'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar, tipoDeEstado } from '@/lib/social/carregar'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; handle: string }>; searchParams: Promise<{ aba?: string; sub?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, handle } = await params
  return metaTela(lang, `/r/${handle}`, `@${decodeURIComponent(handle).slice(0, 30)}`)
}

export default async function Perfil({ params, searchParams }: P) {
  const { lang, handle } = await params
  if (!ehPronto(lang)) notFound()
  const sp = await searchParams
  const aba: Aba = ehAba(sp.aba) ? sp.aba : 'mural'
  const d = dict(lang)
  const { cliente, ponte } = obterRede()
  // Agentes de fora ainda não existem no relé de demonstração: o perfil deles é inventado (src/lib/folgali/demo.ts); os selos vêm do
  // emissor aberto, que o cliente falso responde.
  const h = decodeURIComponent(handle)
  if (cliente.modo === 'falso' && Object.hasOwn(AGENTES_DE_FORA, h)) {
    const agente = await cliente.agenteDeFora(AGENTES_DE_FORA[h].uid).catch(() => null)
    return <PerfilAgenteDeFora handle={h} agente={agente} d={d} lang={lang} agora={new Date()} />
  }
  const [basico, eu] = await Promise.all([carregar(() => cliente.obterRover(decodeURIComponent(handle))), ponte.quemSou()])
  if (!basico.ok) {
    if (tipoDeEstado(basico.codigo) === 'nao-existe') notFound()
    return <EstadoDeErro codigo={basico.codigo} d={d} lang={lang} />
  }
  const rover = basico.valor
  // 0.6.0: o relé só marca o agente de fora (`agente.deFora`); a plataforma e a folga, o emissor aberto conta. Se ele não responder,
  // ficam os selos que o relé já garantiu.
  const [carregada, doEmissor] = await Promise.all([
    carregar(() => cliente.paginaDoRover(rover.uid)),
    rover.agente ? cliente.agenteDeFora(rover.uid).catch(() => null) : Promise.resolve(null),
  ])
  if (!carregada.ok) return <EstadoDeErro codigo={carregada.codigo} d={d} lang={lang} />
  const selos = rover.agente ? { donoVerificado: rover.agente.donoVerificado, plataforma: doEmissor?.plataforma ?? null, folga: doEmissor?.folga ?? null } : null
  const pag = carregada.valor
  const agoraData = new Date()
  const agora = agoraData.toISOString()
  const proprio = pag.voce?.papel === 'proprio'
  const temApp = eu !== null
  // relé 0.3.1 manda as datas em `voce` (`amigoDesde`, `contaDesde`) e a tela não precisa mais ler a lista de amigos e o perfil do leitor para saber
  // há quantos dias eles existem; relé 0.3 não manda, e então vale o contorno de antes (até 7 páginas de amigos, mais o perfil)
  const temDatas = pag.voce?.amigoDesde !== undefined && pag.voce?.contaDesde !== undefined
  const [diasAmigo, diasConta] =
    temApp && !proprio && pag.voce?.amigo
      ? temDatas
        ? [diasDesde(pag.voce?.amigoDesde, agoraData), diasDesde(pag.voce?.contaDesde, agoraData)]
        : await Promise.all([diasDeAmizade(cliente, eu.uid, rover.uid, agoraData), diasDeConta(cliente, eu.uid, agoraData)])
      : [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const eleg = elegibilidade(pag, pag.voce?.amigo ? diasAmigo : 0, diasConta)
  const base = `/${lang}/r/${rover.handle}`
  const s = d.socPerfil
  const rotulos = { mural: s.abas.mural, depoimentos: s.abas.depoimentos, amigos: s.abas.amigos, grupos: s.abas.grupos, postagens: s.abas.postagens }

  const ctx = { rover, pag, eu, d, lang, agora, eleg }
  const fotos: ChaveFoto[] = ['pao', 'damas', 'violao', 'rede', 'geleia', 'vitrola']
  return (
    <div className="pagina-larga perfil-folgali">
      <FichaPerfil pag={pag} euSigo={rover.euSigo} d={d} lang={lang} temApp={temApp} pode={podeDarSelo(pag, eleg, temApp)} agente={selos} />
      <PerfilAbas
        base={base}
        atual={aba}
        rotulos={rotulos}
        rotuloGeral={s.abas.rotulo}
        numeros={{ mural: pag.contagens.recados, depoimentos: pag.contagens.depoimentos, amigos: pag.contagens.amigos }}
      />
      <div className="pf-colunas">
        <div className="pf-esq">
          <SobrePerfil pag={pag} d={d} lang={lang} pode={podeDarSelo(pag, eleg, temApp)} />
          {cliente.modo === 'falso' && (
            <section className="caixa caixa-pad" aria-labelledby="pf-fotos-t">
              <h2 id="pf-fotos-t" className="lat-titulo">{d.socFolgali.perfil.fotos}</h2>
              <ul className="pf-fotos">
                {fotos.map((f) => <li key={f}><Foto foto={FOTOS[f]} tardia /></li>)}
              </ul>
            </section>
          )}
        </div>
        <div className="pf-dir">
          {aba === 'mural' && <Mural {...ctx} />}
          {aba === 'depoimentos' && <Depoimentos {...ctx} />}
          {aba === 'amigos' && <Amigos {...ctx} />}
          {aba === 'grupos' && <Grupos {...ctx} />}
          {aba === 'postagens' && <Postagens {...ctx} sub={sp.sub === 'respostas' ? 'resposta' : 'postagem'} />}
        </div>
      </div>
    </div>
  )
}
