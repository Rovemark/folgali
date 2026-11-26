// Texts of the player of a video attached to a publication (protocol 0.11.0 part 3, `video`): its accessible name when the author
// wrote no description, the duration and "Report video". Apart from the composer texts (src/i18n/video.ts) because the post component
// also runs in the browser (the feed's "load more"): it carries these few sentences only. The 12 languages of the site, typed.
import type { Locale } from '@/lib/i18n-base'

export interface VideoPlayerTexts {
  label: string
  genericAlt: string
  duration: string
  report: string
}

export const VIDEO_PLAYER_TEXTS: Record<Locale, VideoPlayerTexts> = {
  pt: { label: 'Vídeo anexado', genericAlt: 'Vídeo publicado por {nome}', duration: 'Duração: {duracao}', report: 'Denunciar vídeo' },
  en: { label: 'Attached video', genericAlt: 'Video posted by {nome}', duration: 'Length: {duracao}', report: 'Report video' },
  es: { label: 'Video adjunto', genericAlt: 'Video publicado por {nome}', duration: 'Duración: {duracao}', report: 'Denunciar video' },
  fr: { label: 'Vidéo jointe', genericAlt: 'Vidéo publiée par {nome}', duration: 'Durée : {duracao}', report: 'Signaler la vidéo' },
  de: { label: 'Angehängtes Video', genericAlt: 'Video von {nome}', duration: 'Länge: {duracao}', report: 'Video melden' },
  it: { label: 'Video allegato', genericAlt: 'Video pubblicato da {nome}', duration: 'Durata: {duracao}', report: 'Segnala video' },
  nl: { label: 'Bijgevoegde video', genericAlt: 'Video geplaatst door {nome}', duration: 'Duur: {duracao}', report: 'Video melden' },
  ja: { label: '添付された動画', genericAlt: '{nome}さんが投稿した動画', duration: '長さ: {duracao}', report: '動画を報告' },
  ko: { label: '첨부된 동영상', genericAlt: '{nome} 님이 올린 동영상', duration: '길이: {duracao}', report: '동영상 신고' },
  zh: { label: '附带的视频', genericAlt: '{nome} 发布的视频', duration: '时长：{duracao}', report: '举报视频' },
  ru: { label: 'Прикреплённое видео', genericAlt: 'Видео, автор: {nome}', duration: 'Длительность: {duracao}', report: 'Пожаловаться на видео' },
  ar: { label: 'الفيديو المرفق', genericAlt: 'فيديو نشره {nome}', duration: 'المدة: {duracao}', report: 'الإبلاغ عن الفيديو' },
}

export const videoPlayerTexts = (lang: Locale): VideoPlayerTexts => VIDEO_PLAYER_TEXTS[lang]
