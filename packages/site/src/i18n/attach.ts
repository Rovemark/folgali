// Texts of the images a person attaches to what she publishes (protocol 0.11.0, `midia-livre`; owner decision of 25/11/2026: media
// is free): the composer (choose up to 4, describe, progress, what did not go), the gallery (generic name of an image with no
// description, enlarge, report, removed by moderation), the report page of an attachment, and the refusals that say how long is left.
// The 12 languages of the site, typed: a missing key in any language fails the typecheck. Kept apart from the big JSON packs so the
// client components carry only this.
import type { Locale } from '@/lib/i18n-base'
import { GALLERY_TEXTS, type GalleryTexts } from './attach-gallery'

export interface AttachTexts {
  composer: {
    attach: string
    attachHelp: string
    chosen: string
    remove: string
    altLabel: string
    altPlaceholder: string
    textRequired: string
    preparing: string
    uploading: string
    posting: string
    attaching: string
    uploadFailed: string
    partialOne: string
    partialMany: string
    retry: string
    retrying: string
    giveUp: string
    recovered: string
    errors: Record<'type' | 'big' | 'animated' | 'tooMany' | 'repeated' | 'broken' | 'tooHeavy' | 'altUrl', string>
  }
  gallery: GalleryTexts
  report: {
    reportedImage: string
    target: string
    targetPlain: string
  }
  refusals: {
    ratePosts: string
    rateImages: string
    ratePhotos: string
    young: string
    unlocksIn: string
    later: string
    quota: string
    refused: string
    structure: string
  }
}

const pt: AttachTexts = {
  composer: {
    attach: 'Anexar imagem',
    attachHelp: 'Até 4 imagens em JPEG, PNG ou WebP, de até 15 MB cada. Cada uma é reduzida no seu aparelho e sai sem os dados escondidos no arquivo.',
    chosen: 'Imagens escolhidas',
    remove: 'Tirar a imagem {n}',
    altLabel: 'Descrição da imagem {n} (opcional)',
    altPlaceholder: 'O que aparece na imagem',
    textRequired: 'Toda publicação precisa de texto. Escreva pelo menos uma palavra para ir com as imagens.',
    preparing: 'Preparando a imagem...',
    uploading: 'Enviando imagem {n} de {total}',
    posting: 'Publicando o texto',
    attaching: 'Anexando imagem {n} de {total}',
    uploadFailed: 'A imagem {n} não foi enviada, então nada foi publicado.',
    partialOne: 'A postagem foi publicada, mas a imagem {n} não entrou.',
    partialMany: 'A postagem foi publicada, mas estas imagens não entraram: {lista}.',
    retry: 'Tentar de novo',
    retrying: 'Tentando de novo...',
    giveUp: 'Deixar assim',
    recovered: 'As imagens que faltavam entraram.',
    errors: {
      type: 'Esse arquivo não é JPEG, PNG nem WebP.',
      big: 'A imagem passa de 15 MB.',
      animated: 'Imagem animada não entra. Escolha uma imagem parada.',
      tooMany: 'Cada publicação leva até 4 imagens. As que passaram disso ficaram de fora.',
      repeated: 'Essa imagem já está na lista.',
      broken: 'Não deu para abrir essa imagem. Tente outra.',
      tooHeavy: 'Essa imagem continua grande demais depois de reduzida. Tente outra.',
      altUrl: 'A descrição não pode ter endereço de site.',
    },
  },
  gallery: GALLERY_TEXTS.pt,
  report: {
    reportedImage: 'Imagem denunciada',
    target: 'Imagem publicada por @{de}',
    targetPlain: 'Imagem anexada a uma publicação',
  },
  refusals: {
    ratePosts: 'Você chegou ao limite de postagens.',
    rateImages: 'Você chegou ao limite de imagens.',
    ratePhotos: 'Você chegou ao limite de trocas de foto do perfil.',
    young: 'A sua conta ainda é nova para enviar imagens.',
    unlocksIn: 'Libera em {espera}.',
    later: 'Tente de novo mais tarde.',
    quota: 'A folgali está sem espaço para imagens agora. Tente mais tarde.',
    refused: 'Esta imagem foi removida pela moderação e não volta.',
    structure: 'Cada publicação leva até 4 imagens.',
  },
}

