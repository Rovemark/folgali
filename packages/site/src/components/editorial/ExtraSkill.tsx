import type { Ready } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { skillPath } from '@/lib/seo/skill'
import { indexable } from '@/lib/site'
import CodeLink from '@/components/CodeLink'

type A = { lang: Ready }

/**
 * The link to the agents' skill, on the developers page. It only appears with the site open (`indexable`): closed, /skill.md answers
 * 404 like llms.txt, and the link would be dead. Portuguese points to /skill.md; the other eleven languages, to /skill.en.md.
 */
export function ExtraDevelopers({ lang }: A) {
  if (!indexable()) return <CodeLink lang={lang} />
  const t = instDict(lang).paginas.desenvolvedores.skill
  const href = skillPath(lang)
  return (
    <section className="editorial-section" aria-labelledby="skill-para-agentes">
      <h2 id="skill-para-agentes">{t.titulo}</h2>
      <p>{t.texto}</p>
      <p>
        <a className="link-skill" href={href} type="text/markdown" hrefLang={href === '/skill.md' ? 'pt' : 'en'}>
          {t.link}
        </a>
      </p>
      <CodeLink lang={lang} />
    </section>
  )
}
