import Link from 'next/link'
import Retrato from '@/components/Retrato'
import TextoSocial from '@/components/social/TextoSocial'
import { IcResolvido } from '@/components/social/IconesSociais'
import { plural, tempoRelativo, type Dicionario } from '@/lib/i18n'
import type { RespostaForum } from '@/lib/social/tipos'
import RespostaAcoes, { type PermissoesDaResposta } from './RespostaAcoes'

export type ContextoDoFio = {
  topico: string
  resolvidaId: string | null
  autorDoTopico: string
  meuUid: string | null
  nomeDoRover?: string
  podeEscrever: boolean
  /** permissões que não dependem da resposta */
  responder: boolean
  responderMotivo?: string
  resolver: boolean
  equipe: boolean
  euModerador: boolean
  donoUid: string
}

function permissoes(r: RespostaForum, c: ContextoDoFio): PermissoesDaResposta {
  const minha = c.meuUid !== null && r.autor.uid === c.meuUid
  return {
    responder: c.responder,
    responderMotivo: c.responderMotivo,
    resolver: c.resolver && !r.removida,
    removerAlheio: c.equipe && !minha && !(c.euModerador && r.autor.uid === c.donoUid),
    minha,
  }
}

/** Uma resposta: retrato preso ao fio, texto, citação em bloco e as ações. */
export function Resposta({ r, mae, c, d, lang, agora, filha = false }: { r: RespostaForum; mae: string; c: ContextoDoFio; d: Dicionario; lang: string; agora: string; filha?: boolean }) {
  const t = d.socForum.respostas
  const resolveu = c.resolvidaId === r.id
  return (
    <article id={`r-${r.id.slice(-12)}`} className={`resposta${filha ? ' filha' : ''}${resolveu ? ' resolveu' : ''}`} aria-label={`${r.autor.nome}`}>
      <div className="resposta-trilha">
        <Link href={`/${lang}/r/${r.autor.handle}`} tabIndex={-1} aria-hidden>
          <Retrato ficha={r.autor.rosto} nome={r.autor.nome} tamanho={filha ? 36 : 44} decorativo />
        </Link>
      </div>
      <div className="resposta-corpo">
        <header className="post-cab">
          <Link href={`/${lang}/r/${r.autor.handle}`} className="post-nome">
            {r.autor.nome}
          </Link>
          <span className="post-handle"><bdi dir="ltr">@{r.autor.handle}</bdi></span>
          {r.autor.uid === c.autorDoTopico && <span className="pilula">{d.socForum.respostas.autorDoTopico}</span>}
          <time className="post-hora" dateTime={r.criadoEm}>
            {tempoRelativo(r.criadoEm, d, new Date(agora))}
          </time>
          {resolveu && (
            <span className="pilula" data-tom="ok">
              <IcResolvido /> {t.resolveu}
            </span>
          )}
        </header>
        {r.cita && (
          <blockquote className="citacao">
            <span className="sobrelinha">{t.citando.replace('{nome}', r.cita.autor.nome)}</span>
            {r.cita.trecho ? <q>{r.cita.trecho}</q> : <span className="removida">{t.citacaoRemovida}</span>}
          </blockquote>
        )}
        {r.removida ? <p className="post-texto removida">{t.removida}</p> : <TextoSocial texto={r.texto} lang={lang} saindo={d.socComum.proposta.linkSaida} className="post-texto" />}
        {!r.removida && (
          <RespostaAcoes
            r={r}
            topico={c.topico}
            maeId={mae}
            resolvidaId={c.resolvidaId}
            perm={permissoes(r, c)}
            d={d}
            lang={lang}
            nomeDoRover={c.nomeDoRover}
            podeEscrever={c.podeEscrever}
          />
        )}
      </div>
    </article>
  )
}

/** O fio inteiro: respostas de primeiro nível, cada uma com as filhas recolhidas em "ver N respostas". */
export default function Fio({ respostas, filhas, c, d, lang, agora }: { respostas: RespostaForum[]; filhas: Record<string, RespostaForum[]>; c: ContextoDoFio; d: Dicionario; lang: string; agora: string }) {
  const t = d.socForum.respostas
  return (
    <ol className="fio-forum" aria-label={plural(t.titulo, respostas.length)}>
      {respostas.map((r) => {
        const fs = filhas[r.id] ?? []
        const temResolveu = c.resolvidaId !== null && fs.some((f) => f.id === c.resolvidaId)
        return (
          <li key={r.id} className="fio-item">
            <Resposta r={r} mae={r.id} c={c} d={d} lang={lang} agora={agora} />
            {fs.length > 0 && (
              <details className="filhas" open={temResolveu || fs.length <= 2}>
                <summary>
                  <span className="mais">{plural(t.verFilhas, fs.length)}</span>
                  <span className="menos">{t.esconderFilhas}</span>
                </summary>
                <div className="filhas-lista">
                  {fs.map((f) => (
                    <Resposta key={f.id} r={f} mae={r.id} c={c} d={d} lang={lang} agora={agora} filha />
                  ))}
                </div>
              </details>
            )}
          </li>
        )
      })}
    </ol>
  )
}
