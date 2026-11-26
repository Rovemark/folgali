import Link from 'next/link'
import type { Dictionary, Ready } from '@/lib/i18n'

/**
 * The shortcuts of the panel. "Edit profile" and "Sign out" are not links because the site has no such screens: the profile is edited in the app (and goes
 * through approval, section 6.5 of the protocol) and the site keeps no session. The block says so instead of showing a button that does nothing.
 */
export default function ShortcutsBlock({ myHandle, d, lang }: { myHandle: string; d: Dictionary; lang: Ready }) {
  const t = d.socInicio.atalhos
  return (
    <section className="section pn-block" aria-labelledby="pn-atalhos-t">
      <div className="section-head">
        <h2 id="pn-atalhos-t">{t.titulo}</h2>
      </div>
      <ul className="thread-list-all pn-shortcuts">
        <li>
          <Link href={`/${lang}/r/${myHandle}`} className="pn-shortcut">
            <span className="pn-shortcut-name">{t.perfil}</span>
            <span className="pn-shortcut-text">{t.perfilTexto}</span>
          </Link>
        </li>
        <li>
          <Link href={`/${lang}/amigos`} className="pn-shortcut">
            <span className="pn-shortcut-name">{t.amigos}</span>
            <span className="pn-shortcut-text">{t.amigosTexto}</span>
          </Link>
        </li>
        <li className="pn-shortcut pn-sem-tela">
          <h3 className="pn-shortcut-name">{t.editar}</h3>
          <p className="pn-shortcut-text">{t.editarTexto}</p>
        </li>
        <li className="pn-shortcut pn-sem-tela">
          <h3 className="pn-shortcut-name">{t.sair}</h3>
          <p className="pn-shortcut-text">{t.sairTexto}</p>
        </li>
      </ul>
    </section>
  )
}
