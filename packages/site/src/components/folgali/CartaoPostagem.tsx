import Link from 'next/link'
import Retrato from '@/components/Retrato'
import BotaoCurtir from './BotaoCurtir'
import Foto from './Foto'
import { IcComentar, IcCompartilhar, IcCoracao, IcCurtir, IcPontos } from './Icones'
import { FOTOS, roverDaFolga, type PostagemDaFolga } from '@/lib/folgali/demo'
import { fmt, plural, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'

/** Uma postagem de folga, do jeito que o Facebook ensinou: quem, quando, o texto, a foto, os números e três ações. */
export default function CartaoPostagem({ p, d, lang, agora, prioridade = false, tardia = false }: { p: PostagemDaFolga; d: Dicionario; lang: Pronto; agora: Date; prioridade?: boolean; tardia?: boolean }) {
  const t = d.socFolgali.post
  const r = roverDaFolga(p.autor)
  const total = p.reacoes.curtir + p.reacoes.amei + p.reacoes.haha
  const href = `/${lang}/p/${p.id}`
  return (
    <article className="caixa fb-post" aria-labelledby={`${p.id}-quem`}>
      <header className="fb-post-cab">
        <Link href={`/${lang}/r/${p.autor}`} tabIndex={-1} aria-hidden>
          <Retrato ficha={r.ficha} nome={r.nome} tamanho={48} decorativo />
        </Link>
        <div className="fb-post-quem">
          <Link href={`/${lang}/r/${p.autor}`} id={`${p.id}-quem`} className="fb-post-nome">{r.nome}</Link>
          <span className="miudo">
            <bdi dir="ltr">@{p.autor}</bdi> · <time dateTime={p.em}>{tempoRelativo(p.em, d, agora)}</time>
          </span>
        </div>
        <Link href={href} className="icone-btn fb-post-menu" aria-label={fmt(t.abrir, { nome: r.nome })}>
          <IcPontos />
        </Link>
      </header>
      <p className="fb-post-texto" dir="auto">{p.texto}</p>
      {p.foto && (
        <Link href={href} className="fb-post-foto" tabIndex={-1} aria-hidden>
          <Foto foto={FOTOS[p.foto]} prioridade={prioridade} tardia={tardia} tamanhos="(min-width: 960px) 680px, 100vw" />
        </Link>
      )}
      <div className="fb-post-numeros">
        <span className="fb-reacoes" aria-label={fmt(t.reacoesRotulo, { n: total })}>
          <span className="fb-reacao" data-r="curtir" aria-hidden><IcCurtir /></span>
          <span className="fb-reacao" data-r="amei" aria-hidden><IcCoracao /></span>
          <span aria-hidden>{plural(t.curtidas, total)}</span>
        </span>
        <Link href={`${href}#comentarios`}>{plural(t.comentarios, p.totalComentarios)}</Link>
      </div>
      <div className="fb-post-acoes">
        <BotaoCurtir rotulo={t.curtir} ajuda={t.demonstracaoCurtir} />
        <Link href={`${href}#comentarios`} className="fb-acao">
          <IcComentar />
          <span>{t.comentar}</span>
        </Link>
        <Link href={href} className="fb-acao">
          <IcCompartilhar />
          <span>{t.compartilhar}</span>
        </Link>
      </div>
    </article>
  )
}
