/**
 * GET /api/prevision — Perspective boursière hebdomadaire depuis le cache Netlify Blobs
 * Source fixe : Desjardins, Études économiques
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export default async function handler() {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600"
  };

  try {
    const store = getStore("gff-marches");
    const data = await store.get("prevision-data", { type: "json" });
    if (!data) {
      return new Response(JSON.stringify(fallback()), { status: 200, headers });
    }
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify(fallback()), { status: 200, headers });
  }
}

export const config = { path: "/api/prevision" };

function fallback() {
  return {
    timestamp: new Date().toISOString(),
    fallback: true,
    source: "Desjardins, Études économiques",
    source_url: "https://www.desjardins.com/fr/epargne-placements/etudes-economiques/actualites-marches-financiers.html",
    periode: "Cette semaine",
    titre: "Perspectives économiques en cours de mise à jour",
    resume: "Les perspectives boursières hebdomadaires seront affichées ici dès la première mise à jour automatique. Ces perspectives sont une synthèse des publications économiques de Desjardins, à titre informatif seulement.",
    tendances: [
      { marche: "Actions (S&P 500 / TSX)", direction: "stable", commentaire: "Mise à jour en cours de configuration." },
      { marche: "Obligations / taux d'intérêt", direction: "stable", commentaire: "Mise à jour en cours de configuration." },
      { marche: "Dollar canadien", direction: "stable", commentaire: "Mise à jour en cours de configuration." },
      { marche: "Matières premières", direction: "stable", commentaire: "Mise à jour en cours de configuration." }
    ]
  };
}
