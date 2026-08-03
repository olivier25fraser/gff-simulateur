/**
 * Mise à jour de la prévision boursière hebdomadaire — chaque lundi à 8h EST (13h UTC)
 * Synthétise (en paraphrase, jamais de copie verbatim) les perspectives publiées par
 * Desjardins, Études économiques — toujours la même source, indiquée sur le site.
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";
import { alerterEchec } from "./_shared/alerte-erreur.mjs";

export const config = { schedule: "0 13 * * 1" };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SOURCE_NOM = "Desjardins, Études économiques";
const SOURCE_URL = "https://www.desjardins.com/fr/epargne-placements/etudes-economiques/actualites-marches-financiers.html";

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
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        system: `Tu es un analyste financier québécois expert. Aujourd'hui c'est ${today}.

Cherche les plus récentes publications de "${SOURCE_NOM}" (${SOURCE_URL}) — leurs prévisions économiques et financières, leur commentaire hebdomadaire, et leurs perspectives sur les marchés boursiers, obligataires, les devises et les matières premières pour les prochaines semaines et prochains mois.

IMPORTANT — Propriété intellectuelle: Tu dois TOUJOURS reformuler entièrement dans tes propres mots. Ne jamais citer ou copier des phrases exactes de la source. Ceci est une synthèse/paraphrase, pas une reproduction.

IMPORTANT: Ta réponse doit commencer DIRECTEMENT par le caractère { et finir par }. Aucune phrase d'introduction, aucun texte avant ou après, aucun backtick. UNIQUEMENT l'objet JSON brut. Format:
{
  "periode": "Semaine du X au Y mois AAAA (ou les prochains mois si plus pertinent)",
  "titre": "Titre accrocheur de max 12 mots résumant la perspective générale",
  "resume": "Paraphrase en 3-4 phrases des grandes lignes des perspectives économiques et boursières pour les prochaines semaines/mois selon Desjardins, dans tes propres mots.",
  "tendances": [
    { "marche": "Actions (S&P 500 / TSX)", "direction": "hausse" | "baisse" | "stable" | "volatil", "commentaire": "Courte explication en 1 phrase, paraphrasée." },
    { "marche": "Obligations / taux d'intérêt", "direction": "hausse" | "baisse" | "stable" | "volatil", "commentaire": "Courte explication en 1 phrase, paraphrasée." },
    { "marche": "Dollar canadien", "direction": "hausse" | "baisse" | "stable" | "volatil", "commentaire": "Courte explication en 1 phrase, paraphrasée." },
    { "marche": "Matières premières", "direction": "hausse" | "baisse" | "stable" | "volatil", "commentaire": "Courte explication en 1 phrase, paraphrasée." }
  ]
}

Toujours en français québécois. Reste factuel et prudent (ce sont des perspectives, jamais des garanties).`,
        messages: [{
          role: "user",
          content: `Synthétise les perspectives boursières et économiques de ${SOURCE_NOM} pour les prochaines semaines/mois (recherche sur ${SOURCE_URL} et leurs publications récentes).`
        }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic ${res.status}: ${err}`);
    }

    const data = await res.json();

    const textBlocks = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    let clean = textBlocks.replace(/```json|```/g, '').trim();
    const debut = clean.indexOf('{');
    const fin = clean.lastIndexOf('}');
    if (debut === -1 || fin === -1 || fin <= debut) {
      throw new Error("Aucun objet JSON trouvé dans la réponse");
    }
    clean = clean.substring(debut, fin + 1);
    const prevision = JSON.parse(clean);

    if (!prevision || !prevision.resume) {
      throw new Error("Réponse JSON invalide");
    }

    const store = getStore("gff-marches");
    const payload = {
      timestamp: new Date().toISOString(),
      date: today,
      source: SOURCE_NOM,
      source_url: SOURCE_URL,
      ...prevision
    };
    await store.setJSON("prevision-data", payload);

    console.log(`Prévision boursière mise à jour — ${today}`);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (e) {
    console.error("Erreur prevision-update:", e.message);
    await alerterEchec("prevision-update (perspectives boursières)", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
