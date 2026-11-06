import { defineMessages } from "../index";

// The account page (FR-130). Japanese UI copy remains unreviewed until a person reads it (FR-123).
export const accountMessages = defineMessages({
  ja: {
    title: "アカウント",
    deleteTitle: "アカウントを削除する",
    deleteIntro: "Noren はいつでもやめられます。アカウントを削除すると、元に戻せません。",
    goesTitle: "なくなるもの",
    goesName: "あなたの名前とログイン情報",
    goesCollection: "チェックイン、染めたのれん、バッジ、スタンプ",
    goesStories: "あなたが書いた話",
    goesChecks: "「今もあります」の記録と、あなたが送った報告",
    goesLinks: "あなたが共有したリンクの、サイトでの表示",
    staysTitle: "残るもの",
    staysPlaces:
      "あなたが追加した場所と、その名前とピン。地図には残りますが、あなたの名前は出ません。",
    staysLinks:
      "あなたが共有したリンクと、それに添えた言葉の記録。非公開になり、サイトでは誰にも見えません。",
    staysLog: "Noren の非公開の変更記録。あなたが誰だったかは、わからなくなります。",
    deleteButton: "アカウントを削除する",
    confirmQuestion: "本当にアカウントを削除しますか？元には戻せません。",
    confirmYes: "はい、削除します",
    confirmNo: "削除しない",
    deleting: "アカウントを削除しています…",
    deleted: "アカウントを削除しました。はじめのページへ移動します。",
    goToWelcome: "はじめのページへ",
    clerkFailed:
      "名前、書いた話、チェックインは Noren から消えましたが、ログイン情報の削除を終えられませんでした。下のボタンを押すと続きを行います。もう一度押しても問題ありません。",
    failed:
      "問題が発生したため、アカウントの削除が終わっていない可能性があります。下のボタンを押してやり直してください。もう一度押しても問題ありません。",
    tryAgain: "アカウントの削除を終える",
    signedOut: "ログアウトしています。ログインしてから、このページに戻って削除してください。",
    askSteward:
      "このアカウントは運営担当者が削除します。インタビュー、同意の記録、店舗の登録がこのアカウントに結びついている場合があるためです。運営担当者に依頼してください。",
    askOtherSteward:
      "運営担当者は、ここで自分のアカウントを削除できません。別の運営担当者に依頼してください。",
    askThroughForm:
      "運営担当者に連絡する方法がわからないときは、削除依頼フォームをお使いください。",
    openForm: "削除依頼フォームを開く",
  },
  en: {
    title: "Your account",
    deleteTitle: "Delete your account",
    deleteIntro: "You can leave Noren at any time. Deleting your account can't be undone.",
    goesTitle: "What goes",
    goesName: "Your name and your sign-in",
    goesCollection: "Your check-ins, dyed panels, badges and stamps",
    goesStories: "The stories you wrote",
    goesChecks: "Your Still here presses and the problems you reported",
    goesLinks: "The links you shared, from every page of the site",
    staysTitle: "What stays",
    staysPlaces:
      "Places you added, with their names and pins. They stay on the map without your name.",
    staysLinks:
      "A private record of the links you shared and the words you added to them. Nobody can see it on the site.",
    staysLog: "Noren's private log of changes. It no longer says who you were.",
    deleteButton: "Delete my account",
    confirmQuestion: "Delete your account for good? You can't get it back.",
    confirmYes: "Yes, delete my account",
    confirmNo: "Keep my account",
    deleting: "Deleting your account…",
    deleted: "Your account is deleted. Taking you to the welcome page.",
    goToWelcome: "Go to the welcome page",
    clerkFailed:
      "Your name, stories and check-ins are gone from Noren, but we couldn't finish closing your sign-in. Press the button below to finish. Pressing it again is safe.",
    failed:
      "Something went wrong, so your account may not be fully deleted. Press the button below to try again. Pressing it again is safe.",
    tryAgain: "Finish deleting my account",
    signedOut: "You're signed out. Sign in, then come back to this page to delete your account.",
    askSteward:
      "A steward deletes this account for you, because interviews, consents or a shop's listing may depend on it. Ask a steward to do it.",
    askOtherSteward: "A steward can't delete their own account here. Ask another steward to do it.",
    askThroughForm: "If you don't know how to reach a steward, use the removal form.",
    openForm: "Open the removal form",
  },
});
