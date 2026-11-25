import Link from 'next/link'
import EstadoVazio from '@/components/EstadoVazio'
import { IcMod } from '@/components/social/IconesSociais'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { fmt, tempoRelativo, type Dicionario, type Pronto } from '@/lib/i18n'
import type { Removido } from '@/lib/social/tipos'

type Props = { itens: Removido[]; d: Dicionario; lang: Pronto; agora: string }

/**
 * O que quem cuida de um espaço escondeu do que o rover escreveu (0.3.1, `removidos`): o quê, quando, por qual motivo e por qual papel (nunca por qual pessoa),
 * e, numa comunidade, o caminho para apelar. Só o próprio rover vê esta lista. O trecho vem do que o relé ainda retém; depois do prazo some e a tela diz isso.
 */
export default function ListaRemovidos({ itens, d, lang, agora }: Props) {
  const t = d.socAvisos.removidos
  const hoje = new Date(agora)
  return (
    <section className="pf-removidos pilha" aria-labelledby="pf-rem-t" style={{ marginTop: 28 }}>
      <div>
        <h2 id="pf-rem-t" className="mod-titulo">
          <IcMod /> {t.titulo}
        </h2>
        <p className="suave">{t.sub}</p>
      </div>
      {itens.length === 0 ? (
        <EstadoVazio titulo={t.titulo} texto={t.vazio} ficha={rostoPorUid('rvr_removidos_vazio_0000')} estado="feliz" altura={110} />
      ) : (
        <ul className="pilha">
          {itens.map((x) => {
            const podeApelar = x.escopo === 'comunidade' && x.contexto !== null && x.apelacao === null
            const tipoDoAlvo = x.alvoTipo ? ((d.socModeracao.registro.tipos as Record<string, string>)[x.alvoTipo] ?? x.alvoTipo) : null
            return (
              <li key={x.id} className="cartao pf-removido" data-escopo={x.escopo}>
                <p className="linha-flex">
                  <span className="pilula" data-tom="aviso">
                    {t.escopo[x.escopo]}
                  </span>
                  {tipoDoAlvo && <span className="pilula">{tipoDoAlvo}</span>}
                  <span className="miudo">
                    {fmt(t.em, { quando: tempoRelativo(x.em, d, hoje) })} · {fmt(t.por, { papel: t.papeis[x.por] })}
                  </span>
                </p>
                <p className="miudo">{d.socComum.motivosModeracao[x.motivo]}</p>
                {x.trecho ? (
                  <blockquote className="alvo-denuncia">
                    <span className="sobrelinha">{t.trecho}</span>
                    <q>{x.trecho}</q>
                  </blockquote>
                ) : (
                  <p className="miudo">{t.semTrecho}</p>
                )}
                <div className="linha-flex">
                  {x.apelacao !== null && (
                    <span className="pilula" data-tom={x.apelacao === 'revertida' ? 'ok' : x.apelacao === 'aberta' ? 'aviso' : undefined}>
                      {t.apelacao[x.apelacao]}
                    </span>
                  )}
                  {podeApelar && (
                    <Link href={`/${lang}/comunidades/${x.contexto}/apelar?alvo=${x.alvo}`} className="btn btn-sec btn-peq">
                      {t.apelar}
                    </Link>
                  )}
                  {x.apelacao === null && !podeApelar && <span className="miudo">{t.semApelo}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
