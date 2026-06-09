/**
 * GET /api/marches — Servir les données de marché depuis le cache
 * Groupe Financier Formule
 *
 * Appelé par la page gfformule.ca/marches
 * Lit depuis Netlify Blobs (mis à jour chaque matin par marches-update)
 * Aucune limite d'appels — les clients lisent le cache, pas l'API
 */

import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  try {
    const store = getStore("gff-marches");
    const data = await store.get("market-data", { type: "json" });

    if (!data) {
      // Données de fallback si le cache est vide (premier déploiement)
      return new Response(JSON.stringify(fallbackData()), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch(e) {
    return new Response(JSON.stringify(fallbackData()), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export const config = { path: "/api/marches" };

function fallbackData() {
  return {
    timestamp: new Date().toISOString(),
    fallback: true,
    indices: {
      sp500:  { nom: "S&P 500",      pays: "États-Unis", desc: "500 grandes entreprises américaines", price: "5842.00", changePct: "1.24", weekChangePct: "1.24" },
      tsx:    { nom: "TSX Composite", pays: "Canada",     desc: "300 grandes entreprises canadiennes", price: "25134.00", changePct: "0.87", weekChangePct: "0.87" },
      nasdaq: { nom: "NASDAQ",        pays: "États-Unis", desc: "Entreprises technologiques",          price: "18673.00", changePct: "2.31", weekChangePct: "2.31" },
      dow:    { nom: "DOW JONES",     pays: "États-Unis", desc: "30 entreprises emblématiques",        price: "42156.00", changePct: "-0.43", weekChangePct: "-0.43" },
    },
    forex: { usdcad: { rate: "0.7284" } },
    commodities: {
      gold: { price: "3124.00" },
      oil:  { price: "72.40", changePct: "-2.1" }
    },
    macro: {
      taux_bdc: 2.75,
      taux_bdc_date: "2026-04-16",
      taux_bdc_note: "Baissé en avril 2026",
      inflation: 2.3,
      inflation_date: "2026-04",
      obligations_10ans: 3.42,
    }
  };
}
