/**
 * GET /api/marches-debug — Diagnostic de la dernière mise à jour des marchés
 * Permet de voir pourquoi les données ne se mettent pas à jour
 */
import { getStore } from "@netlify/blobs";

export default async function handler() {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  try {
    const store = getStore("gff-marches");
    const debug = await store.get("market-data-debug", { type: "json" });
    const hasData = await store.get("market-data", { type: "json" });
    return new Response(JSON.stringify({
      diagnostic: debug || "Aucun diagnostic — la fonction marches-update n'a jamais tourné. Va dans Netlify → Logs → Functions → marches-update → Run now.",
      donnees_presentes: hasData ? "OUI — vraies données dans le store" : "NON — le store est vide (fallback affiché)",
      cle_configuree: process.env.TWELVE_DATA_KEY ? "OUI" : "NON — ajoute TWELVE_DATA_KEY",
    }, null, 2), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ erreur: e.message }), { status: 200, headers });
  }
}

export const config = { path: "/api/marches-debug" };
