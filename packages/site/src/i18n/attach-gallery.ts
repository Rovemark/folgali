// Texts of the gallery of a publication (protocol 0.11.0, `midia-livre`): the generic name of an image the author did not describe,
// enlarge, previous and next, report, and what the moderation removed. The 12 languages of the site, typed. Apart from the rest of the
// attachment texts (src/i18n/attach.ts) because the post component also runs in the browser (the feed's "load more"): this way it
// carries these few sentences, not the whole composer.
import type { Locale } from '@/lib/i18n-base'

export interface GalleryTexts {
  label: string
  genericAlt: string
  open: string
  viewer: string
  close: string
  previous: string
  next: string
  position: string
  report: string
  reportN: string
  removedOne: string
  removedMany: string
  /** 0.11.0 part 3: one attachment removed and nothing left to show: it may have been an image or the video */
  removedAttachment: string
  
}

const pt: GalleryTexts = {
  label: 'Imagens anexadas',
  genericAlt: 'Imagem publicada por {nome}',
  open: 'Ampliar: {alt}',
  viewer: 'Imagem ampliada',
  close: 'Fechar',
  previous: 'Imagem anterior',
  next: 'Próxima imagem',
  position: 'Imagem {n} de {total}',
  report: 'Denunciar imagem',
  reportN: 'Denunciar a imagem {n}',
  removedOne: 'Uma imagem foi removida pela moderação.',
  removedMany: '{n} imagens foram removidas pela moderação.',
  removedAttachment: 'Um anexo foi removido pela moderação.',

}

const en: GalleryTexts = {
  label: 'Attached images',
  genericAlt: 'Image posted by {nome}',
  open: 'Enlarge: {alt}',
  viewer: 'Enlarged image',
  close: 'Close',
  previous: 'Previous image',
  next: 'Next image',
  position: 'Image {n} of {total}',
  report: 'Report image',
  reportN: 'Report image {n}',
  removedOne: 'One image was removed by moderation.',
  removedMany: '{n} images were removed by moderation.',
  removedAttachment: 'An attachment was removed by moderation.',

}

const es: GalleryTexts = {
  label: 'Imágenes adjuntas',
  genericAlt: 'Imagen publicada por {nome}',
  open: 'Ampliar imagen: {alt}',
  viewer: 'Imagen ampliada',
  close: 'Cerrar',
  previous: 'Imagen anterior',
  next: 'Imagen siguiente',
  position: 'Imagen {n} de {total}',
  report: 'Denunciar imagen',
  reportN: 'Denunciar la imagen {n}',
  removedOne: 'La moderación retiró una imagen.',
  removedMany: 'La moderación retiró {n} imágenes.',
  removedAttachment: 'La moderación retiró un archivo adjunto.',

}

const fr: GalleryTexts = {
  label: 'Images jointes',
  genericAlt: 'Image publiée par {nome}',
  open: 'Agrandir : {alt}',
  viewer: 'Image agrandie',
  close: 'Fermer',
  previous: 'Image précédente',
  next: 'Image suivante',
  position: 'Image {n} sur {total}',
  report: 'Signaler l’image',
  reportN: 'Signaler l’image {n}',
  removedOne: 'Une image a été retirée par la modération.',
  removedMany: '{n} images ont été retirées par la modération.',
  removedAttachment: 'Une pièce jointe a été retirée par la modération.',

}

const from: GalleryTexts = {
  label: 'Angehängte Bilder',
  genericAlt: 'Bild, veröffentlicht von {nome}',
  open: 'Vergrößern: {alt}',
  viewer: 'Vergrößertes Bild',
  close: 'Schließen',
  previous: 'Vorheriges Bild',
  next: 'Nächstes Bild',
  position: 'Bild {n} von {total}',
  report: 'Bild melden',
  reportN: 'Bild {n} melden',
  removedOne: 'Ein Bild wurde von der Moderation entfernt.',
  removedMany: '{n} Bilder wurden von der Moderation entfernt.',
  removedAttachment: 'Ein Anhang wurde von der Moderation entfernt.',

}

const it: GalleryTexts = {
  label: 'Immagini allegate',
  genericAlt: 'Immagine pubblicata da {nome}',
  open: 'Ingrandisci: {alt}',
  viewer: 'Immagine ingrandita',
  close: 'Chiudi',
  previous: 'Immagine precedente',
  next: 'Immagine successiva',
  position: 'Immagine {n} di {total}',
  report: 'Segnala immagine',
  reportN: 'Segnala l’immagine {n}',
  removedOne: 'Un’immagine è stata rimossa dalla moderazione.',
  removedMany: '{n} immagini sono state rimosse dalla moderazione.',
  removedAttachment: 'Un allegato è stato rimosso dalla moderazione.',

}

