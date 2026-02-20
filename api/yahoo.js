/**
 * Vercel サーバーレス関数 — Yahoo Finance プロキシ
 * ファイルパス: /api/yahoo.js
 *
 * 使い方: /api/yahoo?ticker=9984.T&range=1y
 *
 * サーバーサイドで Yahoo Finance を取得するため CORS 制限を受けない
 */

export default async function handler(req, res) {
  // CORS ヘッダー（フロントエンドからのアクセスを許可）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { ticker, range = "1y" } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: "ticker パラメータが必要です" });
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;

  try {
    const response = await fetch(yahooUrl, {
      headers: {
        // Yahoo Finance がブラウザリクエストと判別しやすいよう User-Agent を設定
        "User-Agent": "Mozilla/5.0 (compatible; NikkeiBetaScreener/1.3.2)",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Yahoo Finance エラー: HTTP ${response.status}`,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({
      error: `取得失敗: ${err.message}`,
    });
  }
}