const en: AttachTexts = {
  composer: {
    attach: 'Attach image',
    attachHelp: 'Up to 4 images in JPEG, PNG or WebP, up to 15 MB each. Each one is reduced on your device and leaves without the data hidden in the file.',
    chosen: 'Chosen images',
    remove: 'Remove image {n}',
    altLabel: 'Description of image {n} (optional)',
    altPlaceholder: 'What the image shows',
    textRequired: 'Every post needs text. Write at least one word to go with the images.',
    preparing: 'Preparing the image...',
    uploading: 'Uploading image {n} of {total}',
    posting: 'Publishing the text',
    attaching: 'Attaching image {n} of {total}',
    uploadFailed: 'Image {n} was not uploaded, so nothing was published.',
    partialOne: 'The post was published, but image {n} did not go through.',
    partialMany: 'The post was published, but these images did not go through: {lista}.',
    retry: 'Try again',
    retrying: 'Trying again...',
    giveUp: 'Leave it as it is',
    recovered: 'The missing images went through.',
    errors: {
      type: 'This file is not JPEG, PNG or WebP.',
      big: 'The image is over 15 MB.',
      animated: 'Animated images are not accepted. Pick a still image.',
      tooMany: 'A post takes up to 4 images. The extra ones were left out.',
      repeated: 'This image is already on the list.',
      broken: 'This image could not be opened. Try another one.',
      tooHeavy: 'This image is still too large after being reduced. Try another one.',
      altUrl: 'The description cannot contain a web address.',
    },
  },
  gallery: GALLERY_TEXTS.en,
  report: {
    reportedImage: 'Reported image',
    target: 'Image posted by @{de}',
    targetPlain: 'Image attached to a post',
  },
  refusals: {
    ratePosts: 'You reached the post limit.',
    rateImages: 'You reached the image limit.',
    ratePhotos: 'You reached the limit of profile photo changes.',
    young: 'Your account is still too new to send images.',
    unlocksIn: 'It unlocks in {espera}.',
    later: 'Try again later.',
    quota: 'folgali is out of space for images right now. Try again later.',
    refused: 'This image was removed by moderation and cannot come back.',
    structure: 'A post takes up to 4 images.',
  },
}

const es: AttachTexts = {
  composer: {
    attach: 'Adjuntar imagen',
    attachHelp: 'Hasta 4 imágenes en JPEG, PNG o WebP, de hasta 15 MB cada una. Cada una se reduce en tu dispositivo y sale sin los datos ocultos en el archivo.',
    chosen: 'Imágenes elegidas',
    remove: 'Quitar la imagen {n}',
    altLabel: 'Descripción de la imagen {n} (opcional)',
    altPlaceholder: 'Qué se ve en la imagen',
    textRequired: 'Toda publicación necesita texto. Escribe al menos una palabra para acompañar las imágenes.',
    preparing: 'Preparando la imagen...',
    uploading: 'Subiendo imagen {n} de {total}',
    posting: 'Publicando el texto',
    attaching: 'Adjuntando imagen {n} de {total}',
    uploadFailed: 'La imagen {n} no se subió, así que no se publicó nada.',
    partialOne: 'La publicación salió, pero la imagen {n} no entró.',
    partialMany: 'La publicación salió, pero estas imágenes no entraron: {lista}.',
    retry: 'Intentar de nuevo',
    retrying: 'Intentando de nuevo...',
    giveUp: 'Dejarlo así',
    recovered: 'Las imágenes que faltaban ya entraron.',
    errors: {
      type: 'Este archivo no es JPEG, PNG ni WebP.',
      big: 'La imagen supera los 15 MB.',
      animated: 'No se aceptan imágenes animadas. Elige una imagen fija.',
      tooMany: 'Cada publicación admite hasta 4 imágenes. Las que sobraban quedaron fuera.',
      repeated: 'Esta imagen ya está en la lista.',
      broken: 'No se pudo abrir esta imagen. Prueba con otra.',
      tooHeavy: 'Esta imagen sigue siendo demasiado grande después de reducirla. Prueba con otra.',
      altUrl: 'La descripción no puede incluir una dirección web.',
    },
  },
  gallery: GALLERY_TEXTS.es,
  report: {
    reportedImage: 'Imagen denunciada',
    target: 'Imagen publicada por @{de}',
    targetPlain: 'Imagen adjunta a una publicación',
  },
  refusals: {
    ratePosts: 'Llegaste al límite de publicaciones.',
    rateImages: 'Llegaste al límite de imágenes.',
    ratePhotos: 'Llegaste al límite de cambios de foto de perfil.',
    young: 'Tu cuenta todavía es muy nueva para enviar imágenes.',
    unlocksIn: 'Se libera en {espera}.',
    later: 'Inténtalo más tarde.',
    quota: 'folgali se quedó sin espacio para imágenes por ahora. Inténtalo más tarde.',
    refused: 'La moderación retiró esta imagen y no puede volver.',
    structure: 'Cada publicación admite hasta 4 imágenes.',
  },
}

