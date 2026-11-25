import Link from 'next/link'
import { plural, tempoRelativo, type Dicionario } from '@/lib/i18n'
import type { ComunidadeCartao, PapelNaComunidade } from '@/lib/social/tipos'
import { matizDe } from '@/lib/social/matiz'
import Foto from '@/components/folgali/Foto'
import { capaDoTema } from '@/lib/folgali/demo'

export function PilulaAcesso({ acesso, d }: { acesso: ComunidadeCartao['acesso']; d: Dicionario }) {
  return (
    <span className="pilula" data-tom={acesso === 'aberta' ? 'ok' : acesso === 'moderada' ? 'aviso' : 'acao'}>
      {d.socComum.acessos[acesso].nome}
    </span>
  )
}

/** O remendo de uma comunidade na lista: o cartão todo é um link. */
export default function CartaoComunidade({ c, d, lang, agora, papel }: { c: ComunidadeCartao; d: Dicionario; lang: string; agora: string; papel?: PapelNaComunidade }) {
  const t = d.socComunidades.cartao
  return (
    <article className="cartao cartao-comunidade" style={{ ['--h' as string]: matizDe(c.nome) }}>
      <Link href={`/${lang}/comunidades/${c.id}`} className="cartao-link" aria-label={t.ir.replace('{nome}', c.nome)}>
        <Foto foto={capaDoTema(c.tema, c.id)} alt="" className="cc-capa" />
        <span className="cc-topo">
          <span className="cc-nome">
            <strong>{c.nome}</strong>
            <span className="miudo">#{c.tema}</span>
          </span>
        </span>
        {c.descricao && <span className="cc-desc">{c.descricao}</span>}
      </Link>
      <div className="cc-pe">
        <PilulaAcesso acesso={c.acesso} d={d} />
        {papel && <span className="pilula" data-tom="acao">{d.socComum.papeis[papel]}</span>}
        <span className="miudo">{plural(t.membros, c.membros)}</span>
        <span className="miudo">{plural(t.topicos, c.topicos)}</span>
        <span className="miudo">{t.ativa.replace('{quando}', tempoRelativo(c.atividadeEm, d, new Date(agora)))}</span>
      </div>
    </article>
  )
}
