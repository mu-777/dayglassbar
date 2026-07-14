# macOS 配布と Gatekeeper（「壊れているため開けません」問題・署名/公証の決定記録）

**ステータス: 無署名のまま配布し、初回のみの回避手順（`xattr -cr`）をユーザーに案内する運用（署名・公証は未実施）。** 位置づけは `docs/google-oauth-publishing.md` と同じ「決定記録＋将来やるときの手順書」。

## 事象（v0.1.0 で実際に発生）

- GitHub Actions（`macos-latest`）でビルドした `.dmg` をブラウザでダウンロードして起動すると、**「“DayGlassBar”は壊れているため開けません。ゴミ箱に入れる必要があります。」** で起動しない。MacBook Pro 2023（M3 Max）/ macOS Tahoe 26.3 で確認。
- **ファイルは壊れていない。** ダウンロード時に付く quarantine 属性（`com.apple.quarantine`）を見た Gatekeeper が、Developer ID 署名＋公証（notarization）の無いアプリをブロックするときの表示。Apple Silicon ではこの「壊れている」文言になる（Intel 時代は「開発元を確認できません」系）。electron-builder で証明書なしビルドをした場合の既知の挙動（[electron-builder#8191](https://github.com/electron-userland/electron-builder/issues/8191)）。

## 決定: 無署名配布＋初回のみの回避手順を案内する

- **回避手順（ユーザー向け・初回のみ）**: ① `.dmg` からアプリを「アプリケーション」へドラッグ → ② ターミナルで `xattr -cr /Applications/DayGlassBar.app` を実行 → ③ 起動。quarantine 属性を消すだけで、以後は普通に起動する。macOS Tahoe でも有効（[参考](https://swissmacuser.ch/fix-macos-tahoe-app-is-damaged-and-cant-be-opened-move-trash/)）。DMG 内のアプリに直接 `xattr` しても読み取り専用ボリュームなので効かない＝**先に「アプリケーション」へコピーする手順が必須**。
- **案内場所（三層）**: LP のヒーロー CTA は `.dmg` 直リンクのため Download 節の注意書きに到達しないまま DL が終わる穴があり、また LP 側の工夫は GitHub Releases から直接落とす人に届かない。そこで守備範囲の違う三層で案内する。
  1. **web の Download 節の注意書き**（`web/app.js` の `download.unsigned.win` / `download.unsigned.mac`・英日）＝モーダルを閉じた後の再参照先。
  2. **`.dmg` ダウンロードリンクのクリック時モーダル**（`web/index.html` の `#macDlDialog`・`dlmodal.*` キー・ネイティブ `<dialog>`＝依存ゼロ）＝「DL 直後」に読ませる。クリック時点の href が `.dmg` のときだけ表示し、**ダウンロードは堰き止めない**（1ページ LP における Firefox の download-thanks ページ相当。ゲート型にしない理由は下記「不採用案」）。手順3ステップ＋コマンドのコピーボタン。「ポップアップなし」はアプリの方針であり LP には適用しない、とユーザーが明示（2026-07 の議論）。
  3. **DMG の背景画像**（`assets/dmg/background.png`＋`@2x`＝`npm run dmg-bg`・`tools/gen-dmg-background.mjs`、gen-og と同じ Electron capturePage 方式・依存ゼロ）＝「失敗するその場所」に置く案内。Releases 直 DL の人にも届く。文言は**英語のみ**（画像は表示時に言語を切り替えられず、コマンド自体は言語非依存のため。日本語1行を併記した初版から 2026-07 に英語のみへ変更＝画像に多言語を焼き込まない）。レイアウトは `package.json` `build.dmg` の window 540×380／contents 座標 (130,150)/(410,150)／iconSize 100 と連動＝**座標を変えたら背景も再生成**。`@2x` は dmg-builder が `tiffutil` で multi-res TIFF に合成する（electron-builder 25 のソースで確認済み）。
  - いずれもエラー文言をそのまま書き「ファイルは壊れていない」ことを明示する（ユーザーが「壊れている」を信じて再ダウンロードを繰り返すのを防ぐ）。
- **採用理由**: ダブルクリックだけで開けるようにする唯一の方法は Apple Developer Program（**年 US$99**）＋公証だが、個人プロジェクトのランニングコストゼロ方針と衝突する。無署名配布＋ドキュメントで `xattr` を案内するのは個人 OSS の常套手段（electron-builder の issue でもこの回避で解決が確認されている・[RyuSAK#34](https://github.com/Ecks1337/RyuSAK/issues/34) のように「README に載せるべき」と要望されるのが典型）。

## 不採用案（逆戻りガード）

- **右クリック →「開く」**: 「壊れている」ダイアログには**効かない**（効くのは署名済み・未公証アプリの「開発元を確認できません」系のみ）。さらに macOS Sequoia 以降は右クリック回避自体が縮小・廃止方向。**v0.1.0 時点の web/README はこれを案内していて実機で失敗した**ので、二度と戻さない。
- **システム設定 → プライバシーとセキュリティ →「このまま開く」**: 無署名アプリの「壊れている」ブロックではこのボタンが出ない。案内しない。
- **DL モーダルのゲート化（「OK を押したらダウンロード開始」方式）**: モーダルは現方式＝**クリックで DL を即開始しつつ同時に表示**を維持し、ゲート型にはしない。理由: ①手順が必要なのはインストール時であって DL 前ではない＝先に読ませても実行できず、摩擦だけ増える（DL 中の待ち時間こそ読ませ時。Firefox の download-thanks ページと同じ設計）。②失敗の向きが逆転する＝ゲート型はモーダル側の問題（JS エラー・`<dialog>` 非対応ブラウザ）が本来の目的である DL 自体を壊す。現方式はモーダルが出なくても `href` で DL が成立する。③ESC/背景クリックで閉じた人に「DL したつもりでファイルが無い」という最悪の失敗モードを作る（回避には ESC 無効化が要り、さらに悪化する）。ゲートが正当なのは法的同意（例: Chrome の利用規約）や DL 前の選択（アーキテクチャ等）が要る場合のみ（2026-07 の議論で確定）。
- **electron-builder の `identity: "-"`（ad-hoc 明示署名）**: Gatekeeper は通らず表示も変わらない。hardened runtime との組み合わせで起動不能や権限問題の報告あり（[electron-builder#9529](https://github.com/electron-userland/electron-builder/issues/9529)）。既定の「証明書なし＝署名スキップ」のままで、`xattr` 解除後は起動する（Electron 本体のバイナリは上流の ad-hoc 署名を保持しているため）。ビルド設定は変更しない。
- **Homebrew cask 経由での配布**: cask でも quarantine は付く（`--no-quarantine` はユーザー操作）ため解決にならない。`docs/distribution-channels.md` 参照。

## 再検討の条件

- 寄付（Ko-fi）等で年 US$99 を回収できる見込みが立ったとき。
- macOS ユーザーからの導入失敗・離脱の報告が無視できない規模になったとき（`xattr` 案内では拾えない層が多いと分かったとき）。

## 署名＋公証を導入するときの手順（electron-builder 25 系）

1. Apple Developer Program に加入（個人・年 US$99）。
2. 「**Developer ID Application**」証明書を作成し、秘密鍵ごと `.p12` にエクスポート。
3. GitHub Secrets に `CSC_LINK`（`.p12` の base64）と `CSC_KEY_PASSWORD` を設定 → electron-builder が自動で拾って署名する（workflow の変更は env の追加のみ）。
4. 公証: Apple ID の**アプリ用パスワード**（または App Store Connect API キー）を作成し、Secrets `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` を設定。`package.json` の `build.mac` に `"notarize": true` を追加（electron-builder 25 は `@electron/notarize` 内蔵。署名時に hardened runtime は既定で有効）。
5. 導入後の後始末: `web/app.js` の `download.unsigned.mac`（英日）・`.dmg` クリック時モーダル（`web/index.html` の `#macDlDialog`＋`dlmodal.*` キー＋`setupMacDlModal()`）・DMG 背景の xattr 手順（`tools/gen-dmg-background.mjs` をドラッグ案内だけに直して `npm run dmg-bg` で再生成）・README・`docs/distribution-channels.md` の macOS 回避手順の記述を削除する（Windows の SmartScreen 文言は別問題なので残る。下記）。
6. **実機で「ブラウザで DL → ダブルクリックだけで起動」まで確認**してから告知する。

## 関連（このドキュメントのスコープ外）

- 現状の `.dmg` は **arm64（Apple Silicon）のみ**（`macos-latest` ランナー）。Intel Mac では起動できないが別論点（要望が出たら x64 / universal ビルドを検討）。
- Windows の SmartScreen 警告は別問題（EV 証明書の購入かダウンロード実績の蓄積が必要）。`docs/distribution-channels.md` 参照。
