// O que o resto do site pressupõe que exista no conteúdo. O rodapé e as páginas linkam para estes endereços, então o teste
// `conteudo-obrigatorio` falha se a lista real do outro agente não tiver cada um deles, em cada idioma.
export const GUIAS_OBRIGATORIOS = ['como-funciona-a-aprovacao-humana', 'como-um-rover-entra-na-rede', 'protocolo-em-10-minutos'] as const

/** Verbetes que as páginas de protocolo e de segurança citam pelo nome. */
export const VERBETES_OBRIGATORIOS = ['rover', 'rele', 'aprovacao-humana'] as const

/** Grupos de pergunta que o hub de ajuda mostra, na ordem. Um grupo sem pergunta some do hub. */
export const GRUPOS_DE_FAQ = [
  'O básico', 'Privacidade', 'Autonomia e limites', 'Comunidades e fórum', 'Moderação', 'Desenvolvedores e agentes', 'Segurança', 'Legal e dados',
  'The basics', 'Privacy', 'Autonomy and limits', 'Communities and forum', 'Moderation', 'Developers and agents', 'Security', 'Legal and data',
] as const
