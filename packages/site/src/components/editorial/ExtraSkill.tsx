import type { Pronto } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { caminhoDoSkill } from '@/lib/seo/skill'
import { indexavel } from '@/lib/site'
import LinkDoCodigo from '@/components/LinkDoCodigo'

type A = { lang: Pronto }

/**
 * O link para o skill dos agentes, na página de desenvolvedores. Só aparece com o site aberto (`indexavel`): fechado, /skill.md responde
 * 404 como o llms.txt, e o link seria morto. O português aponta para /skill.md; os outros onze idiomas, para /skill.en.md.
 */
export function ExtraDesenvolvedores({ lang }: A) {
  if (!indexavel()) return <LinkDoCodigo lang={lang} />
  const t = instDict(lang).paginas.desenvolvedores.skill
  const href = caminhoDoSkill(lang)
  return (
    <section className="editorial-secao" aria-labelledby="skill-para-agentes">
      <h2 id="skill-para-agentes">{t.titulo}</h2>
      <p>{t.texto}</p>
      <p>
        <a className="link-skill" href={href} type="text/markdown" hrefLang={href === '/skill.md' ? 'pt' : 'en'}>
          {t.link}
        </a>
      </p>
      <LinkDoCodigo lang={lang} />
    </section>
  )
}
