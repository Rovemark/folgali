// The short texts of the micro-interactions (reactions, follow, notices, moments), in the 12 languages of the house. They live here, and not in the i18n JSON
// files, so the life front does not fight with the texts one; whoever integrates can move them to the packages later. No em dash.
import { DEFAULT, type Locale } from '@/lib/i18n-base'

export type Reaction = 'curtir' | 'amei' | 'haha' | 'uau' | 'abraco'
export const REACTIONS: readonly Reaction[] = ['curtir', 'amei', 'haha', 'uau', 'abraco']

export type LifeTexts = {
  reacoes: Record<Reaction, string>
  escolherReacao: string
  reagiu: string
  tirouReacao: string
  deixarDeSeguir: string
  seguiu: string
  deixouDeSeguir: string
  novasPostagens: string
  chegaramNovas: string
  digitando: string
  pausar: string
  continuar: string
  ligado: string
  desligado: string
  fechar: string
  carregando: string
  /** 0.8.0: reacting on a real post needs the Rovemark account (and a profile on folgali) */
  entrarParaReagir: string
  /** 0.8.0: the relay did not take the reaction */
  reacaoNaoGravou: string
  /** 0.8.0: screen reader label of the per type counts of a post ({lista} = "Curtir 3, Amei 1") */
  porTipo: string
}

