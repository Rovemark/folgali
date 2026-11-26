'use client'
/* eslint-disable @next/next/no-img-element -- the image comes from the site's own /midia route, with a known size */

// The attachments of a publication (protocol 0.11.0): a grid of up to 4 images. Each one is a button that opens it larger in a native
// <dialog> (Escape closes, the focus stays inside and goes back to the image on close), with previous and next when there is more
// than one (buttons and the arrow keys), the description the author wrote, and "Report image". Each image of the grid also has its own
// report link, a 44 px target. Every text comes from the server in the page language; only what the relay checked reaches here.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GalleryTexts } from '@/i18n/attach-gallery'
import { IcFlag, IcRight, IcLeft, IcClose } from '../folgali/Icons'

export type ZoomableItem = {
  chave: string
  /** always the site's own `/midia/<hash>.<ext>` */
  src: string
  /** the accessible name: the author's alternative text, or the generic name */
  nome: string
  /** the alternative text the author wrote, when there is one: shown as the caption of the enlarged image */
  legenda?: string
  largura: number
  altura: number
  /** the report page of this image's own object; absent on the reader's own images */
  denuncia?: string
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

export default function ZoomableGallery({ itens: items, rotulo: label, t }: { itens: ZoomableItem[]; rotulo: string; t: GalleryTexts }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const n = items.length

  const openAction = (k: number, from: HTMLElement) => {
    origin.current = from
    setOpen(k)
    const d = dialog.current
    if (!d || d.open) return
    // a browser (or a test environment) without the modal dialog still shows the picture
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
  }
  /** After the dialog closed (the button, the backdrop or Escape): forget the image and give the focus back to the one that opened it. */
  const handleClose = useCallback(() => {
    setOpen(null)
    origin.current?.focus()
    origin.current = null
  }, [])
  const close = useCallback(() => {
    const d = dialog.current
    if (d?.open && typeof d.close === 'function') return d.close() // fires `close`, which ends in aoFechar
    d?.removeAttribute('open')
    handleClose()
  }, [handleClose])
  const step = useCallback((step: number) => setOpen((k) => (k === null ? k : (k + step + n) % n)), [n])

  useEffect(() => {
    if (open === null || n < 2) return
    const keyName = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const rtl = getComputedStyle(dialog.current ?? document.documentElement).direction === 'rtl'
      e.preventDefault()
      step((e.key === 'ArrowRight') !== rtl ? 1 : -1)
    }
    document.addEventListener('keydown', keyName)
    return () => document.removeEventListener('keydown', keyName)
  }, [open, n, step])

  const current = open === null ? null : items[open]
  return (
    <>
      <ul className="gallery" data-n={n} aria-label={label}>
        {items.map((i, k) => (
          <li key={i.chave} className="gallery-item">
            <button type="button" className="gallery-open" aria-label={fill(t.open, { alt: i.nome })} aria-haspopup="dialog" onClick={(e) => openAction(k, e.currentTarget)}>
              <span className="imagem-rede imagem-anexo" style={{ aspectRatio: `${i.largura} / ${i.altura}` }}>
                <img src={i.src} alt={i.nome} width={i.largura} height={i.altura} loading="lazy" decoding="async" />
              </span>
            </button>
            {i.denuncia && (
              <a className="gallery-report" href={i.denuncia} aria-label={n > 1 ? fill(t.reportN, { n: k + 1 }) : t.report} title={t.report}>
                <span className="gallery-report-dot">
                  <IcFlag width={18} height={18} />
                </span>
              </a>
            )}
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        className="viewer"
        aria-label={t.viewer}
        onClose={handleClose}
        onClick={(e) => {
          // a click on the backdrop (the dialog element itself, outside its content) closes
          if (e.target === dialog.current) close()
        }}
      >
        {current && open !== null && (
          <div className="viewer-box">
            <div className="viewer-top">
              <p className="viewer-position" aria-live="polite">
                {n > 1 ? fill(t.position, { n: open + 1, total: n }) : ''}
              </p>
              <button type="button" className="icon-btn viewer-close" aria-label={t.close} onClick={close} autoFocus>
                <IcClose />
              </button>
            </div>
            <div className="viewer-stage">
              {n > 1 && (
                <button type="button" className="icon-btn viewer-arrow viewer-prev" aria-label={t.previous} onClick={() => step(-1)}>
                  <IcLeft />
                </button>
              )}
              <img key={current.chave} className="viewer-img" src={current.src} alt={current.nome} width={current.largura} height={current.altura} decoding="async" />
              {n > 1 && (
                <button type="button" className="icon-btn viewer-arrow viewer-next" aria-label={t.next} onClick={() => step(1)}>
                  <IcRight />
                </button>
              )}
            </div>
            {(current.legenda || current.denuncia) && (
              <div className="viewer-foot">
                {current.legenda && (
                  <p className="viewer-caption" dir="auto">
                    {current.legenda}
                  </p>
                )}
                {current.denuncia && (
                  <a className="btn btn-calm btn-small viewer-report" href={current.denuncia}>
                    <IcFlag width={18} height={18} />
                    {t.report}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}