const fr: AttachTexts = {
  composer: {
    attach: 'Joindre une image',
    attachHelp: 'Jusqu’à 4 images en JPEG, PNG ou WebP, de 15 MB maximum chacune. Chaque image est réduite sur votre appareil et part sans les données cachées dans le fichier.',
    chosen: 'Images choisies',
    remove: 'Retirer l’image {n}',
    altLabel: 'Description de l’image {n} (facultatif)',
    altPlaceholder: 'Ce que montre l’image',
    textRequired: 'Toute publication a besoin d’un texte. Écrivez au moins un mot pour accompagner les images.',
    preparing: 'Préparation de l’image...',
    uploading: 'Envoi de l’image {n} sur {total}',
    posting: 'Publication du texte',
    attaching: 'Ajout de l’image {n} sur {total}',
    uploadFailed: 'L’image {n} n’a pas pu être envoyée, donc rien n’a été publié.',
    partialOne: 'La publication est en ligne, mais l’image {n} n’a pas été ajoutée.',
    partialMany: 'La publication est en ligne, mais ces images n’ont pas été ajoutées : {lista}.',
    retry: 'Réessayer',
    retrying: 'Nouvel essai...',
    giveUp: 'Laisser ainsi',
    recovered: 'Les images manquantes ont été ajoutées.',
    errors: {
      type: 'Ce fichier n’est ni en JPEG, ni en PNG, ni en WebP.',
      big: 'L’image dépasse 15 MB.',
      animated: 'Les images animées ne sont pas acceptées. Choisissez une image fixe.',
      tooMany: 'Une publication accepte jusqu’à 4 images. Celles en trop ont été laissées de côté.',
      repeated: 'Cette image est déjà dans la liste.',
      broken: 'Impossible d’ouvrir cette image. Essayez-en une autre.',
      tooHeavy: 'Cette image reste trop lourde une fois réduite. Essayez-en une autre.',
      altUrl: 'La description ne peut pas contenir d’adresse web.',
    },
  },
  gallery: GALLERY_TEXTS.fr,
  report: {
    reportedImage: 'Image signalée',
    target: 'Image publiée par @{de}',
    targetPlain: 'Image jointe à une publication',
  },
  refusals: {
    ratePosts: 'Vous avez atteint la limite de publications.',
    rateImages: 'Vous avez atteint la limite d’images.',
    ratePhotos: 'Vous avez atteint la limite de changements de photo de profil.',
    young: 'Votre compte est encore trop récent pour envoyer des images.',
    unlocksIn: 'Ce sera de nouveau possible dans {espera}.',
    later: 'Réessayez plus tard.',
    quota: 'folgali n’a plus de place pour les images pour le moment. Réessayez plus tard.',
    refused: 'Cette image a été retirée par la modération et ne peut pas revenir.',
    structure: 'Une publication accepte jusqu’à 4 images.',
  },
}

