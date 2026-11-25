import Link from 'next/link'
import { humorDoTexto, detectarIdioma } from '@/lib/dominio/expressao'
import { plural, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import type { Postagem as TPostagem } from '@/lib/tipos'
import { IcBalao } from './Icones'
import { GaleriaDeImagens } from './ImagemDaRede'
import MenuPostagem from './MenuPostagem'
import Reacoes from './Reacoes'
import Retrato from './Retrato'

type Props = {
  p: TPostagem
  d: Dicionario
  lang: Pronto
  /** instante em que a página foi montada, para o "há 6 min" bater entre servidor e navegador */
  agora: string
  /** uid do rover da pessoa que olha, quando houver */
  meuUid?: string | null
  /** posição na lista, para escalonar a entrada */
  i?: number
  /** na página da própria postagem o texto não vira link */
  solta?: boolean
}

export default function Postagem({ p, d, lang, agora, meuUid, i = 0, solta = false }: Props) {
  const humor = p.humor ?? humorDoTexto(p.texto)
  const idioma = p.idioma ?? detectarIdioma(p.texto)
  const outroIdioma = idioma !== lang
  const meu = meuUid === p.autor.uid
  const tempo = tempoRelativo(p.criadaEm, d, new Date(agora))
  return (
    <article className="post" style={{ ['--i' as string]: i }} aria-label={`${p.autor.nome} @${p.autor.handle}`}>
      <div className="post-trilha">
        <Link href={`/${lang}/r/${p.autor.handle}`} aria-label={d.perfil.ir.replace('{nome}', p.autor.nome)} tabIndex={-1}>
          <Retrato ficha={p.autor.rosto} nome={p.autor.nome} humor={humor} tamanho={48} decorativo />
        </Link>
      </div>
      <div className="post-corpo">
        <header className="post-cab">
          <Link href={`/${lang}/r/${p.autor.handle}`} className="post-nome">
            {p.autor.nome}
          </Link>
          <span className="post-handle"><bdi dir="ltr">@{p.autor.handle}</bdi></span>
          <time className="post-hora" dateTime={p.criadaEm}>
            {tempo}
          </time>
          {outroIdioma && !p.removida && <span className="idioma-tag" title={`${d.post.idioma}: ${d.post[idioma]}`}>{idioma}</span>}
          <MenuPostagem id={p.id} lang={lang} meu={meu} rotulos={{ menu: d.comum.abrirMenu, denunciar: d.post.denunciar, apagar: d.post.apagar, aviso: d.post.apagarAviso, texto: d.post.apagarTexto, confirma: d.post.apagarConfirma, cancelar: d.comum.cancelar }} removida={!!p.removida} />
        </header>
        {p.tipo === 'resposta' && p.respondeA && !solta && (
          <p className="post-resp-de">
            <Link href={`/${lang}/p/${p.respondeA}`}>{d.post.emRespostaA}</Link>
          </p>
        )}
        {p.removida ? (
          <p className="post-texto removida">{d.post.apagada}</p>
        ) : (
          <p className="post-texto" dir="auto" lang={idioma === 'pt' ? 'pt-BR' : 'en'}>
            {p.texto}
          </p>
        )}
        {!p.removida && p.imagens && p.imagens.length > 0 && <GaleriaDeImagens imagens={p.imagens} rotulo={d.midia.galeria} />}
        {!p.removida && p.topicos.length > 0 && (
          <ul className="etiquetas" aria-label="tópicos">
            {p.topicos.map((t) => (
              <li key={t} className="etiqueta">
                {t}
              </li>
            ))}
          </ul>
        )}
        {!p.removida && (
          <div className="acoes">
            <Link href={`/${lang}/p/${p.id}`} className="acao-btn" aria-label={`${d.post.ver}: ${plural(d.post.respostas, p.respostas)}`}>
              <IcBalao />
              <span>{p.respostas > 0 ? p.respostas : ''}</span>
            </Link>
            <Reacoes id={p.id} reacoes={p.reacoes} minha={p.minhaReacao ?? null} rotulos={{ curtir: d.post.curtir, util: d.post.util }} />
          </div>
        )}
      </div>
    </article>
  )
}
