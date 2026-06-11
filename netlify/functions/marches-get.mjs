/**
 * GET /api/marches — Données de marché depuis le cache Netlify Blobs
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
  try {
    const store = getStore("gff-marches");
    const data = await store.get("market-data", { type: "json" });
    if (!data) {
      return new Response(JSON.stringify(fallback()), { status: 200, headers });
    }
    // Compléter les champs manquants avec fallback si la mise à jour
    // n'a pas encore calculé les rendements historiques
    const merged = mergeFallback(data);
    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { ...headers, "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    return new Response(JSON.stringify(fallback()), { status: 200, headers });
  }
}

export const config = { path: "/api/marches" };

/** Complète les données stockées avec les rendements fallback si absents */
function mergeFallback(data) {
  const fb = fallback();
  const merged = { ...fb, ...data };
  merged.indices = { ...fb.indices };
  if (data.indices) {
    Object.keys(data.indices).forEach((key) => {
      merged.indices[key] = { ...(fb.indices[key] || {}), ...data.indices[key] };
    });
  }
  return merged;
}

/** Données par défaut avec rendements historiques réalistes (juin 2026) */
function fallback() {
  return {
    timestamp: new Date().toISOString(),
    fallback: true,
    indices: {
      sp500: {
        nom: "S&P 500", pays: "États-Unis",
        price: "5842.00", changePct: "1.24",
        r1m:  3.2,
        r3m:  5.8,
        r6m: 11.4,
        r1a: 14.2,
        r3a:  9.8,
        r5a: 13.1,
        r10a: 12.7,
      },
      tsx: {
        nom: "TSX Composite", pays: "Canada",
        price: "25134.00", changePct: "0.87",
        r1m:  1.9,
        r3m:  3.4,
        r6m:  7.2,
        r1a: 10.8,
        r3a:  8.1,
        r5a:  9.6,
        r10a:  8.3,
      },
      nasdaq: {
        nom: "NASDAQ", pays: "États-Unis",
        price: "18673.00", changePct: "2.31",
        r1m:  4.8,
        r3m:  9.2,
        r6m: 14.6,
        r1a: 19.3,
        r3a: 12.4,
        r5a: 17.2,
        r10a: 16.8,
      },
      dow: {
        nom: "DOW JONES", pays: "États-Unis",
        price: "42156.00", changePct: "-0.43",
        r1m: -0.8,
        r3m:  2.1,
        r6m:  5.9,
        r1a:  8.4,
        r3a:  7.2,
        r5a:  9.1,
        r10a:  9.8,
      },
    },
    forex: { usdcad: { rate: "1.3720" } },
    commodities: {
      gold: { price: "3124.00" },
      oil:  { price: "72.40", changePct: "-2.1" },
    },
    macro: {
      taux_bdc: 2.75,
      taux_bdc_note: "Baissé en avril 2026",
      inflation: 2.3,
      obligations_10ans: 3.42,
    },
  };
}
