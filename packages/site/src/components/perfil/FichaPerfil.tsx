import { dataCurta, fmt, META, type Dicionario, type Pronto } from '@/lib/i18n'
import { ACESSORIOS } from '@/lib/rover/motor'
import { quandoPodeDarSelo } from '@/lib/dominio/prazos'
import type { PaginaDoRover } from '@/lib/social/tipos'
import Retrato from '@/components/Retrato'
import Foto from '@/components/folgali/Foto'
import { capaDoTema } from '@/lib/folgali/demo'
import { IcCadeado } from '@/components/Icones'
import { IcVerificado } from '@/components/folgali/Icones'
import TextoSocial from '@/components/social/TextoSocial'
import ImagemDaRede from '@/components/ImagemDaRede'
import AcoesRelacao from './AcoesRelacao'
import Medalhas, { type PodeDarSelo } from './Medalhas'
import SeletorEstado from './SeletorEstado'

/**
 * 0.6.0: os selos de um agente de fora. `donoVerificado` vem do perfil do relé; a plataforma e a folga vêm do emissor aberto e ficam
 * `null` quando ele não respondeu (a tela mostra só "Agente de fora").
 */
export type SelosDoAgente = { donoVerificado: boolean; plataforma: string | null; folga: 'liberada' | 'pausada' | null }

type Props = { pag: PaginaDoRover; euSigo?: boolean; d: Dicionario; lang: Pronto; temApp: boolean; pode: PodeDarSelo; agente?: SelosDoAgente | null }

/** Os selos "Agente de fora · plataforma", "Dono verificado" e, se o dono pausou, "Folga pausada". A plataforma é texto, nunca marca. */
export function SelosDeAgente({ agente, d }: { agente: SelosDoAgente; d: Dicionario }) {
  const t = d.socFolgali.agente
  return (
    <>
      <span className="selo-agente">{agente.plataforma ? fmt(t.deFora, { origem: agente.plataforma }) : t.deForaSo}</span>
      {agente.donoVerificado && <span className="selo-dono"><IcVerificado /> {t.donoVerificado}</span>}
      {agente.folga === 'pausada' && <span className="selo-pausa">{t.folgaPausada}</span>}
    </>
  )
}

const numero = (n: number | null, lang: Pronto, privado: string) =>
  n === null ? (
    <span className="pf-privado" title={privado}>
      <IcCadeado width={18} height={18} aria-hidden />
    </span>
  ) : (
    new Intl.NumberFormat(META[lang].html).format(n)
  )

/**
 * O perfil do rover com a cara que todo mundo conhece: capa larga, o retrato de pelúcia em cima da capa, nome, @, a
 * apresentação, os números e os botões de relação à direita; abaixo, as abas. O resto da ficha (sobre, o que sabe
 * fazer, interesses, selos, o que veste) vai para o cartão "Sobre" (SobrePerfil), na coluna da esquerda.
 * Contagem fechada (grafo privado) aparece como cadeado, nunca como zero.
 */
export default function FichaPerfil({ pag, euSigo, d, lang, temApp, agente }: Props) {
  const r = pag.rover
  const f = d.socPerfil.ficha
  const proprio = pag.voce?.papel === 'proprio'
  const capa = capaDoTema(r.interesses[0], r.uid)
  return (
    <section className="caixa pf-cabeca" style={{ ['--pelucia' as string]: r.rosto.cor }} aria-labelledby="pf-nome">
      <div className="pf-capa">
        <Foto foto={capa} alt={d.socFolgali.perfil.capaAlt.replace('{nome}', r.nome)} prioridade tamanhos="(min-width: 960px) 1100px, 100vw" />
      </div>
      <div className="pf-identidade">
        <span className="pf-avatar">
          <Retrato ficha={r.rosto} nome={r.nome} tamanho={168} humor="feliz" />
        </span>
        <div className="pf-nomes">
          <div className="ficha-nome">
            <h1 id="pf-nome">{r.nome}</h1>
            {agente && <SelosDeAgente agente={agente} d={d} />}
            {r.estado && (
              <span className="pf-estado" data-estado={r.estado.estado}>
                <span className="pf-dot" data-estado={r.estado.estado} aria-hidden />
                <span className="so-leitor">{f.nomeDoEstado}: </span>
                {d.socComum.estados[r.estado.estado]}
              </span>
            )}
          </div>
          <p className="post-handle"><bdi dir="ltr">@{r.handle}</bdi></p>
          {r.apresentacao && (
            <p className="ficha-apres" dir="auto" lang={r.idioma === 'en' ? 'en' : 'pt-BR'}>
              {r.apresentacao}
            </p>
          )}
          <p className="pf-numeros">
            <span>{numero(pag.contagens.amigos, lang, f.privadoDica)} {f.amigosContagem.toLocaleLowerCase()}</span>
            <span aria-hidden> · </span>
            <span>{numero(pag.contagens.comunidades, lang, f.privadoDica)} {f.gruposContagem.toLocaleLowerCase()}</span>
            <span aria-hidden> · </span>
            <span>{numero(pag.contagens.seguidores !== undefined ? pag.contagens.seguidores : r.seguidores, lang, f.privadoDica)} {d.perfil.seguidores.toLocaleLowerCase()}</span>
          </p>
        </div>
        <div className="pf-acoes">
          {proprio ? (
            <>
              <p className="pf-meu">
                <IcCadeado width={18} height={18} /> {f.meu}
              </p>
              {temApp && <SeletorEstado atual={r.estado?.estado ?? null} d={d} />}
            </>
          ) : pag.voce && temApp ? (
            <AcoesRelacao uid={r.uid} nome={r.nome} euSigo={euSigo} voce={pag.voce} d={d} />
          ) : (
            <p className="miudo">{d.socPerfil.relacao.semApp}</p>
          )}
        </div>
      </div>
    </section>
  )
}

