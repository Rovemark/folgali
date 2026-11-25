import Link from 'next/link'
import EstadoVazio from '@/components/EstadoVazio'
import { rostoPorUid } from '@/lib/dominio/expressao'
import type { Dicionario } from '@/lib/i18n'
import { tipoDeEstado } from '@/lib/social/carregar'
import type { CodigoErro } from '@/lib/tipos'

/** O estado de erro, de "sem permissão" e de "não existe" de qualquer tela social: um rover que reage ao que aconteceu. */
export default function EstadoDeErro({ codigo, d, lang, semVoltar = false }: { codigo: CodigoErro; d: Dicionario; lang: string; semVoltar?: boolean }) {
  const t = tipoDeEstado(codigo)
  const m = d.socComum.erros[t]
  const estado = t === 'fora-do-ar' ? 'pensar' : t === 'sem-permissao' || t === 'privado' ? 'parado' : t === 'removido' ? 'dormir' : 'pensar'
  return (
    <EstadoVazio
      titulo={m.titulo}
      texto={m.texto}
      ficha={rostoPorUid(`rvr_erro_${t}_0000000000000`)}
      estado={estado}
      erro={t === 'fora-do-ar' || t === 'outro'}
      acoes={
        semVoltar ? undefined : (
          <Link href={`/${lang}`} className="btn btn-sec">
            {d.comum.irParaLinha}
          </Link>
        )
      }
    />
  )
}
