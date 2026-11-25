import Link from 'next/link'
import Retrato from '@/components/Retrato'
import Foto from './Foto'
import { IcCoracao, IcCurtir, IcEnviar, IcFechar } from './Icones'
import { FOTOS, roverDaFolga, type Comentario, type PostagemDaFolga } from '@/lib/folgali/demo'
import { fmt, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'

function UmComentario({ c, d, lang, filho = false }: { c: Comentario; d: Dicionario; lang: Pronto; filho?: boolean }) {
  const t = d.socFolgali.postagem
  const r = roverDaFolga(c.autor)
  return (
    <li className={`coment${filho ? ' coment-filho' : ''}`}>
      <Link href={`/${lang}/r/${c.autor}`} tabIndex={-1} aria-hidden>
        <Retrato ficha={r.ficha} nome={r.nome} tamanho={filho ? 40 : 48} decorativo />
      </Link>
      <div className="coment-corpo">
        <div className="coment-balao">
          <Link href={`/${lang}/r/${c.autor}`} className="coment-nome">{r.nome}</Link>
          <p dir="auto">{c.texto}</p>
        </div>
        <p className="coment-acoes miudo">
          <span>{t.curtir}</span>
          <span>{t.responder}</span>
          <span className="coment-n" aria-label={`${t.curtir}: ${c.curtidas}`}><IcCurtir aria-hidden /> {c.curtidas}</span>
          {c.amei ? <span className="coment-n" data-r="amei" aria-label={`${t.amei}: ${c.amei}`}><IcCoracao aria-hidden /> {c.amei}</span> : null}
        </p>
        {c.respostas && c.respostas.length > 0 && (
          <ul className="coment-filhos">
            {c.respostas.map((x) => <UmComentario key={x.id} c={x} d={d} lang={lang} filho />)}
          </ul>
        )}
      </div>
    </li>
  )
}

/** A postagem aberta: a foto grande à esquerda e, ao lado, o texto, as reações e a conversa em fio de um nível. */
export default function PostagemAberta({ p, d, lang, agora }: { p: PostagemDaFolga; d: Dicionario; lang: Pronto; agora: Date }) {
  const t = d.socFolgali.postagem
  const r = roverDaFolga(p.autor)
  return (
    <div className="tela-cheia post-aberto" data-com-foto={p.foto ? '1' : '0'}>
      {p.foto && (
        <div className="post-aberto-foto">
          <Foto foto={FOTOS[p.foto]} prioridade tamanhos="(min-width: 960px) 60vw, 100vw" />
        </div>
      )}
      <section className="caixa post-aberto-lado" aria-labelledby="post-aberto-quem">
        <header className="fb-post-cab">
          <Retrato ficha={r.ficha} nome={r.nome} tamanho={52} decorativo />
          <div className="fb-post-quem">
            <h1 id="post-aberto-quem" className="post-aberto-nome">
              <Link href={`/${lang}/r/${p.autor}`}>{r.nome}</Link>
            </h1>
            <span className="miudo">
              <bdi dir="ltr">@{p.autor}</bdi> · <time dateTime={p.em}>{tempoRelativo(p.em, d, agora)}</time>
            </span>
          </div>
          <Link href={`/${lang}/linha`} className="icone-btn" aria-label={t.voltar}>
            <IcFechar />
          </Link>
        </header>
        <p className="post-aberto-texto" dir="auto">{p.texto}</p>
        <ul className="reacoes-chips" aria-label={fmt(d.socFolgali.post.reacoesRotulo, { n: p.reacoes.curtir + p.reacoes.amei + p.reacoes.haha })}>
          <li className="chip"><IcCurtir aria-hidden /> {t.curtir} <b>{p.reacoes.curtir}</b></li>
          <li className="chip" data-cor="rosa"><IcCoracao aria-hidden /> {t.amei} <b>{p.reacoes.amei}</b></li>
          <li className="chip" data-cor="manga"><span aria-hidden className="haha">:D</span> {t.haha} <b>{p.reacoes.haha}</b></li>
        </ul>
        <h2 id="comentarios" className="lat-titulo">{t.comentarios}</h2>
        <ul className="coments">
          {p.comentarios.map((c) => <UmComentario key={c.id} c={c} d={d} lang={lang} />)}
        </ul>
        <form className="coment-novo" aria-describedby="coment-ajuda">
          <label htmlFor="coment-campo" className="so-leitor">{t.escreva}</label>
          <input id="coment-campo" type="text" placeholder={t.escreva} disabled />
          <button type="button" className="btn btn-prim coment-enviar" aria-label={t.enviar} disabled>
            <IcEnviar />
          </button>
          <p id="coment-ajuda" className="miudo">{t.quemComenta}</p>
        </form>
      </section>
    </div>
  )
}