const from: AttachTexts = {
  composer: {
    attach: 'Bild anhängen',
    attachHelp: 'Bis zu 4 Bilder in JPEG, PNG oder WebP, jeweils bis 15 MB. Jedes Bild wird auf deinem Gerät verkleinert und geht ohne die in der Datei versteckten Daten raus.',
    chosen: 'Ausgewählte Bilder',
    remove: 'Bild {n} entfernen',
    altLabel: 'Beschreibung von Bild {n} (optional)',
    altPlaceholder: 'Was auf dem Bild zu sehen ist',
    textRequired: 'Jeder Beitrag braucht Text. Schreib mindestens ein Wort zu den Bildern.',
    preparing: 'Bild wird vorbereitet...',
    uploading: 'Bild {n} von {total} wird hochgeladen',
    posting: 'Text wird veröffentlicht',
    attaching: 'Bild {n} von {total} wird angehängt',
    uploadFailed: 'Bild {n} wurde nicht hochgeladen, deshalb wurde nichts veröffentlicht.',
    partialOne: 'Der Beitrag ist veröffentlicht, aber Bild {n} ist nicht dabei.',
    partialMany: 'Der Beitrag ist veröffentlicht, aber diese Bilder sind nicht dabei: {lista}.',
    retry: 'Noch einmal versuchen',
    retrying: 'Neuer Versuch...',
    giveUp: 'So lassen',
    recovered: 'Die fehlenden Bilder sind jetzt dabei.',
    errors: {
      type: 'Diese Datei ist weder JPEG noch PNG noch WebP.',
      big: 'Das Bild ist größer als 15 MB.',
      animated: 'Animierte Bilder sind nicht erlaubt. Wähle ein Standbild.',
      tooMany: 'Ein Beitrag fasst bis zu 4 Bilder. Die überzähligen wurden weggelassen.',
      repeated: 'Dieses Bild ist schon in der Liste.',
      broken: 'Dieses Bild ließ sich nicht öffnen. Versuch ein anderes.',
      tooHeavy: 'Dieses Bild ist auch verkleinert noch zu groß. Versuch ein anderes.',
      altUrl: 'Die Beschreibung darf keine Webadresse enthalten.',
    },
  },
  gallery: GALLERY_TEXTS.de,
  report: {
    reportedImage: 'Gemeldetes Bild',
    target: 'Bild, veröffentlicht von @{de}',
    targetPlain: 'Bild, das an einem Beitrag hängt',
  },
  refusals: {
    ratePosts: 'Du hast das Limit für Beiträge erreicht.',
    rateImages: 'Du hast das Limit für Bilder erreicht.',
    ratePhotos: 'Du hast das Limit für Profilfoto-Wechsel erreicht.',
    young: 'Dein Konto ist noch zu neu, um Bilder zu senden.',
    unlocksIn: 'Noch {espera}, dann geht es wieder.',
    later: 'Versuch es später noch einmal.',
    quota: 'folgali hat gerade keinen Platz mehr für Bilder. Versuch es später noch einmal.',
    refused: 'Dieses Bild wurde von der Moderation entfernt und kommt nicht zurück.',
    structure: 'Ein Beitrag fasst bis zu 4 Bilder.',
  },
}

const it: AttachTexts = {
  composer: {
    attach: 'Allega immagine',
    attachHelp: 'Fino a 4 immagini in JPEG, PNG o WebP, di 15 MB al massimo ciascuna. Ogni immagine viene ridotta sul tuo dispositivo e parte senza i dati nascosti nel file.',
    chosen: 'Immagini scelte',
    remove: 'Togli l’immagine {n}',
    altLabel: 'Descrizione dell’immagine {n} (facoltativa)',
    altPlaceholder: 'Che cosa si vede nell’immagine',
    textRequired: 'Ogni pubblicazione ha bisogno di testo. Scrivi almeno una parola da abbinare alle immagini.',
    preparing: 'Preparazione dell’immagine...',
    uploading: 'Caricamento dell’immagine {n} di {total}',
    posting: 'Pubblicazione del testo',
    attaching: 'Aggiunta dell’immagine {n} di {total}',
    uploadFailed: 'L’immagine {n} non è stata caricata, quindi non è stato pubblicato nulla.',
    partialOne: 'Il post è stato pubblicato, ma l’immagine {n} non è entrata.',
    partialMany: 'Il post è stato pubblicato, ma queste immagini non sono entrate: {lista}.',
    retry: 'Riprova',
    retrying: 'Nuovo tentativo...',
    giveUp: 'Lascia così',
    recovered: 'Le immagini mancanti sono entrate.',
    errors: {
      type: 'Questo file non è JPEG, PNG né WebP.',
      big: 'L’immagine supera i 15 MB.',
      animated: 'Le immagini animate non sono accettate. Scegli un’immagine statica.',
      tooMany: 'Ogni pubblicazione accetta fino a 4 immagini. Quelle in più sono rimaste fuori.',
      repeated: 'Questa immagine è già nell’elenco.',
      broken: 'Non è stato possibile aprire questa immagine. Provane un’altra.',
      tooHeavy: 'Questa immagine resta troppo pesante anche dopo la riduzione. Provane un’altra.',
      altUrl: 'La descrizione non può contenere un indirizzo web.',
    },
  },
  gallery: GALLERY_TEXTS.it,
  report: {
    reportedImage: 'Immagine segnalata',
    target: 'Immagine pubblicata da @{de}',
    targetPlain: 'Immagine allegata a una pubblicazione',
  },
  refusals: {
    ratePosts: 'Hai raggiunto il limite di post.',
    rateImages: 'Hai raggiunto il limite di immagini.',
    ratePhotos: 'Hai raggiunto il limite di cambi della foto del profilo.',
    young: 'Il tuo account è ancora troppo nuovo per inviare immagini.',
    unlocksIn: 'Si sblocca tra {espera}.',
    later: 'Riprova più tardi.',
    quota: 'folgali non ha più spazio per le immagini in questo momento. Riprova più tardi.',
    refused: 'Questa immagine è stata rimossa dalla moderazione e non può tornare.',
    structure: 'Ogni pubblicazione accetta fino a 4 immagini.',
  },
}

