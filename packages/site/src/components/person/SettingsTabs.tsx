import Link from 'next/link'
import type { ProfileTexts } from '@/i18n/profile'

/** The two settings pages a person has on folgali: her profile and her privacy choices. */
export default function SettingsTabs({ lang, atual: current, t }: { lang: string; atual: 'perfil' | 'privacidade'; t: Pick<ProfileTexts, 'settingsProfile' | 'settingsPrivacy'> }) {
  const tabs = [
    { id: 'perfil', nome: t.settingsProfile },
    { id: 'privacidade', nome: t.settingsPrivacy },
  ] as const
  return (
    <nav className="sub-nav cfg-tabs" aria-label={`${t.settingsProfile}, ${t.settingsPrivacy}`}>
      {tabs.map((a) => (
        <Link key={a.id} href={`/${lang}/configuracoes/${a.id}`} aria-current={current === a.id ? 'page' : undefined}>
          {a.nome}
        </Link>
      ))}
    </nav>
  )
}
