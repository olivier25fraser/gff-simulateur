/**
 * Mise à jour des nouvelles financières — lun-sam à 8h EST (13h UTC)
 * Appelle l'API Anthropic avec web_search pour obtenir les vraies nouvelles du jour
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export const config = { schedule: "0 13 * * 1-6" };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler() {
  if (!ANTHROPIC_KEY) {
    console.error("ANTHROPIC_API_KEY manquante");
    return new Response("Config manquante", { status: 500 });
  }

  try {
    const today = new Date().toLocaleDateString('fr-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `Tu es un analyste financier québécois expert. Aujourd'hui c'est ${today}.

Cherche les nouvelles d'actualité importantes (politique, géopolitique, économie, banques centrales, matières premières, entreprises) qui ont un impact direct sur les marchés boursiers mondiaux aujourd'hui ou cette semaine.

Réponds UNIQUEMENT avec un tableau JSON valide (pas de backticks, pas de texte autour). Format:
[
  {
    "badge": "hausse" | "baisse" | "neutre" | "attention",
    "categorie": "Géopolitique" | "Économie" | "Banques centrales" | "Énergie" | "Technologie" | "Canada" | "États-Unis",
    "titre": "Titre accrocheur de max 10 mots",
    "corps": "Explication claire en 2-3 phrases: quel événement, quel impact sur les marchés, pourquoi c'est important pour les investisseurs.",
    "impact": "S&P 500" | "TSX" | "Pétrole" | "Or" | "Obligataires" | "Toutes places"
  }
]

Génère exactement 4 nouvelles. Priorise les événements géopolitiques, décisions des banques centrales, données économiques importantes, et crises qui font bouger les marchés. Toujours en français québécois.`,
        messages: [{
          role: "user",
          content: `Quelles sont les 4 nouvelles les plus importantes aujourd'hui (${today}) qui impactent les marchés boursiers? Cherche sur internet.`
        }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic ${res.status}: ${err}`);
    }

    const data = await res.json();

    // Extraire le texte de la réponse (après les tool_use)
    const textBlocks = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // Parser le JSON
    const clean = textBlocks.replace(/```json|```/g, '').trim();
    const news = JSON.parse(clean);

    if (!Array.isArray(news) || !news.length) {
      throw new Error("Réponse JSON invalide");
    }

    // Stocker dans Netlify Blobs
    const store = getStore("gff-marches");
    const payload = {
      timestamp: new Date().toISOString(),
      date: today,
      articles: news
    };
    await store.setJSON("news-data", payload);

    console.log(`Nouvelles mises à jour: ${news.length} articles — ${today}`);
    return new Response(JSON.stringify({ success: true, count: news.length }), { status: 200 });

  } catch (e) {
    console.error("Erreur news-update:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
