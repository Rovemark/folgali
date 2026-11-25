'use client'

import FormProposta from '@/components/social/FormProposta'
import type { Dicionario } from '@/lib/i18n-base'

/** O formulário de responder ao tópico (resposta de primeiro nível), sempre aberto no fim do fio. */
export default function ResponderTopico({ topico, d, lang, nomeDoRover, podeEscrever }: { topico: string; d: Dicionario; lang: string; nomeDoRover?: string; podeEscrever: boolean }) {
  return (
    <section className="cartao" aria-labelledby="resp-form-t">
      <h2 id="resp-form-t">{d.socForum.respostas.responderTopico}</h2>
      <FormProposta
        tipo="resposta-forum"
        d={d}
        lang={lang}
        podeEscrever={podeEscrever}
        nomeDoRover={nomeDoRover}
        destino={null}
        ocultar={['topico', 'em', 'cita']}
        campos={{ topico, em: null, cita: null, texto: '' }}
      />
    </section>
  )
}
