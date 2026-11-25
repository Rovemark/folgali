import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { ehPronto, META, type Pronto } from '@/lib/i18n'
import { metaDe, rodapeDict } from '@/lib/i18n-extra'
import { OG } from '@/lib/seo/og-cores'
import { ROTAS } from '@/lib/seo/rotas'
import { ENTIDADE, urlBase } from '@/lib/site'

export const dynamic = 'force-dynamic'

// A fonte embutida do next/og só tem latino: sem fonte própria, chinês, japonês, coreano e árabe saem como quadrados vazios.
// As fontes ficam NO repositório (src/fontes/og/<idioma>-<peso>.ttf), recortadas só com os glifos que a imagem usa (texto das rotas
// e da marca nos 12 idiomas; o teste test/seo/og-fontes.test.ts confere que nenhum glifo falta). Nada de rede, de Google Fonts nem de
// fonte de terceiros em tempo de execução: a promessa de privacidade do site vale também para a imagem.
// ÁRABE fica de fora de propósito: o renderizador do next/og (satori) não faz a ordem bidirecional nem mede palavra ligada (a marca
// saía invertido e com vãos enormes, conferido em foto em 09/11/2026). Em árabe a imagem sai em inglês, legível e correta; a página é toda árabe.
const FAMILIA: Partial<Record<Pronto, string>> = { zh: 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR' }
const MEMORIA_DE_FONTE = new Map<string, Buffer | null>()
let LOGO: string | null | undefined

/** O logotipo da folgali em PNG (o satori não lê webp), embutido como data URL. Sem o arquivo, a imagem sai só com o texto. */
async function logo(): Promise<string | null> {
  if (LOGO !== undefined) return LOGO
  try {
    LOGO = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/marca/folgali/logo-og.png'))).toString('base64')}`
  } catch {
    LOGO = null
  }
  return LOGO
}

async function carregarFonte(lang: Pronto, peso: 400 | 700): Promise<Buffer | null> {
  if (!FAMILIA[lang]) return null
  const chave = `${lang}-${peso}`
  if (MEMORIA_DE_FONTE.has(chave)) return MEMORIA_DE_FONTE.get(chave) ?? null
  try {
    const dados = await readFile(join(process.cwd(), 'src/fontes/og', `${chave}.ttf`))
    MEMORIA_DE_FONTE.set(chave, dados)
    return dados
  } catch {
    MEMORIA_DE_FONTE.set(chave, null)
    return null   // sem o arquivo a imagem ainda sai, com a fonte padrão
  }
}

/** O next/og não faz reordenação bidirecional: em árabe monta palavra a palavra num flex row-reverse para a frase ler na ordem certa. */
const Linha = ({ texto, rtl, estilo }: { texto: string; rtl: boolean; estilo: React.CSSProperties }) =>
  rtl ? (
    <div style={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap', columnGap: 14, rowGap: 2, ...estilo }}>
      {texto.split(' ').map((p, i) => <div key={i} style={{ display: 'flex' }}>{p}</div>)}
    </div>
  ) : (
    <div style={{ display: 'flex', ...estilo }}>{texto}</div>
  )

// Imagem de compartilhamento 1200x630. O texto vem SÓ do registro de rotas (título da página) e do dicionário: nada que alguém digitou
// (nome de comunidade, título de tópico) entra aqui, nem por parâmetro. Id desconhecido cai na imagem padrão.
export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; id: string }> }): Promise<Response> {
  const { lang, id } = await params
  if (!ehPronto(lang)) return new Response('Not found', { status: 404 })
  const [negrito, normal, marca] = await Promise.all([carregarFonte(lang, 700), carregarFonte(lang, 400), logo()])
  // Escrita que precisa de fonte própria e não a tem (árabe, ou arquivo ausente no servidor): a imagem sai no inglês em vez de quadrados vazios.
  const precisaDeFonte = FAMILIA[lang] !== undefined || META[lang].dir === 'rtl'
  const efetivo: Pronto = precisaDeFonte && !negrito && !normal ? 'en' : lang
  const r = rodapeDict(efetivo)
  const conhecida = ROTAS.some((x) => x.id === id && x.externo === undefined && id !== 'aprovacaoHumana')
  const titulo = conhecida ? metaDe(efetivo, id).titulo : r.marca.titulo
  const rotulo = conhecida && id !== 'inicio' ? r.marca.titulo : r.marca.nota
  const host = new URL(urlBase()).host
  const rtl = META[efetivo].dir === 'rtl'
  const nomeDaFonte = FAMILIA[efetivo] ?? ''
  const fonts = [
    ...(negrito ? [{ name: nomeDaFonte, data: negrito, weight: 700 as const, style: 'normal' as const }] : []),
    ...(normal ? [{ name: nomeDaFonte, data: normal, weight: 400 as const, style: 'normal' as const }] : []),
  ]
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: OG.fundo, color: OG.tinta, ...(fonts.length ? { fontFamily: nomeDaFonte } : {}), ...(rtl ? { alignItems: 'flex-end' } : {}) }}>
        <div style={{ display: 'flex', flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 24 }}>
          {marca ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem dentro do satori, não é página
            <img src={marca} width={286} height={105} alt="" />
          ) : (
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: OG.acao }}>folgali</div>
          )}
          <Linha texto={rotulo} rtl={rtl} estilo={{ fontSize: 26, color: OG.acao, letterSpacing: rtl ? 0 : 1 }} />
        </div>
        <Linha texto={titulo} rtl={rtl} estilo={{ fontSize: titulo.length > 38 ? 68 : 88, fontWeight: 700, lineHeight: 1.12, letterSpacing: rtl || efetivo === 'zh' || efetivo === 'ja' || efetivo === 'ko' ? 0 : -2, maxWidth: 1000, ...(rtl ? { justifyContent: 'flex-start' } : {}) }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${OG.linha}`, paddingTop: 28, fontSize: 26, color: OG.tintaSuave }}>
          <div style={{ display: 'flex' }}>{host}</div>
          <div style={{ display: 'flex' }}>{ENTIDADE.licenca} · {ENTIDADE.empresa}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, ...(fonts.length ? { fonts } : {}), headers: { 'Cache-Control': 'public, max-age=86400' } },
  )
}
