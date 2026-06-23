/**
 * Mise à jour données de marché — Twelve Data
 * Robuste: appels individuels, gestion d'erreur par symbole, diagnostic dans le store
 * Fonction planifiée Netlify (limite 30s)
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export const config = { schedule: "0 14 * * 1-5" };

const TD_KEY = process.env.TWELVE_DATA_KEY;
const BASE = "https://api.twelvedata.com";

async function td(endpoint, params) {
  const url = `${BASE}/${endpoint}?` + new URLSearchParams({ ...params, apikey: TD_KEY });
  const r = await fetch(url);
  const j = await r.json();
  return j; // on ne lève pas d'erreur: on inspecte le statut nous-mêmes
}

function pct(a, b) {
  if (!a || !b || b === 0) return null;
  return Math.round((a / b - 1) * 10000) / 100;
}

function calcReturns(values) {
  if (!values || values.length < 2) return {};
  const close = (i) => (values[i] ? parseFloat(values[i].close) : null);
  const now = close(0), m1 = close(1), m3 = close(3), m6 = close(6),
        m12 = close(12), m36 = close(36), m60 = close(60), m120 = close(120);
  return {
    r1m: pct(now, m1), r3m: pct(now, m3), r6m: pct(now, m6), r1a: pct(now, m12),
    r3a: m36 ? Math.round((Math.pow(now/m36, 1/3) - 1) * 10000)/100 : null,
    r5a: m60 ? Math.round((Math.pow(now/m60, 1/5) - 1) * 10000)/100 : null,
    r10a: m120 ? Math.round((Math.pow(now/m120, 1/10) - 1) * 10000)/100 : null,
    prix: now,
  };
}

export default async function handler() {
  const store = getStore("gff-marches");
  const diag = []; // messages de diagnostic

  if (!TD_KEY) {
    await store.setJSON("market-data-debug", { erreur: "TWELVE_DATA_KEY absente", when: new Date().toISOString() });
    return new Response("Config manquante", { status: 500 });
  }

  const data = {
    timestamp: new Date().toISOString(),
    indices: {}, forex: {}, commodities: {},
    macro: { taux_bdc: 2.75, taux_bdc_note: "Baisse avril 2026", inflation: 2.3, obligations_10ans: 3.42 },
  };

  // Symboles: plusieurs candidats pour le TSX (le 1er qui marche gagne)
  const indices = [
    { key: "sp500",  syms: ["SPY"],            nom: "S&P 500",      pays: "États-Unis" },
    { key: "nasdaq", syms: ["QQQ"],            nom: "NASDAQ",       pays: "États-Unis" },
    { key: "dow",    syms: ["DIA"],            nom: "DOW JONES",    pays: "États-Unis" },
    { key: "tsx",    syms: ["XIC.TO","EWC","XIU.TO"], nom: "TSX Composite", pays: "Canada" },
  ];

  let ok = 0;
  for (const idx of indices) {
    let done = false;
    for (const sym of idx.syms) {
      try {
        const resp = await td("time_series", {
          symbol: sym, interval: "1month", outputsize: "130", order: "DESC",
        });
        if (resp.status === "error") {
          diag.push(`${idx.key}/${sym}: ${resp.message || "erreur API"}`);
          continue; // essayer le symbole suivant
        }
        const values = resp.values || [];
        if (values.length < 2) { diag.push(`${idx.key}/${sym}: série vide`); continue; }

        const returns = calcReturns(values);
        const now = parseFloat(values[0].close);
        const prev = parseFloat(values[1].close);
        const changePct = prev ? ((now/prev - 1) * 100) : 0;

        data.indices[idx.key] = {
          nom: idx.nom, pays: idx.pays,
          price: now.toFixed(2), changePct: changePct.toFixed(2),
          ...returns,
        };
        diag.push(`${idx.key}/${sym}: OK (1A=${returns.r1a}%)`);
        ok++; done = true;
        break; // symbole trouvé, passer à l'indice suivant
      } catch (e) {
        diag.push(`${idx.key}/${sym}: exception ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    if (!done) data.indices[idx.key] = { nom: idx.nom, pays: idx.pays, error: true };
  }

  // USD/CAD
  try {
    const fx = await td("exchange_rate", { symbol: "USD/CAD" });
    if (fx.rate) data.forex.usdcad = { rate: parseFloat(fx.rate).toFixed(4) };
    else diag.push("usdcad: " + (fx.message || "pas de rate"));
  } catch (e) { diag.push("usdcad: " + e.message); }

  // Or
  try {
    const gold = await td("exchange_rate", { symbol: "XAU/USD" });
    if (gold.rate) data.commodities.gold = { price: parseFloat(gold.rate).toFixed(2) };
  } catch (e) { diag.push("gold: " + e.message); }

  // Écrire les données SEULEMENT si au moins un indice a réussi
  if (ok > 0) {
    await store.setJSON("market-data", data);
  }
  // Toujours écrire le diagnostic (accessible via /api/marches-debug)
  await store.setJSON("market-data-debug", {
    when: new Date().toISOString(),
    indices_reussis: ok + "/4",
    details: diag,
  });

  return new Response(JSON.stringify({ success: true, ok, diag }), { status: 200 });
}
