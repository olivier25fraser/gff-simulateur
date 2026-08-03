/**
 * Résumé hebdomadaire des marchés — Groupe Financier Formule
 *
 * Tourne chaque lundi à 7h00 EST (12h00 UTC)
 * 1. Récupère les vraies données de marché déjà calculées (Twelve Data / Banque du Canada)
 *    depuis le cache Netlify Blobs (gff-marches / market-data) — pas de nouveaux appels API.
 * 2. Demande à Claude (avec recherche web, limitée à 3 requêtes, toujours ciblée sur
 *    Desjardins Études économiques) de PARAPHRASER — jamais copier — les indicateurs
 *    économiques de la semaine et les perspectives à court/moyen terme.
 * 3. Assemble un courriel HTML et l'envoie à Olivier et Maxime via Resend.
 *
 * Usage interne seulement — ne touche pas au site public.
 *
 * Variables Netlify requises :
 *   ANTHROPIC_API_KEY
 *   RESEND_API_KEY
 *   EMAIL_EXPEDITEUR
 */
import { getStore } from "@netlify/blobs";
import { alerterEchec } from "./_shared/alerte-erreur.mjs";

export const config = { schedule: "0 12 * * 1" }; // Lundi 7h00 EST

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_EXPEDITEUR || "GFF Résumé marchés <noreply@gfformule.ca>";
const DESTINATAIRES = ["ofraser@gfformule.ca", "mtheberge@gfformule.ca"];

const SOURCE_NOM = "Desjardins, Études économiques";
const SOURCE_URL = "https://www.desjardins.com/fr/epargne-placements/etudes-economiques/actualites-marches-financiers.html";

function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const n = parseFloat(v);
  const signe = n > 0 ? "+" : "";
  return `${signe}${n.toFixed(2).replace('.', ',')} %`;
}
function couleurPct(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return "#666";
  return n > 0 ? "#2E7D32" : n < 0 ? "#C62828" : "#666";
}

async function obtenirSyntheseIA(today) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY manquante");

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

Cherche les plus récentes publications de "${SOURCE_NOM}" (${SOURCE_URL}) : leur commentaire hebdomadaire, leurs indicateurs économiques de la semaine, et leurs prévisions économiques et financières pour les prochaines semaines et prochains mois.

IMPORTANT — Propriété intellectuelle: reformule TOUJOURS entièrement dans tes propres mots. Ne jamais citer ou copier des phrases exactes de la source.

IMPORTANT: Ta réponse doit commencer DIRECTEMENT par { et finir par }. Aucun texte avant/après, aucun backtick. Format JSON strict:
{
  "semaine": "Semaine du X au Y mois AAAA",
  "indicateurs_semaine": [
    "Paraphrase d'un indicateur ou événement économique marquant de la semaine (1 phrase)",
    "Un autre indicateur (1 phrase)",
    "Un autre indicateur (1 phrase)"
  ],
  "perspective_court_terme": "Paraphrase en 2-3 phrases des perspectives de Desjardins pour les prochaines semaines.",
  "perspective_moyen_terme": "Paraphrase en 2-3 phrases des perspectives de Desjardins pour les prochains mois (croissance, taux, inflation)."
}

Toujours en français québécois, ton professionnel et prudent (perspectives, jamais des garanties). Génère 3 à 5 indicateurs.`,
      messages: [{
        role: "user",
        content: `Synthétise les indicateurs économiques de la semaine et les perspectives de ${SOURCE_NOM}.`
      }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err}`);
  }

  const data = await res.json();
  const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  let clean = textBlocks.replace(/```json|```/g, '').trim();
  const debut = clean.indexOf('{');
  const fin = clean.lastIndexOf('}');
  if (debut === -1 || fin === -1 || fin <= debut) throw new Error("Aucun JSON trouvé dans la réponse Claude");
  return JSON.parse(clean.substring(debut, fin + 1));
}

