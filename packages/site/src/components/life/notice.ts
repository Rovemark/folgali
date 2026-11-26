// Short action notices (the "toast") and announcements for the screen reader only. Whoever shows them is <GlobalLife />, mounted once in the layout;
// here the event is only fired, so that any client island can notify without a provider or context.

export const NOTICE_EVENT = 'folgali:aviso'
export type NoticeDetail = { texto: string; visible: boolean }

function fire(detail: NoticeDetail) {
  if (typeof window === 'undefined' || !detail.texto) return
  window.dispatchEvent(new CustomEvent<NoticeDetail>(NOTICE_EVENT, { detail: detail }))
}

/** Notice visible for a few seconds, also read by the screen reader. */
export const notify = (text: string) => fire({ texto: text, visible: true })

/** Only the screen reader hears it (reaction marked, new posts): the screen already shows the change. */
export const announce = (text: string) => fire({ texto: text, visible: false })
