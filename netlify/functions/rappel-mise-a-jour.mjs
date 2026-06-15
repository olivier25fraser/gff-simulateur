/**
 * Fonction Netlify — Rappel mise à jour annuelle
 * Groupe Financier Formule
 *
 * 3 déclencheurs automatiques :
 *  • 15 novembre  → Rappel plafonds ARC (REER/CELI) pour l'année suivante
 *  • 15 février   → Rappel taux marginaux CQFF (publiés en février)
 *  • 1er de chaque mois → Vérifier si les portefeuilles ont plus de 45 jours
 *
 * Prérequis :
 *  • Variable d'environnement RESEND_API_KEY dans Netlify (Site config > Env vars)
 *  • Variable d'environnement EMAIL_DESTINATAIRE (ex: olivier@groupefinancierformule.com)
 */

export const config = {
  // Tourne le 1er de chaque mois à 9h00 (heure UTC = 5h00 EST / 6h00 EDT)
  schedule: "0 14 1 * *",
};

// Date de la dernière mise à jour des portefeuilles (à mettre à jour manuellement)
const PORTEFEUILLES_MAJ = "2026-04-30";

export default async function handler(req) {
  const now = new Date();
  const mois = now.getUTCMonth() + 1; // 1-12
  const jour = now.getUTCDate();
  const annee = now.getUTCFullYear();

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const EMAIL_DEST = process.env.EMAIL_DESTINATAIRE || "info@groupefinancierformule.com";
  const EMAIL_FROM = process.env.EMAIL_EXPEDITEUR || "GFF Simulateur <noreply@groupefinancierformule.com>";

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante — configurer dans Netlify > Site config > Environment variables");
    return new Response("RESEND_API_KEY manquante", { status: 500 });
  }

  // ── Déterminer quel(s) rappel(s) envoyer ──
  const rappels = [];

  // Novembre → plafonds ARC
  if (mois === 11) {
    rappels.push({
      sujet: `⚠️ Rappel : Mettre à jour les plafonds ARC ${annee + 1} dans le simulateur GFF`,
      html: genererEmailARC(annee + 1),
    });
  }

  // Février → taux CQFF
  if (mois === 2) {
    rappels.push({
      sujet: `⚠️ Rappel : Mettre à jour les taux marginaux CQFF ${annee} dans le simulateur GFF`,
      html: genererEmailCQFF(annee),
    });
  }

  // Chaque mois → vérifier portefeuilles Assomption
  const dateMaj = new Date(PORTEFEUILLES_MAJ);
  const diffJours = Math.floor((now - dateMaj) / (1000 * 60 * 60 * 24));
  if (diffJours > 45) {
    rappels.push({
      sujet: `📊 Rappel : Nouveaux rendements Assomption disponibles (${diffJours} jours depuis la mise à jour)`,
      html: genererEmailPortefeuilles(diffJours, PORTEFEUILLES_MAJ),
    });
  }

  // Chaque mois (le 5) → rappel rendements iA (à mettre à jour manuellement via Claude)
  if (jour >= 1 && jour <= 7) {
    rappels.push({
      sujet: `📈 Rappel mensuel : Mettre à jour les rendements iA dans le simulateur GFF`,
      html: genererEmailIA(),
    });
  }

  // Si aucun rappel à envoyer ce mois-ci
  if (rappels.length === 0) {
    console.log(`${now.toISOString()} — Aucun rappel à envoyer ce mois-ci.`);
    return new Response("Aucun rappel nécessaire", { status: 200 });
  }

  // ── Envoyer les courriels via Resend ──
  let envoyés = 0;
  for (const rappel of rappels) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [EMAIL_DEST],
          subject: rappel.sujet,
          html: rappel.html,
        }),
      });

      if (res.ok) {
        envoyés++;
        console.log(`✓ Courriel envoyé : ${rappel.sujet}`);
      } else {
        const err = await res.text();
        console.error(`✗ Erreur envoi : ${err}`);
      }
    } catch (e) {
      console.error(`✗ Exception : ${e.message}`);
    }
  }

  return new Response(`${envoyés}/${rappels.length} courriel(s) envoyé(s)`, { status: 200 });
}


