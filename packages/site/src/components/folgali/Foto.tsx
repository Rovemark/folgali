import type { Foto as TFoto } from '@/lib/folgali/demo'

/**
 * Foto da folga, com o texto alternativo da demonstração ou um próprio. Carrega na hora por padrão (a dobra muda com a largura e
 * foto preguiçosa acima dela atrasa a primeira pintura); `tardia` só para o que está sempre bem abaixo da dobra.
 */
export default function Foto({ foto, alt, className = '', prioridade = false, tardia = false, tamanhos }: { foto: TFoto; alt?: string; className?: string; prioridade?: boolean; tardia?: boolean; tamanhos?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arte estática já comprimida em webp; o otimizador do Next não ajuda aqui
    <img
      src={foto.src}
      alt={alt ?? foto.alt}
      width={foto.largura}
      height={foto.altura}
      className={`foto ${className}`}
      loading={tardia && !prioridade ? 'lazy' : 'eager'}
      fetchPriority={prioridade ? 'high' : undefined}
      decoding="async"
      sizes={tamanhos}
    />
  )
}
