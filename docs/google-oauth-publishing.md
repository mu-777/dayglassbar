# Google OAuth 公開手順（一般配布に向けて・未実施）

Google カレンダー連携を「テストユーザー限定」から一般公開する場合の手順書。**現状は未実施**（docs/calendar-integration.md 決定2のとおり「テスト」公開ステータスのまま運用中）。実装は伴わない調査・手順の記録のみ。

## 背景: なぜ今のままでは配布に向かないか

本アプリが使う Google のスコープ（`calendar.events.readonly` / `calendar.calendarlist.readonly`）は Google の定める **sensitive scopes（機微なスコープ）** に分類される。sensitive scope を使う OAuth アプリは、審査（App Verification）を通して公開ステータスを「本番（In production）」にしない限り、以下の制約を受け続ける。

現在の運用（OAuth 同意画面が**「テスト」ステータス**・接続できるのはコンソールに登録した**テストユーザーのみ**＝決定2）には、次の2つの帰結がある。

1. **テストユーザー以外は接続を完了できない**。配布ページ（GitHub Pages）から `.exe`/`.dmg` をダウンロードした一般ユーザーが「Connect Google」を押しても、同意画面で弾かれて Google 連携が機能しない。
2. **テストステータスの refresh token は 7 日で失効する**。テストユーザーとして登録済みのユーザー（開発者自身を含む）でも、7日ごとに静かに切断され、色帯が更新されなくなる。今回の実装（本作業のタスク4）で `calendar:status` の `error` を設定UIに表示するようにしたため「切れたこと」自体は見えるようになったが、これは症状の可視化であって根本対策ではない。根本対策は本ドキュメントの公開ステータス化。

一般ユーザーに Google 連携を配る（かつ 7 日ごとの再接続を要求しない）には、以下の手順で「本番」ステータスへ進める必要がある。

## 手順1: プライバシーポリシーの作成・公開

sensitive scope の審査には、公開URLで閲覧できるプライバシーポリシーが必須。

- **置き場所案**: `web/`（GitHub Pages で公開済みの静的サイト）に `privacy.html` 等のページを追加し、`https://mu-777.github.io/dayglassbar/privacy.html` で公開する。`web/` は依存ゼロ・ビルド工程なしの構成（CLAUDE.md「紹介・配布ページ」参照）なので、素の HTML 1ページを足すだけで完結する。
- **記載すべき項目**:
  - 収集するデータは無い（利用状況の収集・トラッキング・広告は行わない）。
  - 設定はローカルの JSON ファイル（`settings.json`）にのみ保存される（クラウド保存なし）。
  - Google カレンダーの OAuth トークンは端末内で `safeStorage`（OS 標準の暗号化）により暗号化保存され、設定のエクスポートには含まれない。
  - 取得した予定はバー上に表示する目的のみに使い、当方のサーバーには一切送信しない（そもそもサーバーを持たない）。
  - データの削除方法: 設定画面の「Disconnect」でトークンを破棄する、またはアプリをアンインストールする。
  - 問い合わせ先（GitHub リポジトリの Issue、または連絡用メールアドレス）。
- **そのまま使える英語ドラフト**（上記項目を満たす最小構成。実際のページに合わせて連絡先等を差し替える）:

```
Privacy Policy — DayGlassBar

DayGlassBar is a desktop app. This policy covers the optional Google Calendar
integration; the app itself collects no data and has no analytics or tracking.

What we access: with your explicit permission (Google sign-in), the app reads
your Google Calendar events (read-only) to display them as colored time bands
in the app. We request the minimum scopes needed for this (calendar.events.readonly,
calendar.calendarlist.readonly).

What we store: your settings are saved only in a local JSON file on your own
device. The Google sign-in token is encrypted on your device (via your OS's
secure storage) and is never included when you export your settings.

What we don't do: we do not operate a server, and calendar data is never sent
anywhere outside your device. We do not sell, share, or use your data for
advertising.

How to revoke access: click "Disconnect" next to Google in the app's settings,
or uninstall the app. You can also revoke access at any time from your Google
Account's third-party access settings.

Contact: <連絡先メールアドレス or GitHub Issues URL>
Last updated: <公開時の日付>
```

## 手順2: OAuth 同意画面の設定（Google Cloud Console）

Google Cloud Console → 「APIとサービス」→「OAuth 同意画面」で以下を埋める。

- **アプリ名**: DayGlassBar
- **サポートメール**: 開発者の連絡先メールアドレス
- **アプリのホームページ URL**: `https://mu-777.github.io/dayglassbar/`
- **プライバシーポリシー URL**: 手順1で公開したページの URL
- **承認済みドメイン**: `mu-777.github.io`（ループバックリダイレクト `http://localhost` はここでは不要。承認済みドメインはホームページ/プライバシーポリシーのドメイン確認用）

## 手順3: 公開ステータスを「本番」へ変更し、審査を提出する

- OAuth 同意画面の「公開ステータス」を「テスト」から「**本番（In production）**」に変更すると、sensitive scope を使っているため自動的に **App Verification（アプリの確認）** の対象になる。
- 審査に必要な提出物:
  - **スコープの使用理由の説明文**（審査フォームに記入。そのまま使える英語例）:
    ```
    DayGlassBar is a desktop ambient time-awareness app. It reads the user's
    Google Calendar events (read-only) solely to display them as colored time
    bands on a thin bar overlay, so the user can see at a glance which parts
    of their remaining work hours are already booked. Events are only used
    for this on-screen display; nothing is stored beyond a short-lived local
    cache, nothing is transmitted to any server (the app has none), and the
    user can disconnect at any time.
    ```
  - **デモ動画**: OAuth の同意フロー（Connect Google → ブラウザでの許可 → アプリに戻る）と、実際にカレンダーの予定が色帯として表示される様子を録画したもの。**限定公開（unlisted）の YouTube 動画で可**。
- **審査期間の目安**: 数日〜数週間（スコープの機微度・提出内容の完成度により変動）。

## 手順4: 検証完了までの挙動

- 審査完了前に「本番」へ切り替えた場合、ユーザーが同意画面に進むと **「確認されていないアプリ」の警告画面**が挟まる。ユーザーは「詳細を表示」→「（アプリ名）に移動（安全ではないページに移動）」を選べば先に進めるが、警告文言が強く不安を与える。
- 検証未完了の「本番」ステータスは **利用者数の上限が 100 ユーザー**（Google アカウント単位のカウント）。それを超える配布には検証完了が必須。

## 代替運用: 個人用途ならテストのまま

一般配布をしない・自分（と身近な数名）だけが使うなら、**現状の「テスト」ステータスのまま使い続ける**選択肢もある。ただしその場合は次を明確に認識しておく必要がある。

- テストユーザーとして Google Cloud Console に登録したアカウントしか接続できない。
- **refresh token が 7 日で失効する**ため、7日ごとに設定画面で「Disconnect」→「Connect Google」の再接続が必要（自動更新はできない。今回の実装で `calendar:status` にエラーが出るので、失効に気づく手がかりにはなる）。

## 参照

- Google Cloud: [Additional requirements for specific scopes（sensitive/restricted scope の追加要件）](https://support.google.com/cloud/answer/9110914)
- Google Cloud: [OAuth API verification FAQs（アプリ確認の FAQ）](https://support.google.com/cloud/answer/13463073)
- Google Cloud: [Unverified apps（「確認されていないアプリ」画面について）](https://support.google.com/cloud/answer/7454865)
- 関連する既存の決定記録: `docs/calendar-integration.md` 決定2（資格情報・テスト公開ステータス運用の経緯）