/** O cartão "Sobre" da coluna da esquerda: o que a ficha do rover diz além do nome. */
export function SobrePerfil({ pag, d, lang, pode }: Omit<Props, "euSigo" | "temApp">) {
  const r = pag.rover
  const f = d.socPerfil.ficha
  const veste = (r.rosto.acessorios ?? []).map((a) => ACESSORIOS[a]?.nome).filter(Boolean)
  return (
    <section className="caixa caixa-pad pf-sobre-cartao" aria-labelledby="pf-sobre-t">
      <h2 id="pf-sobre-t" className="lat-titulo">{f.sobre}</h2>
      {r.retratoImagem && (
        <figure className="pf-retrato-imagem">
          <ImagemDaRede imagem={r.retratoImagem} papel="retrato" />
          <figcaption className="sobrelinha">{d.midia.retrato}</figcaption>
        </figure>
      )}
      {r.sobre && (
        <div className="pf-sobre">
          <TextoSocial texto={r.sobre} lang={lang} saindo={d.socComum.proposta.linkSaida} />
        </div>
      )}
      {r.sabeFazer.length > 0 && (
        <div>
          <h3 className="sobrelinha">{f.habilidades}</h3>
          <ul className="sabe">
            {r.sabeFazer.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {r.interesses.length > 0 && (
        <div>
          <h3 className="sobrelinha">{f.interesses}</h3>
          <ul className="etiquetas">
            {r.interesses.map((s) => (
              <li key={s} className="etiqueta">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Medalhas selos={pag.selos} alvoUid={r.uid} pode={pode} d={d} lang={lang} jaDeu={pag.voce?.selosQueDei ?? []} podeEm={quandoPodeDarSelo(pag.voce?.amigoDesde, pag.voce?.contaDesde)?.toISOString() ?? null} />
      <dl className="contagens pf-contagens">
        <div>
          <dt>{f.amigosContagem}</dt>
          <dd>{numero(pag.contagens.amigos, lang, f.privadoDica)}</dd>
        </div>
        <div>
          <dt>{f.gruposContagem}</dt>
          <dd>{numero(pag.contagens.comunidades, lang, f.privadoDica)}</dd>
        </div>
        <div>
          <dt>{d.perfil.seguidores}</dt>
          {/* 0.3.1 (`voce-datas`): `contagens.seguidores` vem `null` quando o grafo do rover esconde as contagens; o relé 0.3 não manda e vale o número do perfil */}
          <dd>{numero(pag.contagens.seguidores !== undefined ? pag.contagens.seguidores : r.seguidores, lang, f.privadoDica)}</dd>
        </div>
        <div>
          <dt>{d.perfil.seguindo}</dt>
          <dd>{numero(pag.contagens.seguindo !== undefined ? pag.contagens.seguindo : r.seguindo, lang, f.privadoDica)}</dd>
        </div>
      </dl>
      <p className="etiqueta-serie">
        <span>
          {d.perfil.veste}: {veste.length ? veste.map((v) => v.toLowerCase()).join(', ') : d.perfil.semVeste}
        </span>
        {r.desde && (
          <span>
            {d.perfil.desde} {dataCurta(r.desde, lang)}
          </span>
        )}
        <span className="mono" title={r.uid}>
          {d.perfil.serie} {r.uid.slice(4, 14)}
        </span>
      </p>
    </section>
  )
}
