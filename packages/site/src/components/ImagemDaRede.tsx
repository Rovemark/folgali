/* eslint-disable @next/next/no-img-element -- a imagem da rede vem do próprio site (/midia/<hash>), com tamanho conhecido; o otimizador do Next não ajuda e buscaria por conta própria */
// 0.5.0: uma imagem da rede (retrato em imagem ou anexo de postagem). Regras que este componente garante:
//   - o texto alternativo é obrigatório: sem ele, a imagem não aparece;
//   - o `src` só nasce do hash conferido (`/midia/<hash>.<ext>`, mesmo domínio); não existe prop de endereço;
//   - largura e altura vão no <img> e a proporção é reservada antes de carregar: a página não pula;
//   - carrega sob demanda (`loading="lazy"`).
import { urlDaImagem, type ImagemDaRede as TImagem } from '@/lib/imagens'

type Props = {
  imagem: TImagem
  className?: string
  /** a imagem é o próprio conteúdo (anexo) ou um retrato */
  papel?: 'anexo' | 'retrato'
}

export default function ImagemDaRede({ imagem, className = '', papel = 'anexo' }: Props) {
  const src = urlDaImagem(imagem)
  const alt = typeof imagem.alt === 'string' ? imagem.alt.trim() : ''
  if (!src || !alt) return null
  return (
    <span className={`imagem-rede imagem-${papel} ${className}`.trim()} style={{ aspectRatio: `${imagem.largura} / ${imagem.altura}` }}>
      <img src={src} alt={alt} width={imagem.largura} height={imagem.altura} loading="lazy" decoding="async" />
    </span>
  )
}

/** Os anexos de uma postagem (1 a 4), em grade. Cada imagem com a sua proporção. */
export function GaleriaDeImagens({ imagens, rotulo }: { imagens: TImagem[]; rotulo: string }) {
  const validas = imagens.filter((i) => urlDaImagem(i) && i.alt?.trim()).slice(0, 4)
  if (!validas.length) return null
  return (
    <ul className="galeria" data-n={validas.length} aria-label={rotulo}>
      {validas.map((i) => (
        <li key={i.hash}>
          <ImagemDaRede imagem={i} />
        </li>
      ))}
    </ul>
  )
}
