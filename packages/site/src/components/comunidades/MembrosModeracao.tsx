'use client'

import CartaoRover from '@/components/social/CartaoRover'
import BotaoAto from '@/components/social/BotaoAto'
import { useMais } from '@/components/social/useMais'
import { podeNaComunidade } from '@/lib/dominio/permissoes'
import { tempoRelativo, type Dicionario } from '@/lib/i18n-base'
import type { Acesso, MembroItem, PapelNaComunidade } from '@/lib/social/tipos'
import type { Pagina } from '@/lib/tipos'
import AcaoComMotivo from './AcaoComMotivo'

/** Membros com as ações que o PAPEL do leitor permite: a matriz decide, e o que não cabe nem aparece. */
export default function MembrosModeracao({ inicial, comunidade, acesso, meuPapel, meuUid, d, lang, agora }: { inicial: Pagina<MembroItem>; comunidade: string; acesso: Acesso; meuPapel: PapelNaComunidade; meuUid: string; d: Dicionario; lang: string; agora: string }) {
  const { itens, proximo, pendente, falhou, mais } = useMais(inicial, { lista: 'membros', de: comunidade }, (m) => m.rover.uid)
  const t = d.socModeracao.membros
  const quem = { papel: meuPapel, banido: false }
  const nMod = itens.filter((m) => m.papel === 'moderador').length
  return (
    <>
      <ul className="membros-lista membros-mod">
        {itens.map((m) => {
          const eu = m.rover.uid === meuUid
          const expulsar = !eu && podeNaComunidade('expulsar', quem, acesso, { alvoPapel: m.papel }).ok
          const banir = !eu && podeNaComunidade('banir', quem, acesso, { alvoPapel: m.papel }).ok
          const promover = !eu && meuPapel === 'dono' && m.papel === 'membro' && nMod < 10
          const rebaixar = !eu && meuPapel === 'dono' && m.papel === 'moderador'
          return (
            <li key={m.rover.uid} className="membro-mod">
              <CartaoRover
                rover={m.rover}
                lang={lang}
                extra={
                  <>
                    <span className="pilula" data-tom={m.papel === 'membro' ? undefined : 'acao'}>
                      {eu ? `${d.socComum.papeis[m.papel]} (${t.ele})` : d.socComum.papeis[m.papel]}
                    </span>
                    <span className="miudo">{tempoRelativo(m.desde, d, new Date(agora))}</span>
                  </>
                }
              />
              {(expulsar || banir || promover || rebaixar) && (
                <div className="linha-flex membro-acoes">
                  {promover && (
                    <BotaoAto ato={{ tipo: 'comunidade-gestao', comunidade, alvo: m.rover.uid, acao: 'promover', motivo: null }} d={d} className="btn btn-sec btn-peq">
                      {t.promover}
                    </BotaoAto>
                  )}
                  {rebaixar && (
                    <BotaoAto ato={{ tipo: 'comunidade-gestao', comunidade, alvo: m.rover.uid, acao: 'rebaixar', motivo: null }} d={d} className="btn btn-sec btn-peq">
                      {t.rebaixar}
                    </BotaoAto>
                  )}
                  {expulsar && <AcaoComMotivo ato={{ tipo: 'comunidade-gestao', comunidade, alvo: m.rover.uid, acao: 'expulsar' }} d={d} rotulo={t.expulsar} titulo={t.expulsarTitulo} texto={t.expulsarTexto} confirmar={t.expulsar} />}
                  {banir && <AcaoComMotivo ato={{ tipo: 'comunidade-gestao', comunidade, alvo: m.rover.uid, acao: 'banir' }} d={d} rotulo={t.banir} titulo={t.banirTitulo} texto={t.banirTexto} confirmar={t.banir} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {proximo && (
        <div style={{ display: 'grid', justifyItems: 'center', marginTop: 12 }}>
          <button type="button" className="btn btn-sec" onClick={mais} disabled={pendente}>
            {pendente ? d.comum.carregando : d.comum.carregarMais}
          </button>
        </div>
      )}
      {falhou && (
        <p className="erro-campo" role="alert">
          {d.socComum.erros.outro.titulo}
        </p>
      )}
    </>
  )
}
