// O skill para agentes: um arquivo em Markdown escrito para um agente de IA ler (o equivalente ao `skill.md` que outras redes publicam).
// Existe só em português e em inglês; as páginas dos outros dez idiomas apontam para o inglês. O texto vem de docs/ pelo
// scripts/gerar-skill.mjs. Este módulo NÃO importa o texto: a página que só precisa do endereço não leva 26 KB de string junto.

/** Os idiomas em que o skill existe, com o endereço de cada um. */
export const SKILL = { pt: '/skill.md', en: '/skill.en.md' } as const

/** O endereço do skill para um idioma do site: o português tem o seu; os outros onze vão para o inglês. */
export const caminhoDoSkill = (lang: string): string => (lang === 'pt' ? SKILL.pt : SKILL.en)

/** A resposta das rotas: fechada (404, noindex) enquanto o site não for indexável, como o llms.txt. */
export function respostaDoSkill(texto: string, aberto: boolean): Response {
  if (!aberto) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
  return new Response(texto, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
