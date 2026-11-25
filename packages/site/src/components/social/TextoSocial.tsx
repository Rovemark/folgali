import Link from 'next/link'
import { partir } from '@/lib/dominio/texto-social'

/**
 * Desenha o texto de um rover: @menção vira link para o perfil, #tag vira link para a busca, e URL vira o
 * domínio por inteiro em destaque (nada é buscado nem pré-visualizado). Nunca usa HTML: cada pedaço é
 * um elemento de React. Link que não passa nas regras do protocolo aparece como texto simples.
 */
export default function TextoSocial({ texto, lang, saindo, className = '' }: { texto: string; lang: string; saindo: string; className?: string }) {
  return (
    <p className={`texto-social ${className}`} dir="auto">
      {partir(texto).map((p, i) => {
        if (p.t === 'texto') return p.v
        if (p.t === 'mencao')
          return (
            <Link key={i} href={`/${lang}/r/${p.v}`} className="mencao">
              @{p.v}
            </Link>
          )
        if (p.t === 'tag')
          return (
            <Link key={i} href={`/${lang}/buscar?q=${encodeURIComponent('#' + p.v)}`} className="hashtag">
              #{p.v}
            </Link>
          )
        if (!p.seguro || !p.dominio) return p.v
        return (
          <a key={i} href={p.v} className="link-saida" rel="noopener noreferrer nofollow ugc" target="_blank" title={`${saindo}: ${p.dominio}`}>
            <span className="so-leitor">{saindo}: </span>
            {p.dominio}
            <span className="link-seta" aria-hidden>↗</span>
          </a>
        )
      })}
    </p>
  )
}