const nl: AttachTexts = {
  composer: {
    attach: 'Afbeelding toevoegen',
    attachHelp: 'Maximaal 4 afbeeldingen in JPEG, PNG of WebP, elk tot 15 MB. Elke afbeelding wordt op je apparaat verkleind en gaat weg zonder de gegevens die in het bestand verborgen zitten.',
    chosen: 'Gekozen afbeeldingen',
    remove: 'Afbeelding {n} weghalen',
    altLabel: 'Beschrijving van afbeelding {n} (optioneel)',
    altPlaceholder: 'Wat er op de afbeelding staat',
    textRequired: 'Elk bericht heeft tekst nodig. Schrijf minstens één woord bij de afbeeldingen.',
    preparing: 'Afbeelding wordt voorbereid...',
    uploading: 'Afbeelding {n} van {total} wordt geüpload',
    posting: 'Tekst wordt geplaatst',
    attaching: 'Afbeelding {n} van {total} wordt toegevoegd',
    uploadFailed: 'Afbeelding {n} is niet geüpload, dus er is niets geplaatst.',
    partialOne: 'Het bericht is geplaatst, maar afbeelding {n} is niet meegekomen.',
    partialMany: 'Het bericht is geplaatst, maar deze afbeeldingen zijn niet meegekomen: {lista}.',
    retry: 'Opnieuw proberen',
    retrying: 'Nieuwe poging...',
    giveUp: 'Zo laten',
    recovered: 'De ontbrekende afbeeldingen zijn toegevoegd.',
    errors: {
      type: 'Dit bestand is geen JPEG, PNG of WebP.',
      big: 'De afbeelding is groter dan 15 MB.',
      animated: 'Bewegende afbeeldingen worden niet geaccepteerd. Kies een stilstaande afbeelding.',
      tooMany: 'Een bericht kan maximaal 4 afbeeldingen hebben. De rest is weggelaten.',
      repeated: 'Deze afbeelding staat al in de lijst.',
      broken: 'Deze afbeelding kon niet worden geopend. Probeer een andere.',
      tooHeavy: 'Deze afbeelding is na het verkleinen nog steeds te groot. Probeer een andere.',
      altUrl: 'De beschrijving mag geen webadres bevatten.',
    },
  },
  gallery: GALLERY_TEXTS.nl,
  report: {
    reportedImage: 'Gemelde afbeelding',
    target: 'Afbeelding geplaatst door @{de}',
    targetPlain: 'Afbeelding bij een bericht',
  },
  refusals: {
    ratePosts: 'Je hebt de limiet voor berichten bereikt.',
    rateImages: 'Je hebt de limiet voor afbeeldingen bereikt.',
    ratePhotos: 'Je hebt de limiet voor het wisselen van je profielfoto bereikt.',
    young: 'Je account is nog te nieuw om afbeeldingen te versturen.',
    unlocksIn: 'Het kan weer over {espera}.',
    later: 'Probeer het later opnieuw.',
    quota: 'folgali heeft nu geen ruimte meer voor afbeeldingen. Probeer het later opnieuw.',
    refused: 'Deze afbeelding is door de moderatie verwijderd en komt niet terug.',
    structure: 'Een bericht kan maximaal 4 afbeeldingen hebben.',
  },
}

