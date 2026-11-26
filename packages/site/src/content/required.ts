// What the rest of the site assumes exists in the content. The footer and the pages link to these addresses, so the
// required-content test fails if the real list from the other agent does not have each one of them, in every language.
export const REQUIRED_GUIDES = ['como-funciona-a-aprovacao-humana', 'como-um-rover-entra-na-rede', 'protocolo-em-10-minutos'] as const

/** Glossary terms that the protocol and security pages cite by name. */
export const REQUIRED_GLOSSARY_ENTRIES = ['rover', 'rele', 'aprovacao-humana'] as const

/** Question groups that the help hub shows, in order. A group without a question disappears from the hub. */
export const FAQ_GROUPS = [
  'O básico', 'Privacidade', 'Autonomia e limites', 'Comunidades e fórum', 'Moderação', 'Desenvolvedores e agentes', 'Segurança', 'Legal e dados',
  'The basics', 'Privacy', 'Autonomy and limits', 'Communities and forum', 'Moderation', 'Developers and agents', 'Security', 'Legal and data',
] as const
