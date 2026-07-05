/**
 * Mise à jour mensuelle des rendements de fonds CPE — Assomption Vie (série D 75/75)
 * Utilise l'API Anthropic pour extraire les données du PDF.
 * S'exécute le 5 de chaque mois à 8h EST.
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export const config = { schedule: "0 13 5 * *" };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
// URL directe du PDF CPE série D (le GUID reste stable, Assomption remplace le contenu chaque mois)
const PDF_CPE_DIRECT = "https://www.assumption.ca/CMSPages/GetFile.aspx?guid=d256ccf4-e8df-4cfd-9536-402b046bb04d";
// Page de secours si l'URL directe cesse de fonctionner (nécessite parfois auth)
const PAGE_CPE = "https://www.assumption.ca/fr/coin-du-conseiller/placements-et-retraite/ressources-et-details-sur-les-fonds/rendements-mensuels";

// Codes des fonds CPE série D 75/75 utilisés dans les portefeuilles GFF
const CODES_SUIVIS = ["640","617","646","647","623","630","634","615","620","621","622","629","603","602","601","600","618","641","613","614"];

/** Trouve l'URL du PDF CPE sur la page Assomption (le GUID change chaque mois) */
async function trouverLiensPdf() {
  const res = await fetch(PAGE_CPE);
  if (!res.ok) throw new Error("Page CPE inaccessible: " + res.status);
  const html = await res.text();
  const liens = [...html.matchAll(/GetFile\.aspx\?guid=([a-f0-9-]+)/gi)]
    .map(m => "https://www.assumption.ca/CMSPages/GetFile.aspx?guid=" + m[1]);
  return [...new Set(liens)];
}

/** Demande à Claude d'extraire les rendements depuis le PDF */
async function extraireAvecClaude(pdfBase64) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 }
          },
          {
            type: "text",
            text: `Ce PDF contient les rendements des Comptes de placement enregistrés (CPE) série D 75/75 d'Assomption Vie.

Extrais les rendements pour CHACUN de ces codes de fonds : ${CODES_SUIVIS.join(", ")}.

Pour chaque code, trouve la ligne correspondante (le code apparaît dans la colonne "Code" de la série D 75/75) et extrais les rendements : 1 mois, 1 an, 3 ans, 5 ans, 10 ans.

ATTENTION IMPORTANTE aux colonnes : l'ordre des colonnes de rendement est "1 mois | ACJ | 1 an | 3 ans | 5 ans | 10 ans | Depuis création". Certains fonds récents (créés en 2024) n'ont PAS de données pour 3 ans, 5 ans ou 10 ans — ces colonnes contiennent un tiret "-". Ne confonds JAMAIS la valeur "Depuis création" (dernière colonne) avec un rendement 3, 5 ou 10 ans. Si une colonne contient "-" ou "n/a" ou "Consulter le guide", la valeur est null.

Réponds UNIQUEMENT avec un objet JSON valide (pas de backticks, pas de texte autour). Format :
{
  "640": {"nom":"Obligations de sociétés Assomption/CI","r1m":0.75,"r1a":5.94,"r3a":6.20,"r5a":2.38,"r10a":null},
  ...
}

Ignore la colonne ACJ. Convertis les virgules décimales en points. Ne mets que les codes réellement présents dans le PDF avec leurs vraies valeurs.`
          }
        ]
      }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err.slice(0,200)}`);
  }
  const data = await res.json();
  const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const clean = txt.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

export default async function handler() {
  if (!ANTHROPIC_KEY) {
    return new Response("ANTHROPIC_API_KEY manquante", { status: 500 });
  }

  const store = getStore("gff-marches");

  try {
    // Essayer d'abord l'URL directe (GUID stable), puis chercher sur la page si échec.
    // Plafonné à 3 tentatives max : chaque tentative envoie un PDF complet à Claude,
    // ce qui coûte des tokens — pas question d'essayer tous les PDF trouvés sur la page.
    let liens = [PDF_CPE_DIRECT];
    try {
      const liensPage = await trouverLiensPdf();
      liens = [PDF_CPE_DIRECT, ...liensPage.filter(l => l !== PDF_CPE_DIRECT)].slice(0, 3);
    } catch (e) {
      // Page inaccessible (auth requise) — on garde l'URL directe
      console.log("Page CPE inaccessible, utilisation de l'URL directe");
    }

    let fonds = null;
    let pdfUtilise = null;

    for (const url of liens) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const header = new Uint8Array(buf.slice(0, 5));
        if (header[0] !== 0x25 || header[1] !== 0x50) continue; // pas un PDF

        const base64 = Buffer.from(buf).toString("base64");
        const extrait = await extraireAvecClaude(base64);

        // Valider qu'on a au moins quelques fonds attendus
        if (extrait && (extrait["640"] || extrait["617"] || extrait["623"])) {
          fonds = extrait;
          pdfUtilise = url;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!fonds) throw new Error("Aucun rendement extrait des PDF disponibles");

    const payload = {
      timestamp: new Date().toISOString(),
      source: "Assomption Vie — CPE série D 75/75",
      pdf: pdfUtilise,
      fonds: fonds,
    };

    await store.setJSON("fonds-cpe", payload);
    console.log(`Fonds CPE mis à jour: ${Object.keys(fonds).length} fonds`);
    return new Response(JSON.stringify({ success: true, count: Object.keys(fonds).length }), { status: 200 });

  } catch (e) {
    console.error("Erreur fonds-update:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
