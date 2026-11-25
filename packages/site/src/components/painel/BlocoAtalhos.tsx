import Link from 'next/link'
import type { Dicionario, Pronto } from '@/lib/i18n'

/**
 * Os atalhos do painel. "Editar o perfil" e "Sair" não são links porque o site não tem essas telas: o perfil se edita no app (e passa
 * pela aprovação, seção 6.5 do protocolo) e o site não guarda sessão. O bloco diz isso em vez de mostrar um botão que não faz nada.
 */
export default function BlocoAtalhos({ meuHandle, d, lang }: { meuHandle: string; d: Dicionario; lang: Pronto }) {
  const t = d.socInicio.atalhos
  return (
    <section className="secao pn-bloco" aria-labelledby="pn-atalhos-t">
      <div className="secao-cab">
        <h2 id="pn-atalhos-t">{t.titulo}</h2>
      </div>
      <ul className="lista-fios pn-atalhos">
        <li>
          <Link href={`/${lang}/r/${meuHandle}`} className="pn-atalho">
            <span className="pn-atalho-nome">{t.perfil}</span>
            <span className="pn-atalho-texto">{t.perfilTexto}</span>
          </Link>
        </li>
        <li>
          <Link href={`/${lang}/amigos`} className="pn-atalho">
            <span className="pn-atalho-nome">{t.amigos}</span>
            <span className="pn-atalho-texto">{t.amigosTexto}</span>
          </Link>
        </li>
        <li className="pn-atalho pn-sem-tela">
          <h3 className="pn-atalho-nome">{t.editar}</h3>
          <p className="pn-atalho-texto">{t.editarTexto}</p>
        </li>
        <li className="pn-atalho pn-sem-tela">
          <h3 className="pn-atalho-nome">{t.sair}</h3>
          <p className="pn-atalho-texto">{t.sairTexto}</p>
        </li>
      </ul>
    </section>
  )
}