// ══════════════════════════════════════════════════
// TEMPLATES HTML DES COURRIELS
// ══════════════════════════════════════════════════

function baseEmail(titre, contenu) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">

  <!-- En-tête -->
  <tr><td style="background:#0F0F0F;padding:24px 32px">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700">Groupe Financier Formule</p>
    <p style="margin:4px 0 0;color:rgba(255,255,255,.5);font-size:12px;letter-spacing:1px;text-transform:uppercase">Cabinet de services financiers</p>
  </td></tr>

  <!-- Bande dorée -->
  <tr><td style="background:#BF8F00;padding:4px 0"></td></tr>

  <!-- Contenu -->
  <tr><td style="padding:32px">
    ${contenu}
  </td></tr>

  <!-- Pied de page -->
  <tr><td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee">
    <p style="margin:0;color:#999;font-size:11px;line-height:1.5">
      Ce courriel automatique est envoyé par le Simulateur d'épargne GFF.<br>
      Pour modifier les données, contactez votre développeur ou mettez à jour le fichier directement.
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function genererEmailARC(anneeProchaine) {
  const contenu = `
    <h1 style="margin:0 0 8px;color:#C55A11;font-size:22px">⚠️ Mise à jour annuelle requise</h1>
    <p style="color:#666;margin:0 0 24px;font-size:13px">Plafonds ARC ${anneeProchaine} — à faire avant le 1er janvier</p>

    <div style="background:#FFF3E0;border-left:4px solid #C55A11;padding:16px;border-radius:4px;margin-bottom:24px">
      <p style="margin:0;font-weight:700;color:#C55A11">L'ARC publie généralement les nouveaux plafonds en octobre-novembre.</p>
      <p style="margin:8px 0 0;color:#666;font-size:13px">Il est temps de vérifier et mettre à jour le simulateur pour l'année ${anneeProchaine}.</p>
    </div>

    <h2 style="font-size:15px;color:#0F0F0F;margin:0 0 12px">📋 Éléments à vérifier et mettre à jour</h2>
    <table width="100%" style="border-collapse:collapse;font-size:13px;margin-bottom:24px">
      <thead>
        <tr style="background:#0F0F0F;color:#fff">
          <th style="padding:8px 12px;text-align:left">Paramètre</th>
          <th style="padding:8px 12px;text-align:left">Valeur ${anneeProchaine - 1}</th>
          <th style="padding:8px 12px;text-align:left">Source</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #eee"><td style="padding:8px 12px">Plafond REER</td><td style="padding:8px 12px">33 810 $</td><td style="padding:8px 12px">canada.ca/reer</td></tr>
        <tr style="background:#fafafa;border-bottom:1px solid #eee"><td style="padding:8px 12px">Plafond CELI annuel</td><td style="padding:8px 12px">7 000 $</td><td style="padding:8px 12px">canada.ca/celi</td></tr>
        <tr style="border-bottom:1px solid #eee"><td style="padding:8px 12px">Cumul CELI</td><td style="padding:8px 12px">109 000 $</td><td style="padding:8px 12px">+7 000 $ chaque janvier</td></tr>
        <tr style="background:#fafafa;border-bottom:1px solid #eee"><td style="padding:8px 12px">PSV annuelle</td><td style="padding:8px 12px">8 088 $</td><td style="padding:8px 12px">canada.ca/psv</td></tr>
        <tr style="border-bottom:1px solid #eee"><td style="padding:8px 12px">Seuil récupération PSV</td><td style="padding:8px 12px">93 454 $</td><td style="padding:8px 12px">canada.ca/psv</td></tr>
        <tr style="background:#fafafa;border-bottom:1px solid #eee"><td style="padding:8px 12px">Cotisation RRQ max</td><td style="padding:8px 12px">3 510 $</td><td style="padding:8px 12px">retraitequebec.gouv.qc.ca</td></tr>
        <tr style="border-bottom:1px solid #eee"><td style="padding:8px 12px">Exonération gains PME</td><td style="padding:8px 12px">1 016 602 $</td><td style="padding:8px 12px">canada.ca/gains-capital</td></tr>
      </tbody>
    </table>

    <div style="background:#E8F5E9;border-left:4px solid #375623;padding:16px;border-radius:4px;margin-bottom:24px">
      <p style="margin:0;font-weight:700;color:#375623">💡 Note importante</p>
      <p style="margin:8px 0 0;color:#555;font-size:13px">
        Les taux marginaux CQFF (Québec) sont publiés séparément en <strong>février</strong>. 
        Vous recevrez un rappel à ce moment-là.
      </p>
    </div>

    <h2 style="font-size:15px;color:#0F0F0F;margin:0 0 12px">🔗 Sources officielles</h2>
    <ul style="font-size:13px;color:#555;line-height:1.8;margin:0 0 24px;padding-left:20px">
      <li><a href="https://www.canada.ca/fr/agence-revenu/services/impot/particuliers/sujets/reer-et-fonds-enregistres.html" style="color:#BF8F00">ARC — REER et plafonds</a></li>
      <li><a href="https://www.canada.ca/fr/agence-revenu/services/impot/particuliers/sujets/compte-epargne-libre-impot.html" style="color:#BF8F00">ARC — CELI</a></li>
      <li><a href="https://www.retraitequebec.gouv.qc.ca" style="color:#BF8F00">Retraite Québec — RRQ</a></li>
      <li><a href="https://www.cqff.com" style="color:#BF8F00">CQFF — Taux marginaux (disponibles en février)</a></li>
    </ul>

    <a href="https://claude.ai" style="display:inline-block;background:#0F0F0F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">
      Ouvrir Claude pour mettre à jour →
    </a>`;

  return baseEmail(`Mise à jour ARC ${anneeProchaine} — Simulateur GFF`, contenu);
}