function genererCourriel({ marches, synthese, dateStr }) {
  const idx = marches?.indices || {};
  const ligneIndice = (key, nom) => {
    const d = idx[key];
    if (!d || d.error) return `<tr><td style="padding:8px 0;font-size:13px;color:#999">${nom} — indisponible</td></tr>`;
    return `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #EEE">
        <span style="font-size:13px;font-weight:700;color:#0F0F0F">${nom}</span>
        <span style="float:right;font-size:13px;font-weight:700;color:${couleurPct(d.changePct)}">${fmtPct(d.changePct)}</span>
      </td>
    </tr>`;
  };

  const indicateursHTML = (synthese.indicateurs_semaine || [])
    .map(txt => `<li style="margin-bottom:8px;font-size:13.5px;color:#333;line-height:1.6">${txt}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:Arial,sans-serif">
<table cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F5F0" width="100%" style="background-color:#F5F5F0">
<tr><td align="center" style="padding:24px 16px">
<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #EDEDED">

  <tr><td bgcolor="#0F0F0F" style="background-color:#0F0F0F;padding:24px 28px">
    <div style="font-size:11px;font-weight:800;color:#BF8F00;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px">Usage interne — GFF</div>
    <div style="font-size:20px;font-weight:800;color:#ffffff">Résumé hebdomadaire des marchés</div>
    <div style="font-size:12.5px;color:rgba(255,255,255,.6);margin-top:4px">${synthese.semaine || dateStr}</div>
  </td></tr>

  <tr><td style="padding:26px 28px 6px;background-color:#ffffff">
    <div style="font-size:12px;font-weight:800;color:#BF8F00;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Indicateurs économiques de la semaine</div>
    <ul style="margin:0;padding-left:18px">${indicateursHTML}</ul>
    <div style="font-size:10.5px;color:#aaa;margin-top:6px">Synthèse basée sur les publications de <a href="${SOURCE_URL}" style="color:#BF8F00" target="_blank">${SOURCE_NOM}</a></div>
  </td></tr>

  <tr><td style="padding:22px 28px 6px;background-color:#ffffff">
    <div style="font-size:12px;font-weight:800;color:#BF8F00;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Où en sont les marchés</div>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      ${ligneIndice('sp500', 'S&P 500')}
      ${ligneIndice('nasdaq', 'NASDAQ')}
      ${ligneIndice('dow', 'Dow Jones')}
      ${ligneIndice('tsx', 'S&P/TSX (Canada)')}
    </table>
    <div style="font-size:11px;color:#999;margin-top:8px;line-height:1.6">
      Dollar CA/US : ${marches?.forex?.usdcad?.rate ? '1 $ CA = ' + marches.forex.usdcad.rate + ' $ US' : '—'} ·
      Or : ${marches?.commodities?.gold?.price ? marches.commodities.gold.price + ' $ US/once' : '—'} ·
      Pétrole WTI : ${marches?.commodities?.oil?.price ? marches.commodities.oil.price + ' $ US/baril' : '—'}<br>
      Taux directeur BdC : ${marches?.macro?.taux_bdc ?? '—'} % · Obligations 10 ans : ${marches?.macro?.obligations_10ans ?? '—'} % · Inflation : ${marches?.macro?.inflation ?? '—'} %
    </div>
  </td></tr>

  <tr><td style="padding:22px 28px 6px;background-color:#ffffff">
    <div style="font-size:12px;font-weight:800;color:#BF8F00;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Perspectives — prochaines semaines</div>
    <p style="font-size:13.5px;color:#333;line-height:1.7;margin:0">${synthese.perspective_court_terme || ''}</p>
  </td></tr>

  <tr><td style="padding:14px 28px 26px;background-color:#ffffff">
    <div style="font-size:12px;font-weight:800;color:#BF8F00;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Perspectives — prochains mois</div>
    <p style="font-size:13.5px;color:#333;line-height:1.7;margin:0">${synthese.perspective_moyen_terme || ''}</p>
  </td></tr>

  <tr><td bgcolor="#FFF8E1" style="background-color:#FFF8E1;padding:14px 28px;font-size:11px;color:#8B6700;line-height:1.6">
    Ce résumé est généré automatiquement à des fins internes seulement (usage conseiller). Ce n'est pas un conseil de placement et ne doit pas être transmis tel quel à des clients sans validation.
  </td></tr>

  <tr><td bgcolor="#0F0F0F" style="background-color:#0F0F0F;padding:14px 28px;font-size:10.5px;color:rgba(255,255,255,.4)">
    Généré automatiquement chaque lundi à 7h00 EST — Groupe Financier Formule
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export default async function handler() {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante");
    return new Response("Config manquante", { status: 500 });
  }

  try {
    const today = new Date().toLocaleDateString('fr-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const store = getStore("gff-marches");
    const marches = await store.get("market-data", { type: "json" });

    const synthese = await obtenirSyntheseIA(today);

    const html = genererCourriel({ marches, synthese, dateStr: today });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: DESTINATAIRES,
        subject: `📊 Résumé hebdo des marchés — ${synthese.semaine || today}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend ${res.status}: ${err}`);
    }

    console.log(`✓ Résumé hebdomadaire envoyé à ${DESTINATAIRES.join(', ')}`);
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (e) {
    console.error("Erreur resume-hebdo-marches:", e.message);
    await alerterEchec("resume-hebdo-marches (résumé hebdomadaire des marchés)", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
