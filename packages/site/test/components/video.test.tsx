// 0.11.0 part 3 (`video`): the player of a published video, the field the site reads from the relay, and the first check of a picked
// file. The cleaning itself is proved byte for byte against the protocol in test/person/video-limpeza.test.ts.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import NetworkVideo from '@/components/media/NetworkVideo'
import { videoPlayerTexts } from '@/i18n/video-player'
import { videoTexts } from '@/i18n/video'
import { LOCALES } from '@/lib/i18n-base'
import { checkPickedVideo } from '@/lib/person/video'
import { formatDuration, sanitizeVideo, thumbnailUrl, videoUrl, videoOf } from '@/lib/videos'

const H = 'a'.repeat(64)
const P = 'b'.repeat(64)
const ID = `ob_${'V'.repeat(43)}`
const video = (extra: Record<string, unknown> = {}) => ({
  id: ID, hash: H, formato: 'mp4', largura: 1280, altura: 720, bytes: 812345, duracaoMs: 12000, alt: '',
  miniatura: { hash: P, formato: 'jpeg', largura: 1280, altura: 720 }, ...extra,
})

describe('the field `video` read from the relay', () => {
  it('keeps a well-formed video and drops what does not conform', () => {
    expect(sanitizeVideo(video())).toMatchObject({ hash: H, formato: 'mp4', duracaoMs: 12000 })
    for (const bad of [{ hash: 'x' }, { formato: 'avi' }, { largura: 0 }, { duracaoMs: -1 }, { duracaoMs: 61000 }]) expect(sanitizeVideo(video(bad)), JSON.stringify(bad)).toBeNull()
    expect(sanitizeVideo(null)).toBeNull()
    // a bad id only takes the report entry away
    expect(sanitizeVideo(video({ id: 'nao-e-id' }))?.id).toBeUndefined()
    // a bad poster is dropped, the video stays
    expect(sanitizeVideo(video({ miniatura: { hash: 'zz', formato: 'jpeg', largura: 1, altura: 1 } }))?.miniatura ?? null).toBeNull()
    expect(videoOf({ video: video() }).video?.hash).toBe(H)
    expect(videoOf({ video: { hash: 1 } })).toEqual({})
  })
  it('the addresses are born only from checked hashes, on the site domain', () => {
    expect(videoUrl({ hash: H, formato: 'mp4' })).toBe(`/video/${H}.mp4`)
    expect(videoUrl({ hash: '../x', formato: 'mp4' } as never)).toBeNull()
    expect(thumbnailUrl({ hash: P, formato: 'jpeg', largura: 1, altura: 1 })).toMatch(new RegExp(`${P}`))
    expect(formatDuration(65000)).toBe('1:05')
  })
})

describe('the player', () => {
  it('never plays by itself, asks only for metadata, has a name, a poster and a report entry', () => {
    const { container } = render(<NetworkVideo video={sanitizeVideo(video())!} t={videoPlayerTexts('pt')} autor={{ nome: 'Ana Souza', handle: 'ana' }} lang="pt" volta={`/p/${ID}`} />)
    const v = container.querySelector('video')!
    expect(v.autoplay).toBe(false)
    expect(v.getAttribute('preload')).toBe('metadata')
    expect(v.hasAttribute('controls')).toBe(true)
    expect(v.getAttribute('poster')).toBeTruthy()
    expect(screen.getByRole('figure').getAttribute('aria-label') ?? v.getAttribute('aria-label')).toBeTruthy()
    const report = container.querySelector('.video-network-report') as HTMLAnchorElement
    expect(report.getAttribute('href')).toContain(`/pt/denunciar/${ID}?tipo=video`)
  })
  it('her own video has no report entry; without a poster the player still renders', () => {
    const { container } = render(<NetworkVideo video={sanitizeVideo(video({ miniatura: null }))!} t={videoPlayerTexts('pt')} autor={{ nome: 'Ana', handle: 'ana' }} lang="pt" propria />)
    expect(container.querySelector('.video-network-report')).toBeNull()
    expect(container.querySelector('video')!.getAttribute('poster')).toBeNull()
  })
})

describe('the first check of a picked file', () => {
  it('refuses by size and by the first bytes, before reading the whole file', async () => {
    // (jsdom's Blob has no arrayBuffer: a file-like object with the two members the check uses)
    const file = (b: Uint8Array) => ({ size: b.length, slice: (i: number, j: number) => ({ arrayBuffer: async () => b.slice(i, j).buffer }) }) as unknown as Blob
    expect(await checkPickedVideo(file(new Uint8Array(10)))).toMatchObject({ code: 'formato_nao_aceito' })
    const gif = new Uint8Array(64); gif.set([0x47, 0x49, 0x46, 0x38])
    expect(await checkPickedVideo(file(gif))).toMatchObject({ code: 'formato_nao_aceito' })
    const big = { size: 51 * 1048576, slice: () => new Blob([]) } as unknown as Blob
    expect(await checkPickedVideo(big)).toMatchObject({ code: 'video_grande' })
    const mp4 = new Uint8Array(64); mp4.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
    expect(await checkPickedVideo(file(mp4))).toBeNull()
  })
})

describe('the texts exist in the 12 languages', () => {
  it('player and composer texts, no dash', () => {
    for (const l of LOCALES) {
      const all = JSON.stringify([videoPlayerTexts(l), videoTexts(l)])
      expect(all.length, l).toBeGreaterThan(200)
      expect(all, l).not.toMatch(/[–—]/)
    }
  })
})
