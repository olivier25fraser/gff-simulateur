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
    macro: { taux_bdc: null, taux_bdc_note: null, inflation: null, obligations_10ans: null },
  };

  // Symboles: plusieurs candidats pour le TSX (le 1er qui marche gagne)
  // facteur = ratio ETF → valeur réelle de l'indice (rendements % inchangés)
  const indices = [
    { key: "sp500",  syms: ["SPY"],            nom: "S&P 500",           pays: "États-Unis", facteur: 9.09  },
    { key: "nasdaq", syms: ["QQQ"],            nom: "NASDAQ",            pays: "États-Unis", facteur: 30.6  },
    { key: "dow",    syms: ["DIA"],            nom: "DOW JONES",         pays: "États-Unis", facteur: 100   },
    { key: "tsx",    syms: ["EWC","XIC.TO","XIU.TO"], nom: "S&P/TSX Composite", pays: "Canada", facteur: 441.7 },
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

        const fact = idx.facteur || 1;
        data.indices[idx.key] = {
          nom: idx.nom, pays: idx.pays,
          price: (now * fact).toFixed(2), changePct: changePct.toFixed(2),
          ...returns,
        };
        delete data.indices[idx.key].prix; // retirer le prix brut ETF
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

  // Pétrole WTI via Yahoo Finance (gratuit, sans clé — CL=F = contrat futures WTI)
  try {
    const yUrl = "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=5d";
    const yResp = await fetch(yUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const yJson = await yResp.json();
    const meta  = yJson?.chart?.result?.[0]?.meta;
    const quotes = yJson?.chart?.result?.[0]?.indicators?.quote?.[0];
    if (meta && meta.regularMarketPrice) {
      const now  = parseFloat(meta.regularMarketPrice);
      const prev = parseFloat(meta.chartPreviousClose || meta.previousClose || now);
      const chg  = prev ? ((now / prev - 1) * 100) : 0;
      data.commodities.oil = { price: now.toFixed(2), changePct: chg.toFixed(2) };
      diag.push(`oil/YF: ${now.toFixed(2)} (${chg.toFixed(2)}%)`);
    } else {
      diag.push("oil/YF: pas de prix");
    }
  } catch (e) { diag.push("oil/YF: " + e.message); }

  // Écrire les données SEULEMENT si au moins un indice a réussi
  if (ok > 0) {
  
  // ── Indicateurs économiques — API Valet Banque du Canada (gratuite, sans clé) ──
  const BDC = "https://www.bankofcanada.ca/valet/observations";
  async function bdc(series, recent = 1) {
    const r = await fetch(`${BDC}/${series}/json?recent=${recent}`);
    const j = await r.json();
    const obs = j.observations;
    return obs && obs.length ? obs[obs.length - 1] : null;
  }

  try {
    // Taux directeur (overnight rate target, mis à jour 8 fois/an)
    const taux = await bdc("STATIC_ATABLE_V39079");
    if (taux && taux.STATIC_ATABLE_V39079) {
      const val = parseFloat(taux.STATIC_ATABLE_V39079.v);
      data.macro.taux_bdc = val;
      data.macro.taux_bdc_note = `Taux directeur BdC — ${taux.d}`;
      diag.push(`taux_bdc: ${val}%`);
    }
  } catch(e) { diag.push("taux_bdc erreur: " + e.message); }

  try {
    // Rendement obligations 10 ans (V39065 = benchmark 10 ans)
    const bond = await bdc("V39065");
    if (bond && bond.V39065) {
      data.macro.obligations_10ans = parseFloat(bond.V39065.v);
      diag.push(`obligations_10ans: ${data.macro.obligations_10ans}%`);
    }
  } catch(e) { diag.push("obligations erreur: " + e.message); }

  try {
    // Inflation IPC total — V41690973 (mensuel, variation sur 12 mois)
    const r2 = await fetch(`${BDC}/V41690973/json?recent=14`);
    const j2 = await r2.json();
    const obs = j2.observations || [];
    if (obs.length >= 13) {
      const now  = parseFloat(obs[obs.length - 1].V41690973.v);
      const year = parseFloat(obs[obs.length - 13].V41690973.v);
      const infl = Math.round((now / year - 1) * 10000) / 100;
      data.macro.inflation = infl;
      diag.push(`inflation CPI: ${infl}%`);
    }
  } catch(e) { diag.push("inflation erreur: " + e.message); }

  // Fallback si un indicateur n'a pas pu être récupéré
  if (data.macro.taux_bdc === null) data.macro.taux_bdc = 2.25;
  if (data.macro.obligations_10ans === null) data.macro.obligations_10ans = 3.50;
  if (data.macro.inflation === null) data.macro.inflation = 2.4;

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