function genererEmailCQFF(annee) {
  const contenu = `
    <h1 style="margin:0 0 8px;color:#C55A11;font-size:22px">⚠️ Taux marginaux CQFF disponibles</h1>
    <p style="color:#666;margin:0 0 24px;font-size:13px">Mise à jour des taux Québec ${annee} — à faire dès que possible</p>

    <div style="background:#FFF3E0;border-left:4px solid #C55A11;padding:16px;border-radius:4px;margin-bottom:24px">
      <p style="margin:0;font-weight:700;color:#C55A11">Le CQFF publie ses tables de taux marginaux chaque février.</p>
      <p style="margin:8px 0 0;color:#666;font-size:13px">
        Vérifiez sur <strong>cqff.com</strong> si les nouvelles tables pour ${annee} sont disponibles 
        et mettez à jour le simulateur si les taux ont changé.
      </p>
    </div>

    <h2 style="font-size:15px;color:#0F0F0F;margin:0 0 12px">📋 Taux actuels dans le simulateur (8 paliers)</h2>
    <table width="100%" style="border-collapse:collapse;font-size:12px;margin-bottom:24px">
      <thead>
        <tr style="background:#0F0F0F;color:#fff">
          <th style="padding:6px 10px;text-align:left">Palier</th>
          <th style="padding:6px 10px;text-align:right">Revenu min</th>
          <th style="padding:6px 10px;text-align:right">Revenu max</th>
          <th style="padding:6px 10px;text-align:right">Taux combiné</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px">1</td><td style="padding:6px 10px;text-align:right">0 $</td><td style="padding:6px 10px;text-align:right">54 345 $</td><td style="padding:6px 10px;text-align:right;font-weight:700">25,69 %</td></tr>
        <tr style="background:#fafafa;border-bottom:1px solid #eee"><td style="padding:6px 10px">2</td><td style="padding:6px 10px;text-align:right">54 345 $</td><td style="padding:6px 10px;text-align:right">57 375 $</td><td style="padding:6px 10px;text-align:right;font-weight:700">30,29 %</td></tr>
        <tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px">3</td><td style="padding:6px 10px;text-align:right">57 375 $</td><td style="padding:6px 10px;text-align:right">102 894 $</td><td style="padding:6px 10px;text-align:right;font-weight:700">37,12 %</td></tr>
        <tr style="background:#fafafa;border-bottom:1px solid #eee"><td style="padding:6px 10px">4</td><td style="padding:6px 10px;text-align:right">102 894 $</td><td style="padding:6px 10px;text-align:right">111 733 $</td><td style="padding:6px 10px;text-align:right;font-weight:700">41,12 %</td></tr>
        <tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px">5</td><td style="padding:6px 10px;text-align:right">111 733 $</td><td style="padding:6px 10px;text-align:right">119 910 $</td><td style="padding:6px 10px;text-align:right;font-weight:700">45,71 %</td></tr>
        <tr style="background:#fafafa;border-bottom:1px solid #eee"><td style="padding:6px 10px">6</td><td style="padding:6px 10px;text-align:right">119 910 $</td><td style="padding:6px 10px;text-align:right">173 205 $</td><td style="padding:6px 10px;text-align:right;font-weight:700">47,46 %</td></tr>
        <tr style="border-bottom:1px solid #eee"><td style="padding:6px 10px">7</td><td style="padding:6px 10px;text-align:right">173 205 $</td><td style="padding:6px 10px;text-align:right">246 752 $</td><td style="padding:6px 10px;text-align:right;font-weight:700">49,21 %</td></tr>
        <tr style="background:#fafafa"><td style="padding:6px 10px">8</td><td style="padding:6px 10px;text-align:right">246 752 $+</td><td style="padding:6px 10px;text-align:right">—</td><td style="padding:6px 10px;text-align:right;font-weight:700">53,31 %</td></tr>
      </tbody>
    </table>

    <div style="background:#E3F2FD;border-left:4px solid #2E75B6;padding:16px;border-radius:4px;margin-bottom:24px">
      <p style="margin:0;font-weight:700;color:#2E75B6">📌 Comment vérifier</p>
      <ol style="margin:8px 0 0;color:#555;font-size:13px;line-height:1.8;padding-left:20px">
        <li>Aller sur <a href="https://www.cqff.com" style="color:#BF8F00">cqff.com</a></li>
        <li>Télécharger les nouvelles tables de taux</li>
        <li>Comparer avec les 8 paliers ci-dessus</li>
        <li>Si différents, ouvrir Claude et envoyer les nouveaux taux</li>
      </ol>
    </div>

    <a href="https://claude.ai" style="display:inline-block;background:#0F0F0F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">
      Ouvrir Claude pour mettre à jour →
    </a>`;

  return baseEmail(`Taux CQFF ${annee} — Simulateur GFF`, contenu);
}

