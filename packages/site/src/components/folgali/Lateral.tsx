import Link from 'next/link'
import Retrato from '@/components/Retrato'
import Foto from './Foto'
import { FOTOS, ROVERS_ONLINE, capaDoTema, eventos, roverDaFolga } from '@/lib/folgali/demo'
import { horaDoEvento, seloDoDia } from '@/lib/folgali/datas'
import { fmt, plural, type Dicionario, type Pronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'

/**
 * A coluna da direita, como a do Facebook: quem está online, os eventos da semana e as comunidades em alta. Rovers
 * online e eventos são da demonstração (o protocolo ainda não tem presença nem evento); as comunidades vêm do relé.
 */
export default async function Lateral({ lang, d, demonstracao }: { lang: Pronto; d: Dicionario; demonstracao: boolean }) {
  const t = d.socFolgali.lateral
  const { cliente } = obterRede()
  const alta = await carregar(() => cliente.emAlta('comunidades', '24h'))
  const agora = new Date()
  const evs = demonstracao ? eventos(agora).slice(0, 2) : []
  return (
    <>
      {demonstracao && (
        <section className="caixa lat-bloco" aria-labelledby="lat-online">
          <h2 id="lat-online" className="lat-titulo">{t.online}</h2>
          <ul className="lat-online">
            {ROVERS_ONLINE.slice(0, 4).map((h) => {
              const r = roverDaFolga(h)
              return (
                <li key={h}>
                  <Link href={`/${lang}/r/${h}`} className="lat-linha">
                    <span className="com-ponto">
                      <Retrato ficha={r.ficha} nome={r.nome} tamanho={44} decorativo />
                      <span className="ponto-online" aria-hidden />
                    </span>
                    <span className="lat-nome">{r.nome}</span>
                    <span className="so-leitor">{fmt(t.estaOnline, { nome: r.nome })}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {evs.length > 0 && (
        <section className="caixa lat-bloco" aria-labelledby="lat-eventos">
          <div className="lat-cab">
            <h2 id="lat-eventos" className="lat-titulo">{t.eventos}</h2>
            <Link href={`/${lang}/eventos`} className="lat-ver">{t.verTodos}</Link>
          </div>
          <ul className="lat-midia">
            {evs.map((e) => (
              <li key={e.id}>
                <Link href={`/${lang}/eventos/${e.id}`} className="lat-midia-item">
                  <Foto foto={FOTOS[e.foto]} alt="" className="lat-foto" />
                  <span>
                    <strong>{e.titulo}</strong>
                    <span className="miudo">{seloDoDia(e.em, lang)} · {horaDoEvento(e.em, lang)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {alta.ok && alta.valor.length > 0 && (
        <section className="caixa lat-bloco" aria-labelledby="lat-com">
          <div className="lat-cab">
            <h2 id="lat-com" className="lat-titulo">{t.comunidades}</h2>
            <Link href={`/${lang}/comunidades`} className="lat-ver">{t.verTodos}</Link>
          </div>
          <ul className="lat-midia">
            {alta.valor.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link href={`/${lang}/comunidades/${c.id}`} className="lat-midia-item">
                  <Foto foto={capaDoTema(c.tema, c.id)} alt="" className="lat-foto" />
                  <span>
                    <strong>{c.nome}</strong>
                    <span className="miudo">{plural(t.membros, c.membros)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
