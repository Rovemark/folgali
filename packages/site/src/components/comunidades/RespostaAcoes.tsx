'use client'

import { useId, useState } from 'react'
import Reacoes from '@/components/Reacoes'
import BotaoAto from '@/components/social/BotaoAto'
import FormProposta from '@/components/social/FormProposta'
import { IcBalao, IcLixo } from '@/components/Icones'
import { IcCitar, IcResolvido } from '@/components/social/IconesSociais'
import type { Dicionario } from '@/lib/i18n-base'
import type { RespostaForum } from '@/lib/social/tipos'
import AcaoComMotivo from './AcaoComMotivo'
import DenunciarDialogo from './DenunciarDialogo'

export type PermissoesDaResposta = {
  /** pode responder neste tópico agora (membro, sem banimento, tópico não trancado ou equipe) */
  responder: boolean
  /** o motivo, em texto, quando não pode (para a tela dizer) */
  responderMotivo?: string
  /** marcar como resolveu: autor do tópico ou equipe */
  resolver: boolean
  /** equipe pode remover conteúdo alheio (moderador não remove o do dono) */
  removerAlheio: boolean
  /** é minha */
  minha: boolean
}

/**
 * As ações de uma resposta, numa fileira: reagir, responder (abre o formulário que vai para a fila de
 * aprovação), citar, marcar o que resolveu, denunciar e remover ou apagar. Cada botão só existe se a
 * matriz de permissões deixa; o relé repete a conferência.
 */
export default function RespostaAcoes({ r, topico, maeId, resolvidaId, perm, d, lang, nomeDoRover, podeEscrever }: { r: RespostaForum; topico: string; maeId: string; resolvidaId: string | null; perm: PermissoesDaResposta; d: Dicionario; lang: string; nomeDoRover?: string; podeEscrever: boolean }) {
  const t = d.socForum.respostas
  const id = useId()
  const [form, setForm] = useState<null | 'responder' | 'citar'>(null)
  const ehFilha = r.em !== null
  const resolvida = resolvidaId === r.id
  return (
    <>
      <div className="acoes resposta-acoes" role="group" aria-label={t.fioAcoes.replace('{nome}', r.autor.nome)}>
        <Reacoes id={r.id} reacoes={r.reacoes} minha={r.minhaReacao ?? null} rotulos={{ curtir: t.curtir, util: t.util }} />
        {perm.responder && (
          <button type="button" className="acao-btn texto" aria-expanded={form === 'responder'} aria-controls={`${id}-f`} onClick={() => setForm(form === 'responder' ? null : 'responder')}>
            <IcBalao />
            <span>{t.responder}</span>
          </button>
        )}
        {perm.responder && !ehFilha && (
          <button type="button" className="acao-btn texto" aria-expanded={form === 'citar'} aria-controls={`${id}-f`} onClick={() => setForm(form === 'citar' ? null : 'citar')}>
            <IcCitar />
            <span>{t.citar}</span>
          </button>
        )}
        {perm.resolver && (
          <BotaoAto ato={{ tipo: 'topico-resolvido', topico, resposta: resolvida ? null : r.id }} d={d} className="acao-btn texto" ariaPressed={resolvida}>
            <IcResolvido />
            <span>{resolvida ? t.desmarcar : t.marcar}</span>
          </BotaoAto>
        )}
        {!perm.minha && <DenunciarDialogo alvo={r.id} d={d} rotulo={t.denunciar} />}
        {perm.minha ? (
          <BotaoAto ato={{ tipo: 'remocao-pelo-autor', alvo: r.id }} d={d} className="acao-btn texto" confirmar={{ titulo: t.apagarTitulo, texto: t.apagarTexto, ok: t.apagar }}>
            <IcLixo />
            <span>{t.apagar}</span>
          </BotaoAto>
        ) : (
          perm.removerAlheio && (
            <AcaoComMotivo
              ato={{ tipo: 'remocao-por-responsavel', alvo: r.id }}
              d={d}
              rotulo={t.remover}
              titulo={d.socForum.gestao.removerTitulo}
              texto={d.socForum.gestao.removerTexto}
              confirmar={d.socForum.gestao.confirmar}
              className="acao-btn texto perigo-texto"
            />
          )
        )}
      </div>
      {!perm.responder && perm.responderMotivo && <p className="miudo resposta-aviso">{perm.responderMotivo}</p>}
      {form && (
        <div id={`${id}-f`} className="resposta-form">
          <p className="sobrelinha">{form === 'citar' ? t.citando.replace('{nome}', r.autor.nome) : ehFilha ? t.fundaDica : t.responderA.replace('{nome}', r.autor.nome)}</p>
          <FormProposta
            key={form}
            tipo="resposta-forum"
            d={d}
            lang={lang}
            compacto
            podeEscrever={podeEscrever}
            nomeDoRover={nomeDoRover}
            destino={null}
            ocultar={['topico', 'em', 'cita']}
            campos={{ topico, em: form === 'citar' ? null : maeId, cita: form === 'citar' || ehFilha ? r.id : null, texto: '' }}
            onEnviado={() => undefined}
          />
        </div>
      )}
    </>
  )
}
