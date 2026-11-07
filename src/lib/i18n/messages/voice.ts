import { defineMessages } from "@/lib/i18n";

// Japanese copy awaits human review.
export const voiceMessages = defineMessages({
  en: {
    hint: "On a phone, tap the mic on your keyboard to speak your story.",
    record: "Speak your story",
    stop: "Stop and add words",
    starting: "Opening the microphone…",
    sending: "Turning your recording into words…",
    done: "Your words are in the box. Check and edit them before sharing.",
    failed: "Your recording could not be added. Try again or type your story.",
    permission:
      "Allow microphone access in your browser settings, or use the mic on your keyboard.",
    unsupported:
      "This browser cannot record here. Use the mic on your keyboard or type your story.",
    consent:
      "Record only your own voice. When you stop, your recording goes to an AI speech service abroad. Noren deletes its audio copy after processing. Nothing is shared until you press Share.",
    agree: "I agree to send my recording for speech recognition.",
    language: "Spoken language",
    english: "English",
    japanese: "日本語",
    timer: "Recording: {seconds} / {max} seconds",
    ready: "Ready to record, up to {max} seconds.",
  },
  ja: {
    hint: "スマートフォンでは、キーボードのマイクを押して体験を話せます。",
    record: "体験を話す",
    stop: "録音を止めて文字にする",
    starting: "マイクを開いています…",
    sending: "録音を文字にしています…",
    done: "文字が入力欄に入りました。共有する前に確認して直してください。",
    failed: "録音を追加できませんでした。もう一度試すか、文字を入力してください。",
    permission: "ブラウザーの設定でマイクを許可するか、キーボードのマイクを使ってください。",
    unsupported:
      "このブラウザーでは録音できません。キーボードのマイクを使うか、文字を入力してください。",
    consent:
      "自分の声だけを録音してください。録音を止めると、音声は国外のAI音声認識サービスに送られます。処理後、Norenは保管した音声を削除します。「共有」を押すまで公開されません。",
    agree: "音声認識のために録音を送ることに同意します。",
    language: "話す言語",
    english: "English",
    japanese: "日本語",
    timer: "録音中：{seconds} / {max}秒",
    ready: "最大{max}秒まで録音できます。",
  },
});
