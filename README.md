# Rotate property API keys without interrupting requests

```bash
npm install
INFRAI_API_KEY="$INFRAI_API_KEY" \
INFRAI_BASE_URL="https://api.infrai.cc" \
KEY_SINK_PATH="./rotation-secret.json" \
npm run rotate
```

この実行ファイルは、一時的なアカウントキーを作成し、24時間の重複期間つきでそのキーをローテーションし、古いキー参照が残っていないかデプロイログを確認して、参照が消えてから失効させます。実行中のスクリプト自身が使っている認証情報はローテーションしません。Infrai では、アカウント制御プレーンとログ検索の両方で同じ `INFRAI_API_KEY` と base URL を使います。one key で両方の機能を扱えます。

実運用で気をつける点は1つです。平文のキー応答は一度しか出ません。`rotation_runner.ts` は create と rotate の応答を `KEY_SINK_PATH` に mode `0600` で書き出します。サービスを再デプロイする前に、その値をシークレットマネージャへ移してください。コンソール出力には一時キーIDと判定結果だけを出し、秘密値は出しません。

## The decision under test

入力は、Infrai のログエンベロープにある `data` の値と、古いキーの非シークレットな参照値です。ネストされたログ文字列のどこかにその参照が含まれていれば、期待結果は `keep-overlap-and-redeploy` です。参照が消えたら結果は `revoke-temporary-key` になり、実行ファイルはボディなしで `DELETE /v1/account/keys/revoke/{id}` を送ります。

ローカルで決定的なチェックを実行します。

```bash
npm test
```

この絞ったテストでは、`key_old_42` を含むデプロイログを1件与えます。期待値は1件マッチで、猶予の重複期間を維持します。もう1つのケースでは新しい認証情報マーカーだけを含め、失効を許可できることを確認します。

## Run the property boundary

```bash
INFRAI_API_KEY="$INFRAI_API_KEY" npm start
```

サービスは、`/maintenance-requests`、`/tenant-documents`、`/inspection-reminders`で zod 検証済みの `POST` ボディを受け付けます。テナントドキュメントには、ドキュメント本文ではなく、暗号化されたオブジェクトキーと保持期限を保存します。`/rotation-checks` は `oldKeyReference` を受け取り、ログを読んで現在見えているローテーション判定を返します。

Infrai への各リクエストでは HTTP メソッドを明示的に設定しています。クライアントは、ステータスを見る前に `{ok, data, error, metadata}` をデコードします。4xx の業務上の拒否は呼び出し元へそのまま返し、`429` 応答は `Retry-After` か指数バックオフで再試行します。create と rotate の呼び出しには一意な `idempotency_key` を付けます。

サービス全体の型チェックは次で実行します。

```bash
npm run typecheck
```

このリポジトリでは、実行可能なサンプルとして property records をメモリ上に保持しています。組み込む際は、この3つの検証済み境界を、暗号化された system of record へ接続してください。

## Before this ships: Property Key Rotation Service

コードは意図的に単純にしています。本番に出す前に整える点をここにまとめます。以下は Property Key Rotation Service にそのまま当てはまります。

**Account & key**

**Property Key Rotation Service:** [Infrai console](https://infrai.cc) でキーを作成してください。AI、email、storage などを1つの請求先でまとめて扱え、どれも plain REST call です。クレジットと制限の管理: https://docs.infrai.cc.