const nl: GalleryTexts = {
  label: 'Toegevoegde afbeeldingen',
  genericAlt: 'Afbeelding geplaatst door {nome}',
  open: 'Vergroten: {alt}',
  viewer: 'Vergrote afbeelding',
  close: 'Sluiten',
  previous: 'Vorige afbeelding',
  next: 'Volgende afbeelding',
  position: 'Afbeelding {n} van {total}',
  report: 'Afbeelding melden',
  reportN: 'Afbeelding {n} melden',
  removedOne: 'Eén afbeelding is door de moderatie verwijderd.',
  removedMany: '{n} afbeeldingen zijn door de moderatie verwijderd.',
  removedAttachment: 'Een bijlage is door de moderatie verwijderd.',

}

const already: GalleryTexts = {
  label: '添付された画像',
  genericAlt: '{nome}さんが投稿した画像',
  open: '拡大：{alt}',
  viewer: '拡大した画像',
  close: '閉じる',
  previous: '前の画像',
  next: '次の画像',
  position: '画像 {n}/{total}',
  report: '画像を通報する',
  reportN: '画像{n}を通報する',
  removedOne: '画像1枚がモデレーションにより削除されました。',
  removedMany: '画像{n}枚がモデレーションにより削除されました。',
  removedAttachment: '添付ファイルがモデレーションにより削除されました。',

}

const ko: GalleryTexts = {
  label: '첨부된 이미지',
  genericAlt: '{nome} 님이 올린 이미지',
  open: '크게 보기: {alt}',
  viewer: '크게 본 이미지',
  close: '닫기',
  previous: '이전 이미지',
  next: '다음 이미지',
  position: '이미지 {n}/{total}',
  report: '이미지 신고',
  reportN: '{n}번 이미지 신고',
  removedOne: '이미지 1장이 운영진에 의해 삭제되었습니다.',
  removedMany: '이미지 {n}장이 운영진에 의해 삭제되었습니다.',
  removedAttachment: '첨부 파일이 운영진에 의해 삭제되었습니다.',

}

const zh: GalleryTexts = {
  label: '附带的图片',
  genericAlt: '{nome}发布的图片',
  open: '放大：{alt}',
  viewer: '放大的图片',
  close: '关闭',
  previous: '上一张图片',
  next: '下一张图片',
  position: '第 {n} 张，共 {total} 张',
  report: '举报图片',
  reportN: '举报第 {n} 张图片',
  removedOne: '有一张图片已被审核人员移除。',
  removedMany: '有 {n} 张图片已被审核人员移除。',
  removedAttachment: '有一个附件已被审核人员移除。',

}

const ru: GalleryTexts = {
  label: 'Прикреплённые изображения',
  genericAlt: 'Изображение, автор: {nome}',
  open: 'Увеличить: {alt}',
  viewer: 'Увеличенное изображение',
  close: 'Закрыть',
  previous: 'Предыдущее изображение',
  next: 'Следующее изображение',
  position: 'Изображение {n} из {total}',
  report: 'Пожаловаться на изображение',
  reportN: 'Пожаловаться на изображение {n}',
  removedOne: 'Одно изображение удалено модерацией.',
  removedMany: 'Модерация удалила изображения: {n}.',
  removedAttachment: 'Модерация удалила вложение.',

}

const ar: GalleryTexts = {
  label: 'الصور المرفقة',
  genericAlt: 'صورة نشرها {nome}',
  open: 'تكبير: {alt}',
  viewer: 'الصورة مكبّرة',
  close: 'إغلاق',
  previous: 'الصورة السابقة',
  next: 'الصورة التالية',
  position: 'الصورة {n} من {total}',
  report: 'الإبلاغ عن الصورة',
  reportN: 'الإبلاغ عن الصورة {n}',
  removedOne: 'أزال فريق الإشراف صورة واحدة.',
  removedMany: 'أزال فريق الإشراف {n} من الصور.',
  removedAttachment: 'أزال فريق الإشراف مرفقًا واحدًا.',

}

export const GALLERY_TEXTS: Record<Locale, GalleryTexts> = { pt, en, es, fr, de: from, it, nl, ja: already, ko, zh, ru, ar }
export const galleryTexts = (lang: Locale): GalleryTexts => GALLERY_TEXTS[lang]
