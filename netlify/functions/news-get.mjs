/**
 * GET /api/news — Nouvelles financières depuis le cache Netlify Blobs
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
    const data = await store.get("news-data", { type: "json" });
    if (!data) {
      return new Response(JSON.stringify(fallback()), { status: 200, headers });
    }
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify(fallback()), { status: 200, headers });
  }
}

export const config = { path: "/api/news" };

function fallback() {
  return {
    timestamp: new Date().toISOString(),
    fallback: true,
    articles: [
      {
        badge: "attention",
        categorie: "Banques centrales",
        titre: "Banque du Canada — Taux à 2,75 %",
        corps: "La Banque du Canada maintient son taux directeur à 2,75 % lors de sa dernière réunion. Les marchés anticipent une stabilité jusqu'à l'automne 2026, avec une possible baisse si l'inflation continue de ralentir.",
        impact: "TSX"
      },
      {
        badge: "hausse",
        categorie: "États-Unis",
        titre: "Bons résultats des grandes tech américaines",
        corps: "Les entreprises technologiques du S&P 500 publient des bénéfices supérieurs aux attentes pour le T1 2026. Nvidia, Microsoft et Apple tirent l'indice vers le haut grâce à la demande soutenue en intelligence artificielle.",
        impact: "S&P 500"
      },
      {
        badge: "baisse",
        categorie: "Énergie",
        titre: "Pétrole en recul — Inquiétudes sur la demande",
        corps: "Le prix du pétrole brut recule en raison d'inquiétudes sur la demande mondiale et d'une augmentation de la production OPEP+. Cela pèse sur les titres énergétiques au TSX et maintient la pression sur les économies pétrolières.",
        impact: "TSX"
      },
      {
        badge: "neutre",
        categorie: "Canada",
        titre: "Inflation canadienne — 2,3 % en mai 2026",
        corps: "L'inflation au Canada reste proche de la cible de 2 % de la Banque du Canada. L'alimentation et le logement demeurent les principaux facteurs de pression, mais le ralentissement général rassure les marchés obligataires.",
        impact: "Obligataires"
      }
    ]
  };
}