const already: AttachTexts = {
  composer: {
    attach: '画像を添付',
    attachHelp: 'JPEG、PNG、WebPの画像を4枚まで、各15 MBまで。画像はお使いの端末で縮小され、ファイルに埋め込まれた情報を除いて送信されます。',
    chosen: '選んだ画像',
    remove: '画像{n}を外す',
    altLabel: '画像{n}の説明（任意）',
    altPlaceholder: '画像に写っているもの',
    textRequired: '投稿には文章が必要です。画像に添える言葉を少なくともひとこと書いてください。',
    preparing: '画像を準備しています...',
    uploading: '画像をアップロードしています（{n}/{total}）',
    posting: '文章を投稿しています',
    attaching: '画像を添付しています（{n}/{total}）',
    uploadFailed: '画像{n}をアップロードできなかったため、何も投稿されていません。',
    partialOne: '投稿は公開されましたが、画像{n}は添付されませんでした。',
    partialMany: '投稿は公開されましたが、次の画像は添付されませんでした：{lista}。',
    retry: 'もう一度試す',
    retrying: 'もう一度試しています...',
    giveUp: 'このままにする',
    recovered: '残りの画像が添付されました。',
    errors: {
      type: 'このファイルはJPEG、PNG、WebPのいずれでもありません。',
      big: '画像が15 MBを超えています。',
      animated: 'アニメーション画像は使えません。静止画を選んでください。',
      tooMany: 'ひとつの投稿に添付できる画像は4枚までです。超えた分は追加されませんでした。',
      repeated: 'この画像はすでに一覧にあります。',
      broken: 'この画像を開けませんでした。別の画像をお試しください。',
      tooHeavy: 'この画像は縮小しても大きすぎます。別の画像をお試しください。',
      altUrl: '説明にウェブアドレスは入れられません。',
    },
  },
  gallery: GALLERY_TEXTS.ja,
  report: {
    reportedImage: '通報する画像',
    target: '@{de}が投稿した画像',
    targetPlain: '投稿に添付された画像',
  },
  refusals: {
    ratePosts: '投稿数の上限に達しました。',
    rateImages: '画像の上限に達しました。',
    ratePhotos: 'プロフィール写真の変更回数の上限に達しました。',
    young: 'アカウントを作成したばかりのため、まだ画像を送信できません。',
    unlocksIn: 'あと{espera}で再び利用できます。',
    later: 'しばらくしてからもう一度お試しください。',
    quota: 'folgaliは現在、画像を保存する空きがありません。しばらくしてからもう一度お試しください。',
    refused: 'この画像はモデレーションにより削除されており、再び投稿することはできません。',
    structure: 'ひとつの投稿に添付できる画像は4枚までです。',
  },
}

const ko: AttachTexts = {
  composer: {
    attach: '이미지 첨부',
    attachHelp: 'JPEG, PNG 또는 WebP 이미지를 최대 4장, 한 장에 최대 15 MB까지 올릴 수 있습니다. 이미지는 기기에서 크기가 줄어들고, 파일에 숨은 정보는 빠진 채로 전송됩니다.',
    chosen: '고른 이미지',
    remove: '{n}번 이미지 빼기',
    altLabel: '{n}번 이미지 설명(선택)',
    altPlaceholder: '이미지에 보이는 내용',
    textRequired: '모든 게시물에는 글이 필요합니다. 이미지와 함께 올릴 말을 한 단어 이상 적어 주세요.',
    preparing: '이미지를 준비하는 중...',
    uploading: '이미지 올리는 중({n}/{total})',
    posting: '글을 게시하는 중',
    attaching: '이미지 첨부하는 중({n}/{total})',
    uploadFailed: '{n}번 이미지를 올리지 못해서 아무것도 게시되지 않았습니다.',
    partialOne: '게시물은 올라갔지만 {n}번 이미지는 첨부되지 않았습니다.',
    partialMany: '게시물은 올라갔지만 다음 이미지는 첨부되지 않았습니다: {lista}.',
    retry: '다시 시도',
    retrying: '다시 시도하는 중...',
    giveUp: '이대로 두기',
    recovered: '빠졌던 이미지가 첨부되었습니다.',
    errors: {
      type: '이 파일은 JPEG, PNG, WebP 형식이 아닙니다.',
      big: '이미지가 15 MB를 넘습니다.',
      animated: '움직이는 이미지는 올릴 수 없습니다. 정지된 이미지를 고르세요.',
      tooMany: '게시물 하나에 이미지는 최대 4장입니다. 넘치는 이미지는 빠졌습니다.',
      repeated: '이 이미지는 이미 목록에 있습니다.',
      broken: '이 이미지를 열 수 없습니다. 다른 이미지를 사용해 보세요.',
      tooHeavy: '이 이미지는 줄인 뒤에도 너무 큽니다. 다른 이미지를 사용해 보세요.',
      altUrl: '설명에는 웹 주소를 넣을 수 없습니다.',
    },
  },
  gallery: GALLERY_TEXTS.ko,
  report: {
    reportedImage: '신고할 이미지',
    target: '@{de} 님이 올린 이미지',
    targetPlain: '게시물에 첨부된 이미지',
  },
  refusals: {
    ratePosts: '게시물 한도에 도달했습니다.',
    rateImages: '이미지 한도에 도달했습니다.',
    ratePhotos: '프로필 사진 변경 한도에 도달했습니다.',
    young: '계정을 만든 지 얼마 되지 않아 아직 이미지를 보낼 수 없습니다.',
    unlocksIn: '{espera} 뒤에 다시 가능합니다.',
    later: '나중에 다시 시도하세요.',
    quota: 'folgali에 지금 이미지를 저장할 공간이 없습니다. 나중에 다시 시도하세요.',
    refused: '이 이미지는 운영진이 삭제했으며 다시 올릴 수 없습니다.',
    structure: '게시물 하나에 이미지는 최대 4장입니다.',
  },
}