function genererEmailPortefeuilles(diffJours, dateDerniereMaj) {
  const contenu = `
    <h1 style="margin:0 0 8px;color:#BF8F00;font-size:22px">📊 Rendements Assomption à mettre à jour</h1>
    <p style="color:#666;margin:0 0 24px;font-size:13px">Dernière mise à jour : ${dateDerniereMaj} (il y a ${diffJours} jours)</p>

    <div style="background:#FFF8E1;border-left:4px solid #BF8F00;padding:16px;border-radius:4px;margin-bottom:24px">
      <p style="margin:0;font-weight:700;color:#BF8F00">De nouveaux rendements mensuels sont probablement disponibles.</p>
      <p style="margin:8px 0 0;color:#666;font-size:13px">
        Assomption publie ses rendements chaque mois. Il y a ${diffJours} jours depuis la dernière mise à jour du simulateur.
      </p>
    </div>

    <h2 style="font-size:15px;color:#0F0F0F;margin:0 0 12px">📋 Portefeuilles dans le simulateur</h2>
    <table width="100%" style="border-collapse:collapse;font-size:13px;margin-bottom:24px">
      <thead>
        <tr style="background:#0F0F0F;color:#fff">
          <th style="padding:8px 12px;text-align:left">Portefeuille</th>
          <th style="padding:8px 12px;text-align:right">1 an actuel</th>
          <th style="padding:8px 12px;text-align:right">3 ans actuel</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #eee"><td style="padding:8px 12px">Conservateur</td><td style="padding:8px 12px;text-align:right">11,86 %</td><td style="padding:8px 12px;text-align:right">9,13 %</td></tr>
        <tr style="background:#fafafa;border-bottom:1px solid #eee"><td style="padding:8px 12px">Modéré</td><td style="padding:8px 12px;text-align:right">15,61 %</td><td style="padding:8px 12px;text-align:right">12,64 %</td></tr>
        <tr style="border-bottom:1px solid #eee"><td style="padding:8px 12px">Équilibré</td><td style="padding:8px 12px;text-align:right">26,87 %</td><td style="padding:8px 12px;text-align:right">15,52 %</td></tr>
        <tr style="background:#fafafa;border-bottom:1px solid #eee"><td style="padding:8px 12px">Croissance</td><td style="padding:8px 12px;text-align:right">30,21 %</td><td style="padding:8px 12px;text-align:right">19,79 %</td></tr>
        <tr><td style="padding:8px 12px">Audacieux</td><td style="padding:8px 12px;text-align:right">36,69 %</td><td style="padding:8px 12px;text-align:right">21,04 %</td></tr>
      </tbody>
    </table>

    <div style="background:#E8F5E9;border-left:4px solid #375623;padding:16px;border-radius:4px;margin-bottom:24px">
      <p style="margin:0;font-weight:700;color:#375623">📌 Comment mettre à jour</p>
      <ol style="margin:8px 0 0;color:#555;font-size:13px;line-height:1.8;padding-left:20px">
        <li>Télécharger les nouvelles fiches PDF de vos 5 portefeuilles sur assumption.ca</li>
        <li>Ouvrir Claude et partager les PDFs</li>
        <li>Demander à Claude de mettre à jour les données dans le simulateur</li>
        <li>Glisser le nouveau fichier HTML sur Netlify</li>
      </ol>
    </div>

    <a href="https://www.assumption.ca/fr/conseiller/placement/rendements" style="display:inline-block;background:#BF8F00;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;margin-right:12px">
      Voir les rendements Assomption →
    </a>
    <a href="https://claude.ai" style="display:inline-block;background:#0F0F0F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">
      Ouvrir Claude →
    </a>`;

  return baseEmail("Rendements Assomption — Mise à jour requise", contenu);
}


