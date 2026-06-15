/**
 * GET /api/fonds — Rendements des fonds CPE + calcul des portefeuilles
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export default async function handler() {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  };
  try {
    const store = getStore("gff-marches");
    const data = await store.get("fonds-cpe", { type: "json" });
    if (!data) {
      return new Response(JSON.stringify(fallback()), { status: 200, headers });
    }
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify(fallback()), { status: 200, headers });
  }
}

export const config = { path: "/api/fonds" };

/** Données de secours — rendements CPE série D au 30 avril 2026 */
function fallback() {
  return {
    timestamp: new Date().toISOString(),
    fallback: true,
    source: "Assomption Vie — CPE série D 75/75 (30 avril 2026)",
    fonds: {
      "640": { nom: "Obligations de sociétés Assomption/CI", rfg: 1.80, r1m: 0.75, r1a: 5.94, r3a: 6.20, r5a: 2.38, r10a: null },
      "617": { nom: "Actions canadiennes momentum (Louisbourg)", rfg: 2.68, r1m: -1.10, r1a: 55.86, r3a: 24.55, r5a: 16.08, r10a: null },
      "646": { nom: "FNB simplifié équilibré Assomption/Fidelity", rfg: 2.30, r1m: 2.87, r1a: 14.68, r3a: 11.82, r5a: null, r10a: null },
      "647": { nom: "FNB simplifié croissance Assomption/Fidelity", rfg: 2.33, r1m: 3.93, r1a: 20.55, r3a: 16.14, r5a: null, r10a: null },
      "623": { nom: "Actions américaines - Ciblé (Fidelity)", rfg: 3.05, r1m: 15.38, r1a: 44.92, r3a: 25.49, r5a: 13.68, r10a: null },
      "630": { nom: "Ressources mondiales (CI)", rfg: 3.10, r1m: -0.62, r1a: 69.43, r3a: 15.55, r5a: 17.69, r10a: null },
      "634": { nom: "Marchés émergents (CI)", rfg: 3.05, r1m: 13.59, r1a: 47.63, r3a: null, r5a: null, r10a: null },
      "615": { nom: "Actions canadiennes (Louisbourg)", rfg: 2.69, r1m: 0.63, r1a: 23.79, r3a: 12.73, r5a: 11.57, r10a: null },
      "620": { nom: "Actions canadiennes de base (Fidelity)", rfg: 2.53, r1m: 3.91, r1a: 28.40, r3a: 14.89, r5a: 10.94, r10a: null },
      "621": { nom: "Croissance internationale (Fidelity)", rfg: 3.05, r1m: 5.66, r1a: 14.73, r3a: 9.52, r5a: 5.41, r10a: null },
      "622": { nom: "Chef de file mondiaux (CI/Black Creek)", rfg: 2.95, r1m: 4.40, r1a: 14.19, r3a: 7.07, r5a: 5.43, r10a: null },
      "629": { nom: "Dividendes canadien (CI)", rfg: 2.75, r1m: 5.17, r1a: 22.04, r3a: 13.26, r5a: 10.01, r10a: null },
      "603": { nom: "Portefeuille conservateur Assomption Vie", rfg: 1.94, r1m: 0.80, r1a: 8.21, r3a: 6.60, r5a: 3.32, r10a: null },
      "602": { nom: "Portefeuille équilibré Assomption Vie", rfg: 2.50, r1m: 1.37, r1a: 12.87, r3a: 8.31, r5a: 5.25, r10a: null },
      "601": { nom: "Portefeuille équilibré croissance Assomption Vie", rfg: 2.60, r1m: 1.97, r1a: 17.68, r3a: 10.73, r5a: 7.82, r10a: null },
      "600": { nom: "Portefeuille croissance Assomption Vie", rfg: 2.70, r1m: 2.46, r1a: 22.30, r3a: 13.18, r5a: 10.16, r10a: null },
    },
  };
}
