/**
 * Mise à jour données de marché + rendements historiques — lun-ven 9h EST
 * Source: Twelve Data (plan gratuit: 800 crédits/jour, 8 crédits/minute)
 * Fonction planifiée Netlify (limite 30s) — optimisée pour ~6s d'exécution
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export const config = { schedule: "0 14 * * 1-5" };

const TD_KEY = process.env.TWELVE_DATA_KEY;
const BASE = "https://api.twelvedata.com";

async function td(endpoint, params) {
  const url = `${BASE}/${endpoint}?` + new URLSearchParams({ ...params, apikey: TD_KEY });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TD ${r.status}`);
  const j = await r.json();
  if (j.status === "error") throw new Error(j.message || "TD error");
  return j;
}

function pct(a, b) {
  if (!a || !b || b === 0) return null;
  return Math.round((a / b - 1) * 10000) / 100;
}

/** Calcule les rendements à partir d'une série mensuelle (plus récent en premier) */
function calcReturns(values) {
  if (!values || values.length < 2) return {};
  const close = (i) => (values[i] ? parseFloat(values[i].close) : null);

  const now  = close(0);
  const m1   = close(1);
  const m3   = close(3);
  const m6   = close(6);
  const m12  = close(12);
  const m36  = close(36);
  const m60  = close(60);
  const m120 = close(120);

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
  if (!TD_KEY) {
    console.error("TWELVE_DATA_KEY manquante");
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

  const indices = [
    { key: "sp500",  sym: "SPY",    nom: "S&P 500",      pays: "États-Unis" },
    { key: "tsx",    sym: "XIC.TO", nom: "TSX Composite", pays: "Canada" },
    { key: "nasdaq", sym: "QQQ",    nom: "NASDAQ",        pays: "États-Unis" },
    { key: "dow",    sym: "DIA",    nom: "DOW JONES",     pays: "États-Unis" },
  ];

  // 1. UN SEUL appel groupé time_series pour les 4 indices (4 crédits)
  //    Les prix courants + variation sont déduits de la série elle-même.
  const symList = indices.map(i => i.sym).join(",");
  let seriesData = {};
  try {
    const resp = await td("time_series", {
      symbol: symList,
      interval: "1month",
      outputsize: "130",  // ~10 ans
      order: "DESC",      // plus récent en premier
    });
    // Avec plusieurs symboles, TD retourne { "SPY": {...}, "XIC.TO": {...}, ... }
    // Avec un seul symbole, il retourne directement { values: [...] }
    seriesData = (resp.values) ? { [indices[0].sym]: resp } : resp;
  } catch (e) {
    console.error("Erreur time_series:", e.message);
  }

  for (const idx of indices) {
    try {
      const s = seriesData[idx.sym];
      const values = (s && s.values) ? s.values : [];
      if (values.length < 2) throw new Error("série vide");

      const returns = calcReturns(values);
      // Prix courant = dernière clôture; variation = vs mois précédent
      const now = parseFloat(values[0].close);
      const prev = parseFloat(values[1].close);
      const changePct = prev ? ((now / prev - 1) * 100) : 0;

      data.indices[idx.key] = {
        nom: idx.nom,
        pays: idx.pays,
        price: now.toFixed(2),
        changePct: changePct.toFixed(2),
        ...returns,
      };
      console.log(`${idx.key}: ${now} | 1A=${returns.r1a}% 5A=${returns.r5a}%`);
    } catch (e) {
      console.error(`Erreur ${idx.key}:`, e.message);
      data.indices[idx.key] = { nom: idx.nom, pays: idx.pays, error: true };
    }
  }

  // 2. USD/CAD (1 crédit)
  try {
    const fx = await td("exchange_rate", { symbol: "USD/CAD" });
    if (fx.rate) data.forex.usdcad = { rate: parseFloat(fx.rate).toFixed(4) };
  } catch (e) {
    data.forex.usdcad = { rate: "1.3720", error: true };
  }

  // 3. Or XAU/USD (1 crédit)
  try {
    const gold = await td("exchange_rate", { symbol: "XAU/USD" });
    if (gold.rate) data.commodities.gold = { price: parseFloat(gold.rate).toFixed(2) };
  } catch (e) {
    data.commodities.gold = { price: "3124.00", error: true };
  }

  await store.setJSON("market-data", data);
  console.log("Marchés mis à jour:", new Date().toISOString());
  return new Response(JSON.stringify({ success: true, indices: Object.keys(data.indices).length }), { status: 200 });
}
