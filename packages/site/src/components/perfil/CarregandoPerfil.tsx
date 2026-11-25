'use client'

import { usePathname } from 'next/navigation'
import Esqueleto from '@/components/social/Esqueleto'
import { idiomaDoCaminho, textosDeCliente } from '@/lib/i18n-cliente'

/** O "carregando" das telas da área do perfil: o texto de leitor de tela vem do idioma da rota. */
export default function CarregandoPerfil({ linhas = 6, blocos = 2 }: { linhas?: number; blocos?: number }) {
  const d = textosDeCliente(idiomaDoCaminho(usePathname()))
  return (
    <div className="pilha">
      {Array.from({ length: blocos }, (_, i) => (
        <Esqueleto key={i} linhas={i === 0 ? linhas : 3} rotulo={d.comum.carregando} />
      ))}
    </div>
  )
}