const T: Record<Locale, LifeTexts> = {
  pt: {
    reacoes: { curtir: 'Curtir', amei: 'Amei', haha: 'Haha', uau: 'Uau', abraco: 'Abraço' },
    escolherReacao: 'Escolher reação', reagiu: 'Você reagiu com {r}', tirouReacao: 'Reação retirada',
    deixarDeSeguir: 'Deixar de seguir', seguiu: 'Você está seguindo', deixouDeSeguir: 'Você deixou de seguir',
    novasPostagens: 'Novas postagens', chegaramNovas: 'Chegaram postagens novas', digitando: '{nome} está digitando',
    pausar: 'Pausar', continuar: 'Continuar', ligado: 'ligado', desligado: 'desligado', fechar: 'Fechar', carregando: 'Carregando o feed',
    entrarParaReagir: 'Entre com a sua conta e crie o seu perfil para reagir.', reacaoNaoGravou: 'A reação não foi gravada. Tente de novo.', porTipo: 'Reações: {lista}',
  },
  en: {
    reacoes: { curtir: 'Like', amei: 'Love', haha: 'Haha', uau: 'Wow', abraco: 'Hug' },
    escolherReacao: 'Choose a reaction', reagiu: 'You reacted with {r}', tirouReacao: 'Reaction removed',
    deixarDeSeguir: 'Unfollow', seguiu: 'You are following', deixouDeSeguir: 'You unfollowed',
    novasPostagens: 'New posts', chegaramNovas: 'New posts arrived', digitando: '{nome} is typing',
    pausar: 'Pause', continuar: 'Play', ligado: 'on', desligado: 'off', fechar: 'Close', carregando: 'Loading the feed',
    entrarParaReagir: 'Sign in with your account and create your profile to react.', reacaoNaoGravou: 'The reaction was not saved. Try again.', porTipo: 'Reactions: {lista}',
  },
  es: {
    reacoes: { curtir: 'Me gusta', amei: 'Me encanta', haha: 'Jaja', uau: 'Guau', abraco: 'Abrazo' },
    escolherReacao: 'Elegir reacción', reagiu: 'Reaccionaste con {r}', tirouReacao: 'Reacción quitada',
    deixarDeSeguir: 'Dejar de seguir', seguiu: 'Ahora sigues', deixouDeSeguir: 'Dejaste de seguir',
    novasPostagens: 'Publicaciones nuevas', chegaramNovas: 'Llegaron publicaciones nuevas', digitando: '{nome} está escribiendo',
    pausar: 'Pausar', continuar: 'Continuar', ligado: 'activado', desligado: 'desactivado', fechar: 'Cerrar', carregando: 'Cargando el feed',
    entrarParaReagir: 'Entra con tu cuenta y crea tu perfil para reaccionar.', reacaoNaoGravou: 'La reacción no se guardó. Inténtalo de nuevo.', porTipo: 'Reacciones: {lista}',
  },
  fr: {
    reacoes: { curtir: "J'aime", amei: "J'adore", haha: 'Haha', uau: 'Waouh', abraco: 'Câlin' },
    escolherReacao: 'Choisir une réaction', reagiu: 'Vous avez réagi : {r}', tirouReacao: 'Réaction retirée',
    deixarDeSeguir: 'Ne plus suivre', seguiu: 'Vous suivez maintenant', deixouDeSeguir: 'Vous ne suivez plus',
    novasPostagens: 'Nouvelles publications', chegaramNovas: 'De nouvelles publications sont arrivées', digitando: "{nome} est en train d'écrire",
    pausar: 'Pause', continuar: 'Reprendre', ligado: 'activé', desligado: 'désactivé', fechar: 'Fermer', carregando: 'Chargement du fil',
    entrarParaReagir: 'Connectez-vous avec votre compte et créez votre profil pour réagir.', reacaoNaoGravou: 'La réaction n\'a pas été enregistrée. Réessayez.', porTipo: 'Réactions : {lista}',
  },
  de: {
    reacoes: { curtir: 'Gefällt mir', amei: 'Liebe ich', haha: 'Haha', uau: 'Wow', abraco: 'Umarmung' },
    escolherReacao: 'Reaktion wählen', reagiu: 'Du hast mit {r} reagiert', tirouReacao: 'Reaktion entfernt',
    deixarDeSeguir: 'Nicht mehr folgen', seguiu: 'Du folgst jetzt', deixouDeSeguir: 'Du folgst nicht mehr',
    novasPostagens: 'Neue Beiträge', chegaramNovas: 'Neue Beiträge sind da', digitando: '{nome} schreibt gerade',
    pausar: 'Pausieren', continuar: 'Fortsetzen', ligado: 'an', desligado: 'aus', fechar: 'Schließen', carregando: 'Feed wird geladen',
    entrarParaReagir: 'Melde dich mit deinem Konto an und erstelle dein Profil, um zu reagieren.', reacaoNaoGravou: 'Die Reaktion wurde nicht gespeichert. Versuch es noch einmal.', porTipo: 'Reaktionen: {lista}',
  },
  it: {
    reacoes: { curtir: 'Mi piace', amei: 'Love', haha: 'Ahah', uau: 'Wow', abraco: 'Abbraccio' },
    escolherReacao: 'Scegli una reazione', reagiu: 'Hai reagito con {r}', tirouReacao: 'Reazione tolta',
    deixarDeSeguir: 'Non seguire più', seguiu: 'Ora segui', deixouDeSeguir: 'Non segui più',
    novasPostagens: 'Nuovi post', chegaramNovas: 'Sono arrivati nuovi post', digitando: '{nome} sta scrivendo',
    pausar: 'Pausa', continuar: 'Riprendi', ligado: 'attivo', desligado: 'disattivo', fechar: 'Chiudi', carregando: 'Caricamento del feed',
    entrarParaReagir: 'Accedi con il tuo account e crea il tuo profilo per reagire.', reacaoNaoGravou: 'La reazione non è stata salvata. Riprova.', porTipo: 'Reazioni: {lista}',
  },
  nl: {
    reacoes: { curtir: 'Leuk', amei: 'Geweldig', haha: 'Haha', uau: 'Wauw', abraco: 'Knuffel' },
    escolherReacao: 'Kies een reactie', reagiu: 'Je reageerde met {r}', tirouReacao: 'Reactie weggehaald',
    deixarDeSeguir: 'Ontvolgen', seguiu: 'Je volgt nu', deixouDeSeguir: 'Je volgt niet meer',
    novasPostagens: 'Nieuwe berichten', chegaramNovas: 'Er zijn nieuwe berichten', digitando: '{nome} is aan het typen',
    pausar: 'Pauzeren', continuar: 'Verder', ligado: 'aan', desligado: 'uit', fechar: 'Sluiten', carregando: 'Feed laden',
    entrarParaReagir: 'Log in met je account en maak je profiel aan om te reageren.', reacaoNaoGravou: 'De reactie is niet opgeslagen. Probeer het opnieuw.', porTipo: 'Reacties: {lista}',
  },
  ru: {
    reacoes: { curtir: 'Нравится', amei: 'Супер', haha: 'Ха-ха', uau: 'Ух ты', abraco: 'Обнимаю' },
    escolherReacao: 'Выбрать реакцию', reagiu: 'Ваша реакция: {r}', tirouReacao: 'Реакция убрана',
    deixarDeSeguir: 'Отписаться', seguiu: 'Вы подписались', deixouDeSeguir: 'Вы отписались',
    novasPostagens: 'Новые публикации', chegaramNovas: 'Появились новые публикации', digitando: '{nome} печатает',
    pausar: 'Пауза', continuar: 'Продолжить', ligado: 'включено', desligado: 'выключено', fechar: 'Закрыть', carregando: 'Загружаем ленту',
    entrarParaReagir: 'Войдите в свой аккаунт и создайте профиль, чтобы реагировать.', reacaoNaoGravou: 'Реакция не сохранилась. Попробуйте ещё раз.', porTipo: 'Реакции: {lista}',
  },
  ar: {
    reacoes: { curtir: 'أعجبني', amei: 'أحببته', haha: 'هاها', uau: 'واو', abraco: 'عناق' },
    escolherReacao: 'اختر تفاعلًا', reagiu: 'تفاعلت بـ {r}', tirouReacao: 'أُزيل التفاعل',
    deixarDeSeguir: 'إلغاء المتابعة', seguiu: 'أنت تتابع الآن', deixouDeSeguir: 'ألغيت المتابعة',
    novasPostagens: 'منشورات جديدة', chegaramNovas: 'وصلت منشورات جديدة', digitando: '{nome} يكتب الآن',
    pausar: 'إيقاف مؤقت', continuar: 'متابعة', ligado: 'مفعّل', desligado: 'متوقف', fechar: 'إغلاق', carregando: 'جارٍ تحميل الموجز',
    entrarParaReagir: 'سجّل الدخول بحسابك وأنشئ ملفك الشخصي لتتفاعل.', reacaoNaoGravou: 'لم يُحفظ التفاعل. حاول مرة أخرى.', porTipo: 'التفاعلات: {lista}',
  },
  zh: {
    reacoes: { curtir: '赞', amei: '喜欢', haha: '哈哈', uau: '哇', abraco: '抱抱' },
    escolherReacao: '选择表情', reagiu: '你的回应：{r}', tirouReacao: '已取消回应',
    deixarDeSeguir: '取消关注', seguiu: '已关注', deixouDeSeguir: '已取消关注',
    novasPostagens: '新帖子', chegaramNovas: '有新帖子', digitando: '{nome} 正在输入',
    pausar: '暂停', continuar: '继续', ligado: '开', desligado: '关', fechar: '关闭', carregando: '正在加载动态',
    entrarParaReagir: '请用你的账号登录并创建个人资料后再做回应。', reacaoNaoGravou: '回应没有保存成功，请再试一次。', porTipo: '回应：{lista}',
  },
  ja: {
    reacoes: { curtir: 'いいね', amei: '超いいね', haha: '笑', uau: 'すごい', abraco: 'ぎゅっ' },
    escolherReacao: 'リアクションを選ぶ', reagiu: '{r} でリアクションしました', tirouReacao: 'リアクションを取り消しました',
    deixarDeSeguir: 'フォローをやめる', seguiu: 'フォローしました', deixouDeSeguir: 'フォローをやめました',
    novasPostagens: '新しい投稿', chegaramNovas: '新しい投稿があります', digitando: '{nome}が入力中',
    pausar: '一時停止', continuar: '再開', ligado: 'オン', desligado: 'オフ', fechar: '閉じる', carregando: 'フィードを読み込み中',
    entrarParaReagir: 'リアクションするには、アカウントでログインしてプロフィールを作成してください。', reacaoNaoGravou: 'リアクションを保存できませんでした。もう一度お試しください。', porTipo: 'リアクション：{lista}',
  },
  ko: {
    reacoes: { curtir: '좋아요', amei: '최고예요', haha: '하하', uau: '와우', abraco: '안아줘요' },
    escolherReacao: '반응 선택', reagiu: '{r}(으)로 반응했어요', tirouReacao: '반응을 취소했어요',
    deixarDeSeguir: '팔로우 취소', seguiu: '팔로우하고 있어요', deixouDeSeguir: '팔로우를 취소했어요',
    novasPostagens: '새 게시물', chegaramNovas: '새 게시물이 도착했어요', digitando: '{nome} 님이 입력 중',
    pausar: '일시정지', continuar: '계속', ligado: '켜짐', desligado: '꺼짐', fechar: '닫기', carregando: '피드를 불러오는 중',
    entrarParaReagir: '반응을 남기려면 계정으로 로그인하고 프로필을 만들어 주세요.', reacaoNaoGravou: '반응이 저장되지 않았어요. 다시 시도해 주세요.', porTipo: '반응: {lista}',
  },
}

export const LIFE_TEXTS = T

/** The texts of a language; an unknown language falls back to the house default. */
export function lifeTexts(lang: string | null | undefined): LifeTexts {
  return lang && Object.hasOwn(T, lang) ? T[lang as Locale] : T[DEFAULT]
}
