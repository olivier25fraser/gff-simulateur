/**
 * Fonction Netlify — Mise à jour données de marché
 * Groupe Financier Formule
 *
 * Tourne chaque matin à 9h00 EST (14h00 UTC)
 * Appelle Alpha Vantage et sauvegarde dans Netlify Blobs
 * Les clients lisent depuis le cache — appels API illimités côté client
 */

import { getStore } from "@netlify/blobs";

export const config = {
  schedule: "0 14 * * 1-5", // Lundi au vendredi à 9h00 EST
};

const AV_KEY = process.env.ALPHA_VANTAGE_KEY;
const BASE = "https://www.alphavantage.co/query";

async function fetchAV(params) {
  const url = `${BASE}?${new URLSearchParams({ ...params, apikey: AV_KEY })}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`AV error ${r.status}`);
  return r.json();
}

export default async function handler(req) {
  if (!AV_KEY) {
    console.error("ALPHA_VANTAGE_KEY manquante dans les variables Netlify");
    return new Response("Clé manquante", { status: 500 });
  }

  const store = getStore("gff-marches");
  const errors = [];
  const data = {
    timestamp: new Date().toISOString(),
    indices: {},
    forex: {},
    commodities: {},
    macro: {
      taux_bdc: 2.75,           // Mis à jour manuellement lors des annonces BdC
      taux_bdc_date: "2026-04-16",
      taux_bdc_note: "Baissé en avril 2026",
      inflation: 2.3,
      inflation_date: "2026-04",
      obligations_10ans: 3.42,
    }
  };

  // ── Indices boursiers ──
  const symbols = {
    sp500:  { sym: "SPY",     nom: "S&P 500",     pays: "États-Unis",     desc: "500 grandes entreprises américaines" },
    tsx:    { sym: "XIU.TRT", nom: "TSX Composite",pays: "Canada",         desc: "300 grandes entreprises canadiennes" },
    nasdaq: { sym: "QQQ",     nom: "NASDAQ",       pays: "États-Unis",     desc: "Entreprises technologiques" },
    dow:    { sym: "DIA",     nom: "DOW JONES",    pays: "États-Unis",     desc: "30 entreprises emblématiques" },
  };

  for (const [key, info] of Object.entries(symbols)) {
    try {
      const d = await fetchAV({ function: "GLOBAL_QUOTE", symbol: info.sym });
      const q = d["Global Quote"];
      if (q && q["05. price"]) {
        const price = parseFloat(q["05. price"]);
        const change = parseFloat(q["09. change"]);
        const changePct = parseFloat(q["10. change percent"]?.replace('%',''));
        data.indices[key] = {
          ...info,
          price: price.toFixed(2),
          change: change.toFixed(2),
          changePct: changePct.toFixed(2),
          prevClose: parseFloat(q["08. previous close"]).toFixed(2),
          volume: q["06. volume"],
          latestTradingDay: q["07. latest trading day"],
        };
      }
    } catch(e) {
      errors.push(`${key}: ${e.message}`);
      // Données de fallback
      data.indices[key] = { ...info, price: "—", change: "0", changePct: "0", error: true };
    }
    // Pause pour respecter la limite de 5 appels/min du plan gratuit
    await new Promise(r => setTimeout(r, 13000));
  }

  // ── Taux de change USD/CAD ──
  try {
    const fx = await fetchAV({ function: "CURRENCY_EXCHANGE_RATE", from_currency: "USD", to_currency: "CAD" });
    const rate = fx["Realtime Currency Exchange Rate"];
    if (rate) {
      data.forex.usdcad = {
        rate: parseFloat(rate["5. Exchange Rate"]).toFixed(4),
        bid: parseFloat(rate["8. Bid Price"]).toFixed(4),
        ask: parseFloat(rate["9. Ask Price"]).toFixed(4),
        timestamp: rate["6. Last Refreshed"],
      };
    }
    await new Promise(r => setTimeout(r, 13000));
  } catch(e) {
    errors.push(`USD/CAD: ${e.message}`);
    data.forex.usdcad = { rate: "0.7284", error: true };
  }

  // ── Or (Gold) ──
  try {
    const gold = await fetchAV({ function: "CURRENCY_EXCHANGE_RATE", from_currency: "XAU", to_currency: "USD" });
    const rate = gold["Realtime Currency Exchange Rate"];
    if (rate) {
      data.commodities.gold = {
        price: parseFloat(rate["5. Exchange Rate"]).toFixed(2),
        timestamp: rate["6. Last Refreshed"],
      };
    }
    await new Promise(r => setTimeout(r, 13000));
  } catch(e) {
    errors.push(`Gold: ${e.message}`);
    data.commodities.gold = { price: "3124.00", error: true };
  }

  // ── Pétrole WTI ──
  try {
    const oil = await fetchAV({ function: "GLOBAL_QUOTE", symbol: "USO" });
    const q = oil["Global Quote"];
    if (q && q["05. price"]) {
      // USO ≈ WTI/10, on affiche une approximation
      data.commodities.oil = {
        price: (parseFloat(q["05. price"]) * 10).toFixed(2),
        changePct: parseFloat(q["10. change percent"]?.replace('%','')).toFixed(2),
        note: "Approximation via USO ETF",
      };
    }
  } catch(e) {
    errors.push(`Oil: ${e.message}`);
    data.commodities.oil = { price: "72.40", changePct: "-2.1", error: true };
  }

  // Calculer variations hebdomadaires (approximation: changePct journalier × 5)
  for (const key of Object.keys(data.indices)) {
    const ind = data.indices[key];
    if (ind.changePct && !ind.error) {
      ind.weekChangePct = (parseFloat(ind.changePct) * 2.5).toFixed(2); // estimation
    }
  }

  // Sauvegarder dans Netlify Blobs
  await store.setJSON("market-data", data);

  const summary = `Indices: ${Object.keys(data.indices).join(', ')} | Erreurs: ${errors.length}`;
  console.log(`✓ Données de marché mises à jour — ${summary}`);

  return new Response(JSON.stringify({ success: true, summary, errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
