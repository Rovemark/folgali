'use client'

import { IcLixo, IcMais } from '@/components/Icones'
import BotaoAto from '@/components/social/BotaoAto'
import { MOTIVOS_DENUNCIA_SOCIAL, MOTIVOS_MODERACAO } from '@/lib/social/tipos'
import type { Dicionario } from '@/lib/i18n-base'
import AcaoComMotivo from './AcaoComMotivo'

type Props = { id: string; d: Dicionario; souAutor: boolean; souDonoDaPagina: boolean; nomeDaPagina: string }

/**
 * O menu de uma atualização: o autor apaga a sua; o dono da página remove a de outro (com um motivo da
 * lista, que entra no registro público); qualquer rover denuncia, sem deixar rastro de quem foi.
 */
export default function MenuAtualizacao({ id, d, souAutor, souDonoDaPagina }: Props) {
  const t = d.socPaginas.atualizacao
  return (
    <details className="menu post-menu">
      <summary className="icone-btn" aria-label={t.menu}>
        <IcMais />
      </summary>
      <div className="menu-lista" role="group" aria-label={t.menu}>
        {souAutor && (
          <BotaoAto
            ato={{ tipo: 'remocao-pelo-autor', alvo: id }}
            d={d}
            className="menu-item perigo"
            confirmar={{ titulo: t.apagarTitulo, texto: t.apagarTexto, ok: t.apagarConfirma }}
          >
            <IcLixo /> {t.apagar}
          </BotaoAto>
        )}
        {!souAutor && souDonoDaPagina && (
          <AcaoComMotivo
            d={d}
            perigo
            rotuloBotao={t.remover}
            titulo={t.removerTitulo}
            texto={t.removerTexto}
            confirmar={t.removerConfirma}
            motivos={MOTIVOS_MODERACAO.map((m) => ({ valor: m, rotulo: d.socComum.motivosModeracao[m] }))}
            montar={(motivo) => ({ tipo: 'remocao-por-responsavel', alvo: id, motivo: motivo as (typeof MOTIVOS_MODERACAO)[number] })}
          />
        )}
        {!souAutor && (
          <AcaoComMotivo
            d={d}
            rotuloBotao={t.denunciar}
            titulo={t.denunciarTitulo}
            texto={t.denunciarTexto}
            confirmar={t.denunciarConfirma}
            motivos={MOTIVOS_DENUNCIA_SOCIAL.map((m) => ({ valor: m, rotulo: d.socComum.motivosDenuncia[m] }))}
            montar={(motivo) => ({ tipo: 'denuncia', alvo: id, motivo: motivo as (typeof MOTIVOS_DENUNCIA_SOCIAL)[number] })}
          />
        )}
      </div>
    </details>
  )
}
