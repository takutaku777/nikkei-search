/**
 * NIKKEI β SCREENER
 * ============================================================
 * バージョン履歴
 * v1.0.0 (2026-02-19) 初版 — ベータ計算・棒グラフ・散布図
 * v1.1.0 (2026-02-19) CSVダウンロード機能を追加
 * v1.2.0 (2026-02-19) モバイル・デスクトップ レスポンシブ対応
 * v1.2.1 (2026-02-19) 1M期間を追加・最低データ点数を緩和
 * v1.3.0 (2026-02-19) UX・デザイン改善
 *   [fix] スキャン中断ボタンを追加（cancelRef によるキャンセル制御）
 *   [fix] スキップ銘柄数を明示表示（完了メッセージ・サマリーカードに反映）
 *   [fix] 日本語テキストのフォントを sans-serif に変更（数値・コードは monospace 維持）
 *   [fix] モバイル スクロール中も進捗がわかるトーストバナーを追加
 *   [fix] ソートの初回クリックを常に降順（高い順）に統一
 * v1.3.1 (2026-02-19) CORSプロキシ障害対応（複数プロキシへの自動フォールバック）
 * v1.3.2 (2026-02-20) Vercelデプロイ対応
 *   [fix] 外部CORSプロキシを廃止し、Vercel APIルート（/api/yahoo）に切替
 *   [fix] サーバーサイド取得によりCORS問題を根本解決
 *   [fix] 開発環境（localhost）では従来のフォールバックプロキシを使用
 * ============================================================
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";

// ── 定数 ────────────────────────────────────────────────────
const VERSION    = "v1.3.2";
const BENCHMARK  = "1321.T";
const BREAKPOINT = 768;

// [v1.3.2] データ取得戦略
// Vercel本番環境 → /api/yahoo（サーバーサイド取得、CORS問題なし）
// localhost開発環境 → 外部CORSプロキシにフォールバック
const IS_VERCEL = typeof window !== "undefined" &&
  !window.location.hostname.includes("localhost") &&
  !window.location.hostname.includes("127.0.0.1") &&
  !window.location.hostname.includes("claude.ai");

// 開発環境用フォールバックプロキシ（Vercel環境では使われない）
const FALLBACK_PROXIES = [
  {
    name: "allorigins",
    build: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    parse: async (res) => { const j = await res.json(); return JSON.parse(j.contents); },
  },
  {
    name: "corsproxy.io",
    build: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    parse: async (res) => res.json(),
  },
];

// [fix] フォント定義を分離
const FONT_JP  = "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Code', 'Courier New', monospace";

const TICKERS = [
  { code: "9984.T", name: "ソフトバンクG" },
  { code: "8035.T", name: "東京エレクトロン" },
  { code: "6857.T", name: "アドバンテスト" },
  { code: "6758.T", name: "ソニーグループ" },
  { code: "6861.T", name: "キーエンス" },
  { code: "6146.T", name: "ディスコ" },
  { code: "7735.T", name: "SCREEN HD" },
  { code: "6367.T", name: "ダイキン工業" },
  { code: "8604.T", name: "野村HD" },
  { code: "8601.T", name: "大和証券G" },
  { code: "8306.T", name: "三菱UFJ" },
  { code: "8316.T", name: "三井住友FG" },
  { code: "8411.T", name: "みずほFG" },
  { code: "7203.T", name: "トヨタ自動車" },
  { code: "7267.T", name: "ホンダ" },
  { code: "7201.T", name: "日産自動車" },
  { code: "9433.T", name: "KDDI" },
  { code: "9432.T", name: "NTT" },
  { code: "6501.T", name: "日立製作所" },
  { code: "6702.T", name: "富士通" },
  { code: "6503.T", name: "三菱電機" },
  { code: "4063.T", name: "信越化学" },
  { code: "4568.T", name: "第一三共" },
  { code: "4502.T", name: "武田薬品" },
  { code: "4519.T", name: "中外製薬" },
  { code: "5401.T", name: "日本製鉄" },
  { code: "8058.T", name: "三菱商事" },
  { code: "8031.T", name: "三井物産" },
  { code: "8001.T", name: "伊藤忠商事" },
  { code: "9983.T", name: "ファーストリテイリング" },
  { code: "7974.T", name: "任天堂" },
  { code: "8801.T", name: "三井不動産" },
  { code: "8802.T", name: "三菱地所" },
  { code: "6971.T", name: "京セラ" },
  { code: "6752.T", name: "パナソニック" },
  { code: "4188.T", name: "三菱ケミカル" },
  { code: "8766.T", name: "東京海上HD" },
  { code: "8267.T", name: "イオン" },
];

const PERIODS = [
  { label: "1M", labelFull: "1ヶ月", value: "1mo", warn: true  },
  { label: "3M", labelFull: "3ヶ月", value: "3mo", warn: false },
  { label: "6M", labelFull: "6ヶ月", value: "6mo", warn: false },
  { label: "1Y", labelFull: "1年",   value: "1y",  warn: false },
  { label: "2Y", labelFull: "2年",   value: "2y",  warn: false },
];
const isShortPeriod = (v) => v === "1mo";

// ── レスポンシブフック ───────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < BREAKPOINT : false
  );
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < BREAKPOINT);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return isMobile;
}

// ── ユーティリティ ───────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// タイムアウト付き fetch
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// [v1.3.2] データ取得：Vercel本番 vs 開発環境で分岐
async function fetchReturns(ticker, range, onProxyAttempt) {
  if (IS_VERCEL) {
    // ── 本番（Vercel）: サーバーサイドAPIルートを使用 ──
    if (onProxyAttempt) onProxyAttempt("vercel/api");
    const res = await fetchWithTimeout(
      `/api/yahoo?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(range)}`
    );
    if (!res.ok) throw new Error(`API エラー: HTTP ${res.status}`);
    const data = await res.json();
    const closes     = data.chart.result[0].indicators.quote[0].close;
    const timestamps = data.chart.result[0].timestamp;
    const returns = {};
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] != null && closes[i - 1] != null)
        returns[timestamps[i]] = (closes[i] - closes[i - 1]) / closes[i - 1];
    }
    return returns;
  }

  // ── 開発環境: 外部CORSプロキシにフォールバック ──
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
  let lastError = null;
  for (const proxy of FALLBACK_PROXIES) {
    try {
      if (onProxyAttempt) onProxyAttempt(proxy.name);
      const res  = await fetchWithTimeout(proxy.build(yahooUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await proxy.parse(res);
      const closes     = data.chart.result[0].indicators.quote[0].close;
      const timestamps = data.chart.result[0].timestamp;
      const returns = {};
      for (let i = 1; i < closes.length; i++) {
        if (closes[i] != null && closes[i - 1] != null)
          returns[timestamps[i]] = (closes[i] - closes[i - 1]) / closes[i - 1];
      }
      return returns;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`全プロキシ失敗: ${lastError?.message}`);
}

function calcBeta(stockRet, benchRet) {
  const common = Object.keys(stockRet).filter((k) => k in benchRet);
  if (common.length < 10) return null;
  const s = common.map((k) => stockRet[k]);
  const b = common.map((k) => benchRet[k]);
  const n = s.length;
  const meanS = s.reduce((a, c) => a + c, 0) / n;
  const meanB = b.reduce((a, c) => a + c, 0) / n;
  let cov = 0, varB = 0, varS = 0;
  for (let i = 0; i < n; i++) {
    cov  += (s[i] - meanS) * (b[i] - meanB);
    varB += (b[i] - meanB) ** 2;
    varS += (s[i] - meanS) ** 2;
  }
  cov /= n; varB /= n; varS /= n;
  const beta = cov / varB;
  const corr = cov / Math.sqrt(varS * varB);
  return { beta, corr, r2: corr ** 2, vol: Math.sqrt(varS * 252) * 100, n };
}

function downloadCSV(data, period) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
  const header = ["順位","銘柄名","コード","Beta","相関係数","R²","年率ボラティリティ(%)","データ日数"];
  const meta = [
    [`# NIKKEI β SCREENER ${VERSION}`],
    [`# 出力日時: ${now.toLocaleString("ja-JP")}`],
    [`# 期間: ${period} | ベンチマーク: ${BENCHMARK}`],
    [`# β≥1.5: 超ハイベータ | 1.0≤β<1.5: ハイベータ | β<1.0: ローベータ`],
    [],
  ];
  const rows = data.map((r, i) => [i+1, r.name, r.code, r.beta.toFixed(3), r.corr.toFixed(3), r.r2.toFixed(3), r.vol.toFixed(1), r.n]);
  const csv = [...meta.map((r) => r.join(",")), header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `nikkei_beta_${period}_${dateStr}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── カラー ───────────────────────────────────────────────────
function betaColor(b) {
  if (b >= 1.5) return "#ff4d4d";
  if (b >= 1.2) return "#ff9900";
  if (b >= 0.8) return "#4dccff";
  return "#66ff99";
}
function betaLabel(b) {
  if (b >= 1.5) return "超ハイβ";
  if (b >= 1.2) return "ハイβ";
  if (b >= 0.8) return "標準";
  return "ローβ";
}

// ── チャートツールチップ ─────────────────────────────────────
const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background:"#0d1117", border:"1px solid #30363d", borderRadius:8, padding:"10px 14px" }}>
      <div style={{ fontWeight:700, color:"#e6edf3", marginBottom:6, fontFamily:FONT_JP, fontSize:13 }}>{d.name}</div>
      <div style={{ color:"#8b949e", lineHeight:1.9, fontFamily:FONT_MONO, fontSize:12 }}>
        β = <span style={{ color:betaColor(d.beta), fontWeight:700 }}>{d.beta.toFixed(3)}</span>
        {"  "}
        <span style={{ fontSize:10, padding:"1px 5px", borderRadius:3, background:`${betaColor(d.beta)}22`, color:betaColor(d.beta), border:`1px solid ${betaColor(d.beta)}44`, fontFamily:FONT_JP }}>
          {betaLabel(d.beta)}
        </span><br/>
        R² = {d.r2.toFixed(3)}<br/>
        ρ = {d.corr.toFixed(3)}<br/>
        年率ボラ = {d.vol.toFixed(1)}%
      </div>
    </div>
  );
};

// ── [fix] モバイル カードリスト行（フォント修正済み） ────────
const MobileRow = ({ r, rank }) => (
  <div style={{ padding:"14px 16px", borderBottom:"1px solid #161b22", display:"flex", alignItems:"center", gap:12 }}>
    <div style={{ fontSize:12, color:"#484f58", minWidth:20, textAlign:"center", fontFamily:FONT_MONO }}>{rank}</div>
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <span style={{ fontWeight:700, fontSize:14, color:"#e6edf3", fontFamily:FONT_JP }}>{r.name}</span>
        <span style={{ fontSize:10, color:"#8b949e", fontFamily:FONT_MONO }}>{r.code}</span>
      </div>
      <div style={{ display:"flex", gap:10, fontSize:11, color:"#8b949e", fontFamily:FONT_MONO }}>
        <span>R² <b style={{color:"#e6edf3"}}>{r.r2.toFixed(2)}</b></span>
        <span>ρ <b style={{color:"#e6edf3"}}>{r.corr.toFixed(2)}</b></span>
        <span>ボラ <b style={{color:"#e6edf3"}}>{r.vol.toFixed(0)}%</b></span>
      </div>
    </div>
    <div style={{ textAlign:"right" }}>
      <div style={{ fontSize:20, fontWeight:800, color:betaColor(r.beta), lineHeight:1, fontFamily:FONT_MONO }}>{r.beta.toFixed(2)}</div>
      <div style={{ marginTop:4, fontSize:9, fontWeight:600, padding:"2px 6px", borderRadius:3, background:`${betaColor(r.beta)}18`, color:betaColor(r.beta), border:`1px solid ${betaColor(r.beta)}33`, fontFamily:FONT_JP }}>
        {betaLabel(r.beta)}
      </div>
    </div>
  </div>
);

// ── メインコンポーネント ─────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();

  const [period, setPeriod]       = useState("1y");
  const [running, setRunning]     = useState(false);
  const [progress, setProgress]   = useState(0);
  const [status, setStatus]       = useState("");
  const [currentTicker, setCurrentTicker] = useState("");
  const [proxyStatus, setProxyStatus]     = useState(""); // [v1.3.1] 試行中プロキシ名
  const [results, setResults]     = useState([]);
  const [skipped, setSkipped]     = useState(0);
  const [error, setError]         = useState("");
  const [sortKey, setSortKey]     = useState("beta");
  const [sortAsc, setSortAsc]     = useState(false);
  const [tab, setTab]             = useState("table");
  const [csvFlash, setCsvFlash]   = useState(false);
  const [cancelled, setCancelled] = useState(false);

  // [fix] キャンセル制御用 ref
  const cancelRef = useRef(false);

  const run = useCallback(async () => {
    cancelRef.current = false;
    setCancelled(false);
    setRunning(true);
    setResults([]);
    setSkipped(0);
    setError("");
    setProgress(0);
    setCurrentTicker("");
    setProxyStatus("");

    // [v1.3.1] プロキシ試行通知コールバック
    const onProxy = (name) => setProxyStatus(name);

    try {
      setStatus("ベンチマーク（日経225 ETF）を取得中...");
      const benchRet = await fetchReturns(BENCHMARK, period, onProxy);
      setProxyStatus("");

      const total = TICKERS.length;
      const found = [];
      let skipCount = 0;

      for (let i = 0; i < total; i++) {
        // [fix] キャンセルチェック
        if (cancelRef.current) {
          setCancelled(true);
          setStatus(`中断しました（${found.length} 銘柄完了、${skipCount} 件スキップ）`);
          setResults(found);
          setSkipped(skipCount);
          return;
        }

        const t = TICKERS[i];
        setCurrentTicker(t.name);
        setStatus(`計算中... [${i + 1}/${total}]`);
        setProgress(Math.round(((i + 1) / total) * 100));

        try {
          const stockRet = await fetchReturns(t.code, period, onProxy);
          const res = calcBeta(stockRet, benchRet);
          if (res) {
            found.push({
              code: t.code, name: t.name,
              beta: +res.beta.toFixed(3), corr: +res.corr.toFixed(3),
              r2:   +res.r2.toFixed(3),   vol:  +res.vol.toFixed(1),
              n: res.n,
            });
          } else {
            skipCount++;
          }
        } catch (_) {
          skipCount++; // [fix] 失敗もカウント
        }

        await sleep(200);
      }

      found.sort((a, b) => b.beta - a.beta);
      setResults(found);
      setSkipped(skipCount);
      // [fix] スキップ件数を完了メッセージに含める
      setStatus(
        skipCount > 0
          ? `完了 — ${found.length} 銘柄を計算（${skipCount} 件スキップ）`
          : `完了 — ${found.length} 銘柄を計算しました`
      );
    } catch (e) {
      const isVercelErr = IS_VERCEL;
      setError(
        isVercelErr
          ? "データ取得に失敗しました。\n① /api/yahoo.js がデプロイされているか確認してください\n② Vercel のデプロイログでエラーを確認してください\n③ しばらく時間をおいて再試行してください"
          : "3つのプロキシすべてに接続できませんでした。\n① Wi-Fi に切り替えてから再試行してください\n② それでも失敗する場合は、VPN をオフにして試してください\n③ しばらく時間をおいて再度お試しください"
      );
      setStatus("");
    } finally {
      setRunning(false);
      setCurrentTicker("");
      setProxyStatus("");
    }
  }, [period]);

  // [fix] キャンセルハンドラ
  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const handleCSV = useCallback(() => {
    downloadCSV(results, period);
    setCsvFlash(true);
    setTimeout(() => setCsvFlash(false), 1800);
  }, [results, period]);

  // [fix] ソート：初回クリックは常に降順
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false); // 新しいキーは常に降順スタート
    }
  };

  const sorted = [...results].sort((a, b) => {
    if (sortKey === "name") return sortAsc
      ? a.name.localeCompare(b.name, "ja")
      : b.name.localeCompare(a.name, "ja");
    return sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey];
  });

  const top15 = [...results].sort((a, b) => b.beta - a.beta).slice(0, 15);
  const sortIcon = (k) => sortKey === k ? (sortAsc ? " ▴" : " ▾") : " ↕";

  // ── スタイル ─────────────────────────────────────────────
  const C = {
    root: {
      minHeight: "100vh",
      background: "#010409",
      color: "#e6edf3",
      fontFamily: FONT_JP, // [fix] ルートを日本語フォントに
      paddingBottom: isMobile ? 90 : 60,
    },
    header: {
      background: "linear-gradient(135deg,#0d1117 0%,#161b22 100%)",
      borderBottom: "1px solid #21262d",
      padding: isMobile ? "14px 16px 12px" : "26px 40px 22px",
      display: "flex", alignItems: isMobile ? "center" : "flex-end",
      justifyContent: "space-between", gap: 12,
    },
    title: {
      fontSize: isMobile ? 18 : 26, fontWeight: 800, letterSpacing: "0.04em",
      background: "linear-gradient(90deg,#ff9900,#ff4d4d)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      lineHeight: 1.2, fontFamily: FONT_MONO,
    },
    vBadge: {
      fontSize: 9, padding: "2px 6px", borderRadius: 4,
      border: "1px solid #30363d", color: "#8b949e",
      WebkitTextFillColor: "#8b949e", background: "transparent",
      display: "inline-block", marginLeft: isMobile ? 0 : 8,
      fontFamily: FONT_MONO,
    },
    sub: { fontSize: isMobile ? 10 : 12, color: "#8b949e", letterSpacing: "0.04em", marginTop: 2 },
    headerMeta: { fontSize: 9, color: "#3d4450", textAlign: "right", display: isMobile ? "none" : "block", fontFamily: FONT_MONO },
    main: { maxWidth: 1200, margin: "0 auto", padding: isMobile ? "12px" : "28px 24px" },
    card: {
      background: "#0d1117", border: "1px solid #21262d",
      borderRadius: isMobile ? 10 : 12,
      padding: isMobile ? "16px" : "22px 26px",
      marginBottom: isMobile ? 14 : 20,
    },
    sectionLabel: { fontSize: 10, color: "#8b949e", letterSpacing: "0.1em", marginBottom: 10, fontFamily: FONT_MONO },

    periodGroup: { display: "flex", gap: isMobile ? 6 : 8 },
    periodBtn: (active) => ({
      height: 44, padding: "0 16px", borderRadius: 8,
      fontSize: isMobile ? 14 : 13, fontWeight: 700,
      border: active ? "1px solid #ff9900" : "1px solid #30363d",
      background: active ? "rgba(255,153,0,0.12)" : "rgba(255,255,255,0.03)",
      color: active ? "#ff9900" : "#8b949e",
      cursor: "pointer", fontFamily: FONT_MONO, transition: "all 0.15s",
      minWidth: isMobile ? 52 : 50,
    }),

    // デスクトップ ボタン
    runBtnDesktop: {
      height: 44, padding: "0 28px", borderRadius: 8, fontSize: 14, fontWeight: 700,
      border: "none", cursor: "pointer",
      background: "linear-gradient(135deg,#ff9900,#ff4d4d)",
      color: "#fff", letterSpacing: "0.06em", fontFamily: FONT_JP, transition: "all 0.2s",
    },
    cancelBtnDesktop: {
      height: 44, padding: "0 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
      border: "1px solid #f85149", background: "rgba(248,81,73,0.08)",
      color: "#f85149", cursor: "pointer", fontFamily: FONT_JP, transition: "all 0.2s",
    },
    csvBtnDesktop: (flash) => ({
      height: 44, padding: "0 18px", borderRadius: 8, fontSize: 12, fontWeight: 600,
      border: flash ? "1px solid #3fb950" : "1px solid #30363d",
      background: flash ? "rgba(63,185,80,0.12)" : "rgba(255,255,255,0.03)",
      color: flash ? "#3fb950" : "#8b949e",
      cursor: results.length === 0 ? "not-allowed" : "pointer",
      fontFamily: FONT_JP, transition: "all 0.2s",
      opacity: results.length === 0 ? 0.4 : 1,
      display: "flex", alignItems: "center", gap: 6,
    }),

    // プログレス
    progressWrap: { height: 3, borderRadius: 2, background: "#21262d", margin: "14px 0 6px", overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 2, background: "linear-gradient(90deg,#ff9900,#ff4d4d)", width: `${progress}%`, transition: "width 0.3s" },

    // [fix] モバイル スクロール中も見えるトースト
    progressToast: {
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
      background: "rgba(1,4,9,0.97)", borderBottom: "1px solid #21262d",
      padding: "8px 16px",
      display: "flex", alignItems: "center", gap: 10,
      backdropFilter: "blur(8px)",
    },
    toastBar: { flex: 1, height: 3, borderRadius: 2, background: "#21262d", overflow: "hidden" },
    toastFill: { height: "100%", borderRadius: 2, background: "linear-gradient(90deg,#ff9900,#ff4d4d)", width: `${progress}%`, transition: "width 0.3s" },

    // サマリーカード
    summaryGrid: {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)",
      gap: isMobile ? 10 : 14, marginBottom: isMobile ? 14 : 20,
    },
    summaryCard: {
      background: "#0d1117", border: "1px solid #21262d",
      borderRadius: isMobile ? 10 : 12, padding: isMobile ? "12px 14px" : "16px 20px",
    },

    // タブ
    tabRow: { display: "flex", borderBottom: "1px solid #30363d", overflowX: "auto" },
    tabBtn: (active) => ({
      padding: isMobile ? "10px 14px" : "8px 20px",
      fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
      border: active ? "1px solid #30363d" : "none",
      borderBottom: active ? "none" : "1px solid #30363d",
      background: active ? "#0d1117" : "transparent",
      color: active ? "#e6edf3" : "#8b949e",
      cursor: "pointer", borderRadius: "6px 6px 0 0",
      fontFamily: FONT_JP, letterSpacing: "0.03em", transition: "color 0.15s", minHeight: 44,
    }),
    tabContent: {
      background: "#0d1117", border: "1px solid #21262d", borderTop: "none",
      borderRadius: "0 8px 8px 8px",
      padding: isMobile ? "14px 0" : "20px 24px", marginBottom: 0,
    },

    // テーブル
    th: (align) => ({
      padding: "10px 12px", fontSize: 10, color: "#8b949e",
      letterSpacing: "0.08em", textAlign: align,
      borderBottom: "1px solid #21262d", whiteSpace: "nowrap",
      cursor: "pointer", userSelect: "none", fontFamily: FONT_MONO,
    }),
    td: (align) => ({
      padding: "10px 12px", fontSize: 12, textAlign: align,
      borderBottom: "1px solid #161b22",
    }),
    badge: (b) => ({
      display: "inline-block", padding: "2px 7px", borderRadius: 4,
      fontSize: 11, fontWeight: 700, fontFamily: FONT_MONO,
      background: `${betaColor(b)}22`, color: betaColor(b),
      border: `1px solid ${betaColor(b)}44`,
    }),
    error: {
      background: "#2d1117", border: "1px solid #f85149",
      borderRadius: 8, padding: "12px 16px", color: "#f85149", fontSize: 12,
    },
    emptyCard: {
      background: "#0d1117", border: "1px dashed #21262d", borderRadius: 12,
      textAlign: "center", padding: isMobile ? "40px 20px" : "48px 24px",
      marginBottom: isMobile ? 100 : 0,
    },
    // モバイル スティッキーCTA
    stickyBar: {
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "rgba(1,4,9,0.95)", backdropFilter: "blur(12px)",
      borderTop: "1px solid #21262d",
      padding: "12px 16px", display: "flex", gap: 10, zIndex: 100,
    },
    runBtnMobile: {
      flex: 1, height: 50, borderRadius: 10, fontSize: 16, fontWeight: 800,
      border: "none", cursor: "pointer",
      background: "linear-gradient(135deg,#ff9900,#ff4d4d)",
      color: "#fff", fontFamily: FONT_JP, transition: "all 0.2s",
    },
    cancelBtnMobile: {
      width: 50, height: 50, borderRadius: 10, fontSize: 18,
      border: "1px solid #f85149", background: "rgba(248,81,73,0.08)",
      color: "#f85149", cursor: "pointer", fontFamily: FONT_MONO,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    csvBtnMobile: (flash) => ({
      width: 50, height: 50, borderRadius: 10, fontSize: 18,
      border: flash ? "1px solid #3fb950" : "1px solid #30363d",
      background: flash ? "rgba(63,185,80,0.12)" : "rgba(255,255,255,0.03)",
      cursor: results.length === 0 ? "not-allowed" : "pointer",
      fontFamily: FONT_MONO, transition: "all 0.2s",
      display: "flex", alignItems: "center", justifyContent: "center",
      opacity: results.length === 0 ? 0.3 : 1, flexShrink: 0,
    }),
  };

  return (
    <div style={C.root}>

      {/* [fix] モバイル スクロール中でも見えるトーストプログレス */}
      {isMobile && running && (
        <div style={C.progressToast}>
          <div style={{ fontSize: 10, color: "#8b949e", whiteSpace: "nowrap", fontFamily: FONT_MONO }}>
            {progress}%
          </div>
          <div style={C.toastBar}><div style={C.toastFill} /></div>
          <div style={{ fontSize: 10, color: "#e6edf3", whiteSpace: "nowrap", fontFamily: FONT_JP, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
            {proxyStatus ? `[${proxyStatus}] ` : ""}{currentTicker}
          </div>
        </div>
      )}

      {/* ━━━━ ヘッダー ━━━━ */}
      <div style={C.header}>
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 2 : 4 }}>
          <div>
            <span style={C.title}>NIKKEI β SCREENER</span>
            {!isMobile && <span style={C.vBadge}>{VERSION}</span>}
          </div>
          {isMobile
            ? <span style={C.vBadge}>{VERSION}</span>
            : <div style={C.sub}>日経平均連動率（ハイベータ）銘柄スクリーナー</div>
          }
          {isMobile && <div style={{ fontSize: 9, color: "#484f58" }}>日経平均 ハイベータ銘柄スクリーナー</div>}
        </div>
        <div style={C.headerMeta}>BENCHMARK: {BENCHMARK}<br />UNIVERSE: {TICKERS.length} STOCKS</div>
      </div>

      {/* ━━━━ メイン ━━━━ */}
      <div style={C.main}>

        {/* コントロールカード */}
        <div style={C.card}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap" }}>

            {/* 期間選択 */}
            <div>
              <div style={C.sectionLabel}>▸ PERIOD</div>
              <div style={C.periodGroup}>
                {PERIODS.map((p) => (
                  <button key={p.value} style={C.periodBtn(period === p.value)}
                    onClick={() => !running && setPeriod(p.value)}>
                    {isMobile ? p.label : p.labelFull}
                    {p.warn && <span style={{ fontSize: 8, marginLeft: 2, color: "#ff9900", verticalAlign: "super" }}>!</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* デスクトップ: スキャン / キャンセル / CSV */}
            {!isMobile && (
              <>
                <div>
                  <div style={{ ...C.sectionLabel, visibility: "hidden" }}>▸</div>
                  {/* [fix] スキャン中はキャンセルボタンに切替 */}
                  {running ? (
                    <button style={C.cancelBtnDesktop} onClick={handleCancel}>
                      ✕ キャンセル
                    </button>
                  ) : (
                    <button style={C.runBtnDesktop} onClick={run}>
                      ▶ スキャン開始
                    </button>
                  )}
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <div style={{ ...C.sectionLabel, textAlign: "right" }}>▸ EXPORT</div>
                  <button style={C.csvBtnDesktop(csvFlash)} onClick={handleCSV} disabled={results.length === 0}>
                    {csvFlash ? "✓ ダウンロード完了" : "⬇ CSV ダウンロード"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* プログレスバー（デスクトップ） */}
          {!isMobile && running && (
            <div style={{ marginTop: 14 }}>
              <div style={C.progressWrap}><div style={C.progressFill} /></div>
              <div style={{ fontSize: 10, color: "#8b949e", fontFamily: FONT_MONO }}>
                {currentTicker && <span style={{ color: "#e6edf3", fontFamily: FONT_JP }}>{currentTicker} </span>}
                {status} — {progress}%{proxyStatus && <span style={{ color: "#484f58" }}> [{proxyStatus}]</span>}
              </div>
            </div>
          )}
          {!running && status && !error && (
            <div style={{ marginTop: 12, fontSize: 12, color: cancelled ? "#ff9900" : "#3fb950" }}>
              {cancelled ? "⚠" : "✓"} {status}
            </div>
          )}
          {error && (
            <div style={{ ...C.error, marginTop: 12 }}>
              {error.split("\n").map((line, i) => (
                <div key={i} style={{ marginBottom: i === 0 ? 6 : 2 }}>
                  {i === 0 ? "⚠ " : "　"}{line}
                </div>
              ))}
            </div>
          )}

          {/* 1M 注意バナー */}
          {isShortPeriod(period) && !running && (
            <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "rgba(255,153,0,0.08)", border: "1px solid rgba(255,153,0,0.3)", fontSize: 11, color: "#ff9900", display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚠</span>
              <span>1ヶ月は約21営業日しかなく、ベータの統計的信頼性が低くなります。参考値としてご利用ください。3M以上との比較を推奨します。</span>
            </div>
          )}
        </div>

        {/* ━━━━ 結果エリア ━━━━ */}
        {results.length > 0 && (
          <>
            {/* サマリーカード */}
            <div style={C.summaryGrid}>
              {[
                { label: "スキャン銘柄数", value: results.length },
                { label: "超ハイβ（β≥1.5）", value: results.filter(r => r.beta >= 1.5).length, color: "#ff4d4d" },
                { label: "ハイβ（1.0≤β<1.5）", value: results.filter(r => r.beta >= 1.0 && r.beta < 1.5).length, color: "#ff9900" },
                // [fix] スキップ件数をサマリーに表示
                skipped > 0
                  ? { label: "スキップ件数", value: skipped, color: "#8b949e", sub: "データ不足または取得失敗" }
                  : { label: "最高ベータ銘柄", value: results[0]?.name, sub: `β = ${results[0]?.beta.toFixed(2)}`, color: "#ff4d4d" },
              ].map((c, i) => (
                <div key={i} style={C.summaryCard}>
                  <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: "0.08em", marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: c.color || "#e6edf3", fontFamily: typeof c.value === "number" ? FONT_MONO : FONT_JP }}>
                    {c.value}
                  </div>
                  {c.sub && <div style={{ fontSize: 10, color: "#8b949e", marginTop: 3 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* タブ */}
            <div>
              <div style={C.tabRow}>
                {[["table", "📋 一覧"], ["bar", "📊 ランキング"], ["scatter", "🔵 Beta vs R²"]].map(([key, label]) => (
                  <button key={key} style={C.tabBtn(tab === key)} onClick={() => setTab(key)}>{label}</button>
                ))}
              </div>

              <div style={C.tabContent}>

                {/* ── 一覧 ── */}
                {tab === "table" && (
                  isMobile ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px 10px" }}>
                        <span style={{ ...C.sectionLabel, marginBottom: 0 }}>全 {results.length} 銘柄</span>
                        <button style={{ height: 32, padding: "0 12px", borderRadius: 6, fontSize: 11, border: csvFlash ? "1px solid #3fb950" : "1px solid #30363d", background: csvFlash ? "rgba(63,185,80,0.12)" : "transparent", color: csvFlash ? "#3fb950" : "#8b949e", cursor: "pointer", fontFamily: FONT_JP }} onClick={handleCSV}>
                          {csvFlash ? "✓" : "⬇ CSV"}
                        </button>
                      </div>
                      {/* [fix] ソートバー：ラベルに単位を追加 */}
                      <div style={{ display: "flex", gap: 6, padding: "0 16px 12px", overflowX: "auto" }}>
                        {[["beta","β値"],["r2","R²"],["vol","ボラ(%)"],["corr","相関ρ"]].map(([key, label]) => (
                          <button key={key} onClick={() => handleSort(key)} style={{ height: 30, padding: "0 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", border: sortKey === key ? "1px solid #ff9900" : "1px solid #30363d", background: sortKey === key ? "rgba(255,153,0,0.1)" : "transparent", color: sortKey === key ? "#ff9900" : "#8b949e", cursor: "pointer", fontFamily: FONT_MONO }}>
                            {label}{sortIcon(key)}
                          </button>
                        ))}
                      </div>
                      {sorted.map((r, i) => <MobileRow key={r.code} r={r} rank={i + 1} />)}
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={C.sectionLabel}>▸ 全 {results.length} 銘柄（列ヘッダーで降順ソート）</div>
                        <button style={{ ...C.csvBtnDesktop(csvFlash), height: 32, padding: "0 14px", fontSize: 11 }} onClick={handleCSV}>
                          {csvFlash ? "✓ 完了" : "⬇ CSV"}
                        </button>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              {[
                                ["#",     null,   "left"],
                                ["銘柄名","name", "left"],
                                ["コード",null,   "left"],
                                ["Beta",  "beta", "right"],
                                ["レベル",null,   "left"],
                                ["相関 ρ","corr", "right"],
                                ["R²",    "r2",   "right"],
                                ["年率ボラ%","vol","right"],
                                ["日数",  "n",    "right"],
                              ].map(([label, key, align]) => (
                                <th key={label} style={{ ...C.th(align), cursor: key ? "pointer" : "default" }}
                                  onClick={() => key && handleSort(key)}>
                                  {label}{key ? sortIcon(key) : ""}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map((r, i) => (
                              <tr key={r.code} style={{ background: i % 2 === 0 ? "transparent" : "#0a0e15" }}>
                                <td style={{ ...C.td("left"), color: "#484f58", fontFamily: FONT_MONO }}>{i + 1}</td>
                                <td style={{ ...C.td("left"), fontWeight: 600, fontFamily: FONT_JP }}>{r.name}</td>
                                <td style={{ ...C.td("left"), color: "#8b949e", fontSize: 11, fontFamily: FONT_MONO }}>{r.code}</td>
                                <td style={C.td("right")}><span style={C.badge(r.beta)}>{r.beta.toFixed(3)}</span></td>
                                <td style={C.td("left")}><span style={{ fontSize: 10, color: betaColor(r.beta), fontFamily: FONT_JP }}>{betaLabel(r.beta)}</span></td>
                                <td style={{ ...C.td("right"), color: "#e6edf3", fontFamily: FONT_MONO }}>{r.corr.toFixed(3)}</td>
                                <td style={{ ...C.td("right"), color: "#e6edf3", fontFamily: FONT_MONO }}>{r.r2.toFixed(3)}</td>
                                <td style={{ ...C.td("right"), color: "#e6edf3", fontFamily: FONT_MONO }}>{r.vol.toFixed(1)}</td>
                                <td style={{ ...C.td("right"), color: "#484f58", fontSize: 11, fontFamily: FONT_MONO }}>{r.n}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}

                {/* ── 棒グラフ ── */}
                {tab === "bar" && (
                  <div style={{ padding: isMobile ? "0 0 8px" : 0 }}>
                    <div style={{ ...C.sectionLabel, marginBottom: 16, padding: isMobile ? "0 16px" : 0 }}>
                      ▸ TOP {isMobile ? 10 : 15} 銘柄 — BETA RANKING
                    </div>
                    <ResponsiveContainer width="100%" height={isMobile ? 280 : 420}>
                      <BarChart data={isMobile ? top15.slice(0,10) : top15} layout="vertical"
                        margin={{ left: isMobile ? 8 : 20, right: isMobile ? 40 : 50, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" horizontal={false} />
                        <XAxis type="number" dataKey="beta" domain={[0, "auto"]}
                          tick={{ fill: "#8b949e", fontSize: isMobile ? 9 : 11, fontFamily: FONT_MONO }} />
                        <YAxis type="category" dataKey="name" width={isMobile ? 90 : 130}
                          tick={{ fill: "#e6edf3", fontSize: isMobile ? 10 : 12, fontFamily: FONT_JP }} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <ReferenceLine x={1} stroke="#484f58" strokeDasharray="4 4"
                          label={{ value: "β=1", fill: "#484f58", fontSize: isMobile ? 9 : 11, fontFamily: FONT_MONO }} />
                        <Bar dataKey="beta" radius={[0, 4, 4, 0]}>
                          {(isMobile ? top15.slice(0,10) : top15).map((entry, i) => (
                            <Cell key={i} fill={betaColor(entry.beta)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── 散布図 ── */}
                {tab === "scatter" && (
                  <div style={{ padding: isMobile ? "0 0 8px" : 0 }}>
                    <div style={{ ...C.sectionLabel, marginBottom: 16, padding: isMobile ? "0 16px" : 0 }}>
                      ▸ BETA vs R²　{!isMobile && "（円サイズ ∝ 年率ボラティリティ）"}
                    </div>
                    <ResponsiveContainer width="100%" height={isMobile ? 280 : 420}>
                      <ScatterChart margin={{ top: 10, right: isMobile ? 10 : 30, bottom: isMobile ? 30 : 20, left: isMobile ? -10 : 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="r2" name="R²" domain={[0, 1]}
                          tick={{ fill: "#8b949e", fontSize: isMobile ? 9 : 11, fontFamily: FONT_MONO }}
                          label={{ value: "R²", fill: "#8b949e", fontSize: isMobile ? 9 : 11, position: "insideBottom", offset: -12, fontFamily: FONT_MONO }} />
                        <YAxis dataKey="beta" name="Beta"
                          tick={{ fill: "#8b949e", fontSize: isMobile ? 9 : 11, fontFamily: FONT_MONO }}
                          label={{ value: "Beta", fill: "#8b949e", fontSize: isMobile ? 9 : 11, angle: -90, position: "insideLeft", offset: isMobile ? 14 : 0, fontFamily: FONT_MONO }} />
                        <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#30363d" }} />
                        <ReferenceLine y={1} stroke="#484f58" strokeDasharray="4 4" />
                        <Scatter data={results} fill="#ff9900"
                          shape={(props) => {
                            const r = isMobile
                              ? Math.max(4, Math.min(12, props.payload.vol / 6))
                              : Math.max(5, Math.min(20, props.payload.vol / 5));
                            return (
                              <circle cx={props.cx} cy={props.cy} r={r}
                                fill={betaColor(props.payload.beta)} fillOpacity={0.7}
                                stroke={betaColor(props.payload.beta)} strokeWidth={1} />
                            );
                          }}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", gap: isMobile ? 10 : 20, marginTop: 10, fontSize: isMobile ? 10 : 11, color: "#8b949e", flexWrap: "wrap", padding: isMobile ? "0 16px" : 0, fontFamily: FONT_JP }}>
                      {[["超ハイβ≥1.5","#ff4d4d"],["ハイβ≥1.2","#ff9900"],["標準≥0.8","#4dccff"],["ローβ","#66ff99"]].map(([label, color]) => (
                        <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ━━━━ 初期状態 ━━━━ */}
        {results.length === 0 && !running && (
          <div style={C.emptyCard}>
            <div style={{ fontSize: isMobile ? 32 : 36, marginBottom: 14 }}>📡</div>
            <div style={{ fontSize: isMobile ? 13 : 14, color: "#8b949e", lineHeight: 2 }}>
              {isMobile
                ? <>期間を選んで<br />下のボタンでスキャン開始</>
                : <>期間を選択して「スキャン開始」を押してください<br />Yahoo Finance から日次データを取得しベータ値を計算します</>
              }
            </div>
            <div style={{ marginTop: 16, fontSize: isMobile ? 10 : 11, color: "#3d4450", lineHeight: 2, fontFamily: FONT_MONO }}>
              β ≥ 1.5：超ハイβ（赤）｜1.0 ≤ β &lt; 1.5：ハイβ（橙）｜β &lt; 1.0：ローβ（青/緑）
            </div>
          </div>
        )}

        {/* フッター */}
        {!isMobile && (
          <div style={{ marginTop: 32, textAlign: "center", fontSize: 10, color: "#21262d", fontFamily: FONT_MONO }}>
            NIKKEI β SCREENER {VERSION} — Benchmark: {BENCHMARK} — Universe: {TICKERS.length} stocks
          </div>
        )}
      </div>

      {/* ━━━━ モバイル スティッキーCTA ━━━━ */}
      {isMobile && (
        <div style={C.stickyBar}>
          {/* [fix] スキャン中はキャンセルボタンを表示 */}
          {running ? (
            <>
              <button style={{ ...C.runBtnMobile, background: "#21262d", color: "#8b949e", cursor: "not-allowed" }} disabled>
                ⏳ {progress}%
              </button>
              <button style={C.cancelBtnMobile} onClick={handleCancel} title="スキャンを中断">
                ✕
              </button>
            </>
          ) : (
            <>
              <button style={C.runBtnMobile} onClick={run}>▶ スキャン開始</button>
              <button style={C.csvBtnMobile(csvFlash)} onClick={handleCSV} disabled={results.length === 0} title="CSVダウンロード">
                {csvFlash ? "✓" : "⬇"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