function genererEmailIA() {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
    <div style="background:#0F0F0F;padding:20px;border-radius:8px 8px 0 0">
      <h1 style="color:#BF8F00;margin:0;font-size:20px">Groupe Financier Formule</h1>
    </div>
    <div style="border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 8px 8px">
      <h2 style="font-size:18px;color:#0F0F0F">📈 Mise à jour mensuelle des rendements iA</h2>
      <p style="font-size:14px;line-height:1.6;color:#444">
        C'est le moment de mettre à jour les rendements des portefeuilles <strong>Industrielle Alliance</strong> dans ton simulateur.
      </p>
      <div style="background:#FFF8E1;border-left:4px solid #BF8F00;padding:14px 18px;margin:18px 0;border-radius:4px">
        <p style="font-size:13px;line-height:1.6;color:#444;margin:0">
          <strong>Comment faire :</strong><br>
          1. Va sur <a href="https://ia.ca/rendement-fonds" style="color:#BF8F00">ia.ca/rendement-fonds</a> ou télécharge les aperçus de fonds à jour<br>
          2. Récupère les rendements 1, 3 et 5 ans des 6 fonds<br>
          3. Transmets-les à Claude pour qu'il mette à jour le bloc <code>FONDS_IA</code> du simulateur
        </p>
      </div>
      <p style="font-size:13px;line-height:1.6;color:#666">
        Les 6 fonds à vérifier : Obligations, Diversifié Opportunité, Indiciel Américain DAQ,
        Fidelity Actions Mondiales Concentré, Fidelity Innovations Mondiales, Dividendes croissance.
      </p>
      <p style="font-size:12px;color:#999;margin-top:24px">
        Rappel automatique envoyé par le simulateur GFF. Les rendements iA sont mis à jour manuellement
        car iA ne publie pas de fichier unique automatisable.
      </p>
    </div>
  </div>`;
}
