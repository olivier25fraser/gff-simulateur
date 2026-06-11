/**
 * Mise à jour données de marché + rendements historiques — lun-ven 9h EST
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export const config = { schedule: "0 14 * * 1-5" };

const AV_KEY = process.env.ALPHA_VANTAGE_KEY;
const DELAY  = 13000; // 5 req/min sur free tier

async function fetchAV(params) {
  const url = "https://www.alphavantage.co/query?" +
    new URLSearchParams({ ...params, apikey: AV_KEY });
  const r = await fetch(url);
  if (!r.ok) throw new Error("AV " + r.status);
  return r.json();
}

function pct(a, b) {
  if (!a || !b || b === 0) return null;
  return Math.round((a / b - 1) * 10000) / 100; // 2 décimales
}

/**
 * Calcule les rendements périodiques à partir des données mensuelles ajustées.
 * Retourne { r1m, r3m, r6m, r1a, r3a, r5a, r10a }
 */
function calcReturns(monthlyData) {
  const entries = Object.entries(monthlyData)
    .sort((a, b) => b[0].localeCompare(a[0])); // plus récent en premier

  if (entries.length < 2) return {};

  const close = (i) => {
    if (!entries[i]) return null;
    const v = entries[i][1]["5. adjusted close"] || entries[i][1]["4. close"];
    return v ? parseFloat(v) : null;
  };

  const now   = close(0);
  const m1    = close(1);
  const m3    = close(3);
  const m6    = close(6);
  const m12   = close(12);
  const m36   = close(36);
  const m60   = close(60);
  const m120  = close(120);

  return {
    r1m:  pct(now, m1),
    r3m:  pct(now, m3),
    r6m:  pct(now, m6),
    r1a:  pct(now, m12),
    r3a:  m36  ? Math.round((Math.pow(now/m36,  1/3)  - 1) * 10000) / 100 : null,
    r5a:  m60  ? Math.round((Math.pow(now/m60,  1/5)  - 1) * 10000) / 100 : null,
    r10a: m120 ? Math.round((Math.pow(now/m120, 1/10) - 1) * 10000) / 100 : null,
    prix: now,
  };
}

export default async function handler() {
  if (!AV_KEY) {
    console.error("ALPHA_VANTAGE_KEY manquante");
    return new Response("Config manquante", { status: 500 });
  }

  const store = getStore("gff-marches");

  const data = {
    timestamp: new Date().toISOString(),
    indices: {},
    forex: {},
    commodities: {},
    macro: {
      taux_bdc: 2.75,
      taux_bdc_note: "Baisse avril 2026",
      inflation: 2.3,
      obligations_10ans: 3.42,
    },
  };

  // Symboles ETF (proxy fidèles des indices, données dispo sur AV free)
  const indices = [
    { key: "sp500",  sym: "SPY",     nom: "S&P 500",       pays: "États-Unis" },
    { key: "tsx",    sym: "XIU.TRT", nom: "TSX Composite",  pays: "Canada"     },
    { key: "nasdaq", sym: "QQQ",     nom: "NASDAQ",         pays: "États-Unis" },
    { key: "dow",    sym: "DIA",     nom: "DOW JONES",      pays: "États-Unis" },
  ];

  for (const idx of indices) {
    try {
      // 1. Quote courant
      const quote = await fetchAV({ function: "GLOBAL_QUOTE", symbol: idx.sym });
      await new Promise(r => setTimeout(r, DELAY));

      const q = quote["Global Quote"] || {};
      const price      = parseFloat(q["05. price"])                    || 0;
      const changePct  = parseFloat(q["10. change percent"]?.replace("%","")) || 0;

      // 2. Données mensuelles ajustées (20+ ans d'historique)
      const monthly = await fetchAV({
        function:   "TIME_SERIES_MONTHLY_ADJUSTED",
        symbol:     idx.sym,
        outputsize: "full",
      });
      await new Promise(r => setTimeout(r, DELAY));

      const series  = monthly["Monthly Adjusted Time Series"] || {};
      const returns = calcReturns(series);

      data.indices[idx.key] = {
        nom:      idx.nom,
        pays:     idx.pays,
        price:    price.toFixed(2),
        changePct: changePct.toFixed(2),
        ...returns,
      };

      console.log(`${idx.key}: ${price} (${changePct}%) | 1A=${returns.r1a}%`);
    } catch (e) {
      console.error(`Erreur ${idx.key}:`, e.message);
      data.indices[idx.key] = {
        nom:   idx.nom,
        pays:  idx.pays,
        error: true,
      };
    }
  }

  // Taux de change USD/CAD
  try {
    const fx = await fetchAV({
      function:      "CURRENCY_EXCHANGE_RATE",
      from_currency: "USD",
      to_currency:   "CAD",
    });
    const rate = fx["Realtime Currency Exchange Rate"];
    if (rate) data.forex.usdcad = { rate: parseFloat(rate["5. Exchange Rate"]).toFixed(4) };
    await new Promise(r => setTimeout(r, DELAY));
  } catch (e) {
    data.forex.usdcad = { rate: "1.3720", error: true };
  }

  // Or
  try {
    const gold = await fetchAV({
      function:      "CURRENCY_EXCHANGE_RATE",
      from_currency: "XAU",
      to_currency:   "USD",
    });
    const rate = gold["Realtime Currency Exchange Rate"];
    if (rate) data.commodities.gold = { price: parseFloat(rate["5. Exchange Rate"]).toFixed(2) };
  } catch (e) {
    data.commodities.gold = { price: "3124.00", error: true };
  }

  await store.setJSON("market-data", data);
  console.log("Marchés mis à jour:", new Date().toISOString());
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