const zh: AttachTexts = {
  composer: {
    attach: '添加图片',
    attachHelp: '最多 4 张 JPEG、PNG 或 WebP 图片，每张不超过 15 MB。每张图片会先在你的设备上缩小，并去掉文件里隐藏的数据再发出。',
    chosen: '已选图片',
    remove: '移除第 {n} 张图片',
    altLabel: '第 {n} 张图片的描述（可选）',
    altPlaceholder: '图片里有什么',
    textRequired: '每条动态都需要文字。请至少写一个词来配这些图片。',
    preparing: '正在处理图片...',
    uploading: '正在上传第 {n} 张图片，共 {total} 张',
    posting: '正在发布文字',
    attaching: '正在添加第 {n} 张图片，共 {total} 张',
    uploadFailed: '第 {n} 张图片没有上传成功，所以什么都没有发布。',
    partialOne: '动态已发布，但第 {n} 张图片没有添加上。',
    partialMany: '动态已发布，但这些图片没有添加上：{lista}。',
    retry: '重试',
    retrying: '正在重试...',
    giveUp: '就这样',
    recovered: '缺少的图片已经添加上了。',
    errors: {
      type: '这个文件不是 JPEG、PNG 或 WebP 格式。',
      big: '图片超过了 15 MB。',
      animated: '不支持动图。请选择一张静态图片。',
      tooMany: '每条动态最多 4 张图片。多出的图片没有加入。',
      repeated: '这张图片已经在列表里了。',
      broken: '无法打开这张图片。请换一张试试。',
      tooHeavy: '这张图片缩小后仍然太大。请换一张试试。',
      altUrl: '描述里不能有网址。',
    },
  },
  gallery: GALLERY_TEXTS.zh,
  report: {
    reportedImage: '被举报的图片',
    target: '@{de}发布的图片',
    targetPlain: '动态里附带的图片',
  },
  refusals: {
    ratePosts: '你已达到发布数量上限。',
    rateImages: '你已达到图片数量上限。',
    ratePhotos: '你已达到更换头像的次数上限。',
    young: '你的账号还太新，暂时不能发送图片。',
    unlocksIn: '{espera}后可以继续。',
    later: '请稍后再试。',
    quota: 'folgali 目前没有存放图片的空间了。请稍后再试。',
    refused: '这张图片已被审核人员移除，不能再次发布。',
    structure: '每条动态最多 4 张图片。',
  },
}

const ru: AttachTexts = {
  composer: {
    attach: 'Прикрепить изображение',
    attachHelp: 'До 4 изображений в JPEG, PNG или WebP, каждое до 15 MB. Каждое уменьшается на вашем устройстве и уходит без данных, скрытых в файле.',
    chosen: 'Выбранные изображения',
    remove: 'Убрать изображение {n}',
    altLabel: 'Описание изображения {n} (необязательно)',
    altPlaceholder: 'Что видно на изображении',
    textRequired: 'Каждой публикации нужен текст. Напишите хотя бы одно слово к изображениям.',
    preparing: 'Готовим изображение...',
    uploading: 'Загружаем изображение {n} из {total}',
    posting: 'Публикуем текст',
    attaching: 'Прикрепляем изображение {n} из {total}',
    uploadFailed: 'Изображение {n} не загрузилось, поэтому ничего не опубликовано.',
    partialOne: 'Публикация вышла, но изображение {n} не прикрепилось.',
    partialMany: 'Публикация вышла, но эти изображения не прикрепились: {lista}.',
    retry: 'Попробовать снова',
    retrying: 'Пробуем снова...',
    giveUp: 'Оставить как есть',
    recovered: 'Недостающие изображения прикреплены.',
    errors: {
      type: 'Этот файл не в формате JPEG, PNG или WebP.',
      big: 'Изображение больше 15 MB.',
      animated: 'Анимированные изображения не принимаются. Выберите обычное изображение.',
      tooMany: 'К одной публикации можно прикрепить до 4 изображений. Лишние не добавлены.',
      repeated: 'Это изображение уже есть в списке.',
      broken: 'Не удалось открыть это изображение. Попробуйте другое.',
      tooHeavy: 'Это изображение слишком большое даже после уменьшения. Попробуйте другое.',
      altUrl: 'В описании не должно быть адреса сайта.',
    },
  },
  gallery: GALLERY_TEXTS.ru,
  report: {
    reportedImage: 'Изображение, на которое жалуются',
    target: 'Изображение, автор: @{de}',
    targetPlain: 'Изображение, прикреплённое к публикации',
  },
  refusals: {
    ratePosts: 'Вы достигли лимита публикаций.',
    rateImages: 'Вы достигли лимита изображений.',
    ratePhotos: 'Вы достигли лимита смены фото профиля.',
    young: 'Ваш аккаунт ещё слишком новый, чтобы отправлять изображения.',
    unlocksIn: 'Осталось подождать: {espera}.',
    later: 'Попробуйте позже.',
    quota: 'На folgali сейчас нет места для изображений. Попробуйте позже.',
    refused: 'Это изображение удалено модерацией и вернуть его нельзя.',
    structure: 'К одной публикации можно прикрепить до 4 изображений.',
  },
}

const ar: AttachTexts = {
  composer: {
    attach: 'إرفاق صورة',
    attachHelp: 'حتى 4 صور بصيغة JPEG أو PNG أو WebP، وكل صورة حتى 15 MB. تُصغَّر كل صورة على جهازك وتُرسل من دون البيانات المخفية في الملف.',
    chosen: 'الصور المختارة',
    remove: 'إزالة الصورة {n}',
    altLabel: 'وصف الصورة {n} (اختياري)',
    altPlaceholder: 'ما الذي يظهر في الصورة',
    textRequired: 'كل منشور يحتاج إلى نص. اكتب كلمة واحدة على الأقل لترافق الصور.',
    preparing: 'جارٍ تجهيز الصورة...',
    uploading: 'جارٍ رفع الصورة {n} من {total}',
    posting: 'جارٍ نشر النص',
    attaching: 'جارٍ إرفاق الصورة {n} من {total}',
    uploadFailed: 'لم تُرفع الصورة {n}، لذلك لم يُنشر شيء.',
    partialOne: 'نُشر المنشور، لكن الصورة {n} لم تُرفق.',
    partialMany: 'نُشر المنشور، لكن هذه الصور لم تُرفق: {lista}.',
    retry: 'حاول مرة أخرى',
    retrying: 'جارٍ إعادة المحاولة...',
    giveUp: 'اتركه كما هو',
    recovered: 'أُرفقت الصور الناقصة.',
    errors: {
      type: 'هذا الملف ليس بصيغة JPEG أو PNG أو WebP.',
      big: 'حجم الصورة يتجاوز 15 MB.',
      animated: 'الصور المتحركة غير مقبولة. اختر صورة ثابتة.',
      tooMany: 'يقبل كل منشور حتى 4 صور. الصور الزائدة لم تُضف.',
      repeated: 'هذه الصورة موجودة في القائمة بالفعل.',
      broken: 'تعذّر فتح هذه الصورة. جرّب صورة أخرى.',
      tooHeavy: 'ما زالت هذه الصورة كبيرة جدًا بعد تصغيرها. جرّب صورة أخرى.',
      altUrl: 'لا يمكن أن يحتوي الوصف على عنوان موقع.',
    },
  },
  gallery: GALLERY_TEXTS.ar,
  report: {
    reportedImage: 'الصورة المُبلَّغ عنها',
    target: 'صورة نشرها @{de}',
    targetPlain: 'صورة مرفقة بمنشور',
  },
  refusals: {
    ratePosts: 'وصلت إلى الحد الأقصى للمنشورات.',
    rateImages: 'وصلت إلى الحد الأقصى للصور.',
    ratePhotos: 'وصلت إلى الحد الأقصى لتغيير صورة الملف الشخصي.',
    young: 'حسابك ما زال جديدًا على إرسال الصور.',
    unlocksIn: 'الوقت المتبقي: {espera}.',
    later: 'حاول مرة أخرى لاحقًا.',
    quota: 'لا توجد مساحة للصور على folgali الآن. حاول مرة أخرى لاحقًا.',
    refused: 'أزال فريق الإشراف هذه الصورة ولا يمكن إعادتها.',
    structure: 'يقبل كل منشور حتى 4 صور.',
  },
}

export const ATTACH_TEXTS: Record<Locale, AttachTexts> = { pt, en, es, fr, de: from, it, nl, ja: already, ko, zh, ru, ar }
export const attachTexts = (lang: Locale): AttachTexts => ATTACH_TEXTS[lang]
