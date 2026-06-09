/**
 * Rappels de prospection clients — Groupe Financier Formule
 * 
 * Tourne chaque matin à 8h00 EST (13h00 UTC)
 * Lit toutes les fiches clients, analyse les déclencheurs
 * Envoie un courriel à Olivier et Maxime avec les clients à contacter
 * 
 * Variables Netlify requises :
 *   RESEND_API_KEY        — clé API Resend
 *   EMAIL_EXPEDITEUR      — ex: "GFF <noreply@gfformule.ca>"
 */

import { getStore } from "@netlify/blobs";

export const config = {
  schedule: "0 13 * * 1-5", // Lun-ven à 8h00 EST (13h00 UTC)
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM     = process.env.EMAIL_EXPEDITEUR || "GFF Rappels <noreply@gfformule.ca>";
const DESTINATAIRES  = ["ofraser@gfformule.ca", "mtheberge@gfformule.ca"];

// ── Utilitaires dates ──────────────────────────────────────
function aujourd_hui() {
  return new Date();
}

function diffJours(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = aujourd_hui();
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
}

function diffMois(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = aujourd_hui();
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
}

function diffJoursDepuis(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = aujourd_hui();
  return Math.round((now - d) / (1000 * 60 * 60 * 24));
}

function age(ddnStr) {
  if (!ddnStr) return null;
  const ddn = new Date(ddnStr);
  if (isNaN(ddn)) return null;
  const now = aujourd_hui();
  let a = now.getFullYear() - ddn.getFullYear();
  const m = now.getMonth() - ddn.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < ddn.getDate())) a--;
  return a;
}

function prochainAnniversaire(ddnStr) {
  if (!ddnStr) return null;
  const ddn = new Date(ddnStr);
  if (isNaN(ddn)) return null;
  const now = aujourd_hui();
  const anniv = new Date(now.getFullYear(), ddn.getMonth(), ddn.getDate());
  if (anniv < now) anniv.setFullYear(now.getFullYear() + 1);
  return Math.round((anniv - now) / (1000 * 60 * 60 * 24));
}

function moisRREEP(ddnStr) {
  // Retourne le mois de l'année de cotisation REER pertinent
  if (!ddnStr) return null;
  const ddn = new Date(ddnStr);
  const now = aujourd_hui();
  // Fin de la période REER = 1er mars
  const finRREER = new Date(now.getFullYear(), 2, 1);
  if (now > finRREER) {
    // On est après mars, prochain REER = l'an prochain
    return Math.round((new Date(now.getFullYear() + 1, 2, 1) - now) / (1000 * 60 * 60 * 24));
  }
  return Math.round((finRREER - now) / (1000 * 60 * 60 * 24));
}

// ── Analyse d'un client ────────────────────────────────────
function analyserClient(client) {
  const rappels = [];
  const fiche = client.fiche || {};
  const infos = fiche.infos || {};
  const assurances = fiche.assurances || [];
  const placements = fiche.placements || [];
  const nom = client.name || `${infos['fi-prenom'] || ''} ${infos['fi-nom'] || ''}`.trim() || client.id;

  // ─ 1. Anniversaire client ────────────────────
  const ddn = infos['fi-ddn'];
  if (ddn) {
    const joursAnniv = prochainAnniversaire(ddn);
    const ageActuel = age(ddn);
    if (joursAnniv !== null && joursAnniv <= 7) {
      rappels.push({
        priorite: 1,
        emoji: "🎂",
        raison: `Anniversaire dans ${joursAnniv === 0 ? "aujourd'hui" : joursAnniv + " jour(s)"}`,
        suggestion: `Féliciter ${nom} pour ses ${ageActuel + (joursAnniv <= 0 ? 0 : 1)} ans. Bon moment pour revoir les besoins de protection.`,
        tag: "anniversaire"
      });
    }
    // Jalons importants (40, 45, 50, 55, 60, 65 ans)
    const jalons = [40, 45, 50, 55, 60, 65];
    if (joursAnniv !== null && joursAnniv <= 30 && ageActuel !== null) {
      const prochainAge = ageActuel + 1;
      if (jalons.includes(prochainAge)) {
        rappels.push({
          priorite: 2,
          emoji: "🎯",
          raison: `Jalon important : ${prochainAge} ans dans ${joursAnniv} jour(s)`,
          suggestion: `Les ${prochainAge} ans sont un excellent moment pour réviser la planification retraite, l'assurance vie et les stratégies fiscales.`,
          tag: "jalon"
        });
      }
    }
  }

  // ─ 2. Anniversaire conjoint ──────────────────
  const ddnConj = infos['fi-conj-ddn'];
  if (ddnConj) {
    const joursConj = prochainAnniversaire(ddnConj);
    if (joursConj !== null && joursConj <= 7) {
      const prenomConj = infos['fi-conj-prenom'] || 'Conjoint(e)';
      rappels.push({
        priorite: 2,
        emoji: "🎂",
        raison: `Anniversaire du conjoint (${prenomConj}) dans ${joursConj === 0 ? "aujourd'hui" : joursConj + " jour(s)"}`,
        suggestion: `Occasion de contacter ${nom} — mentionner l'anniversaire et vérifier si les protections du couple sont à jour.`,
        tag: "anniversaire-conjoint"
      });
    }
  }

  // ─ 3. Polices d'assurance ────────────────────
  assurances.forEach(police => {
    if (police.statut === 'Actif' || police.statut === 'En vigueur') {
      // Police ajoutée il y a environ 1 an → rappel anniversaire
      const dateDebut = police.dateDebut;
      if (dateDebut) {
        const joursDepuis = diffJoursDepuis(dateDebut);
        if (joursDepuis !== null) {
          const ans = Math.floor(joursDepuis / 365);
          const joursVersAnniv = 365 - (joursDepuis % 365);
          if (joursVersAnniv <= 14 && ans >= 1) {
            rappels.push({
              priorite: 2,
              emoji: "📋",
              raison: `Anniversaire ${ans + 1} an(s) de la police ${police.type} (${police.compagnie})`,
              suggestion: `Vérifier que la couverture est toujours adéquate. Demander s'il y a eu des changements de situation (mariage, enfant, emploi).`,
              tag: "anniversaire-police"
            });
          }
        }
      }
    }

    // Police expirée bientôt
    if (police.duree && police.dateDebut) {
      const debut = new Date(police.dateDebut);
      if (!isNaN(debut)) {
        const dureeAns = parseInt(police.duree);
        if (!isNaN(dureeAns)) {
          const echeance = new Date(debut);
          echeance.setFullYear(echeance.getFullYear() + dureeAns);
          const joursEcheance = diffJours(echeance.toISOString().split('T')[0]);
          if (joursEcheance !== null && joursEcheance > 0 && joursEcheance <= 90) {
            rappels.push({
              priorite: 1,
              emoji: "⚠️",
              raison: `Police ${police.type} (${police.compagnie}) expire dans ${joursEcheance} jour(s)`,
              suggestion: `Discuter du renouvellement ou d'une couverture permanente. Évaluer si les besoins ont changé. Prime actuelle : ${police.prime ? police.prime + ' $/mois' : 'non renseignée'}.`,
              tag: "police-expiration"
            });
          }
        }
      }
    }
  });

  // ─ 4. Période REER (janvier-mars) ───────────────
  const now = aujourd_hui();
  const moisActuel = now.getMonth(); // 0=jan, 1=fev, 2=mars
  if (moisActuel <= 2) { // Jan, Fév, Mars
    const joursFinRREER = moisRREEP(ddn);
    if (joursFinRREER !== null && joursFinRREER <= 45) {
      const reers = placements.filter(p => p.type === 'REER' && p.statut === 'Actif');
      if (reers.length > 0) {
        rappels.push({
          priorite: 1,
          emoji: "💰",
          raison: `Période de cotisation REER — ${joursFinRREER} jour(s) avant la date limite`,
          suggestion: `Vérifier si ${nom} a maximisé ses droits de cotisation REER. ${reers.length} compte(s) REER actif(s). Cotisation actuelle : ${reers.reduce((s,r) => s+(r.cotis||0), 0)} $/mois.`,
          tag: "reer-periode"
        });
      }
    }
  }

  // ─ 5. Plafond CELI non utilisé ──────────────────
  if (moisActuel === 0) { // Janvier — nouveau plafond disponible
    const celis = placements.filter(p => p.type === 'CELI' && p.statut === 'Actif');
    if (celis.length > 0) {
      rappels.push({
        priorite: 2,
        emoji: "📈",
        raison: "Nouveau plafond CELI disponible (7 000 $ en 2026)",
        suggestion: `Contacter ${nom} pour planifier la cotisation CELI de l'année. ${celis.length} compte(s) CELI actif(s).`,
        tag: "celi-janvier"
      });
    }
  }

  // ─ 6. Inactivité ────────────────────────────────
  const derniereRencontre = infos['fi-date-rencontre'];
  if (derniereRencontre) {
    const joursInactif = diffJoursDepuis(derniereRencontre);
    if (joursInactif !== null) {
      if (joursInactif >= 365) {
        rappels.push({
          priorite: 1,
          emoji: "🔔",
          raison: `Aucun contact depuis ${Math.floor(joursInactif / 30)} mois`,
          suggestion: `Révision annuelle recommandée. Vérifier si la situation a changé (emploi, famille, projets). Rappeler les services disponibles.`,
          tag: "inactivite"
        });
      } else if (joursInactif >= 180) {
        rappels.push({
          priorite: 2,
          emoji: "📞",
          raison: `Dernier contact il y a ${Math.floor(joursInactif / 30)} mois`,
          suggestion: `Prise de nouvelles recommandée. Vérifier si tout va bien et si les protections sont toujours adéquates.`,
          tag: "contact-6mois"
        });
      }
    }
  } else if (client.createdAt) {
    // Client créé mais jamais contacté
    const joursDepuisCreation = diffJoursDepuis(client.createdAt);
    if (joursDepuisCreation !== null && joursDepuisCreation >= 30) {
      rappels.push({
        priorite: 2,
        emoji: "👤",
        raison: "Client sans historique de contact enregistré",
        suggestion: `Planifier une première rencontre ou appel de suivi pour compléter la fiche et identifier les besoins.`,
        tag: "nouveau-sans-contact"
      });
    }
  }

  // ─ 7. Révision annuelle prévue ──────────────────
  const revision = infos['fi-revision'];
  if (revision) {
    const joursRevision = diffJours(revision);
    if (joursRevision !== null && joursRevision >= 0 && joursRevision <= 14) {
      rappels.push({
        priorite: 1,
        emoji: "📅",
        raison: `Révision annuelle prévue dans ${joursRevision} jour(s)`,
        suggestion: `Préparer le dossier de ${nom} : revoir les polices, les placements, les objectifs. Contacter pour confirmer le rendez-vous.`,
        tag: "revision-annuelle"
      });
    }
  }

  // ─ 8. Prochaine rencontre prévue ────────────────
  const prochaine = infos['fi-prochaine'];
  if (prochaine) {
    const joursProchaine = diffJours(prochaine);
    if (joursProchaine !== null && joursProchaine >= 0 && joursProchaine <= 3) {
      rappels.push({
        priorite: 1,
        emoji: "🗓️",
        raison: `Rencontre prévue dans ${joursProchaine === 0 ? "aujourd'hui" : joursProchaine + " jour(s)"}`,
        suggestion: `Préparer le dossier et les documents. Revoir les notes de la dernière rencontre.`,
        tag: "rencontre-imminente"
      });
    }
  }

  // ─ 9. Taux directeur changé → CPG ───────────────
  // Ce déclencheur est géré manuellement via une variable d'env
  const tauxChange = process.env.TAUX_BDC_CHANGE === 'true';
  if (tauxChange) {
    const cpgs = placements.filter(p => p.type === 'CPG' && p.statut === 'Actif');
    if (cpgs.length > 0) {
      rappels.push({
        priorite: 2,
        emoji: "🏦",
        raison: `Suite au changement de taux BdC — ${cpgs.length} CPG actif(s)`,
        suggestion: `Discuter de l'impact du changement de taux sur les CPG de ${nom}. Évaluer si un renouvellement ou transfert est avantageux.`,
        tag: "taux-cpg"
      });
    }
  }

  return { nom, rappels, conseiller: fiche.conseiller || null };
}

// ── Génération HTML du courriel ───────────────────────────
function genererCourriel(date, resultats) {
  const total = resultats.reduce((s, r) => s + r.rappels.length, 0);
  const prioritaires = resultats.reduce((s, r) => s + r.rappels.filter(x => x.priorite === 1).length, 0);

  const dateStr = new Date(date).toLocaleDateString('fr-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const conseillerLabel = (c) => c === 'olivier' ? 'OF' : c === 'maxime' ? 'MT' : 'GFF';
  const conseillerColor = (c) => c === 'olivier' ? '#0F0F0F' : c === 'maxime' ? '#BF8F00' : '#666';

  let clientsHTML = '';
  if (resultats.length === 0) {
    clientsHTML = `<div style="text-align:center;padding:40px 20px;color:#888;font-size:15px">
      Aucun rappel pour aujourd'hui.<br>
      <span style="font-size:13px;color:#aaa;margin-top:8px;display:block">Bonne journée!</span>
    </div>`;
  } else {
    resultats.forEach(({ nom, rappels, conseiller }) => {
      const urgents = rappels.filter(r => r.priorite === 1);
      const normaux = rappels.filter(r => r.priorite === 2);

      const rappelsHTML = [...urgents, ...normaux].map(r => `
        <div style="padding:12px 16px;background:${r.priorite === 1 ? '#FFFAED' : '#F9F9F9'};
          border-left:3px solid ${r.priorite === 1 ? '#BF8F00' : '#D6DCE4'};
          border-radius:0 6px 6px 0;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#0F0F0F;margin-bottom:4px">
            ${r.emoji} ${r.raison}
          </div>
          <div style="font-size:12px;color:#595959;line-height:1.5">
            ${r.suggestion}
          </div>
        </div>
      `).join('');

      const consTag = conseiller ? `<span style="display:inline-block;padding:2px 8px;
        border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.5px;
        background:${conseillerColor(conseiller)};color:#fff;margin-left:8px">
        ${conseillerLabel(conseiller)}</span>` : '';

      clientsHTML += `
        <div style="background:#fff;border:1px solid #E8E8E8;border-radius:10px;
          margin-bottom:16px;overflow:hidden">
          <div style="background:#0F0F0F;padding:12px 16px;display:flex;
            align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:50%;background:rgba(191,143,0,.2);
                display:flex;align-items:center;justify-content:center;
                font-size:13px;font-weight:800;color:#BF8F00;flex-shrink:0">
                ${nom.split(' ').map(p=>p[0]||'').join('').substring(0,2).toUpperCase()}
              </div>
              <span style="color:#fff;font-size:14px;font-weight:700">${nom}</span>
              ${consTag}
            </div>
            <span style="background:${urgents.length > 0 ? '#BF8F00' : '#444'};color:#fff;
              font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px">
              ${rappels.length} rappel${rappels.length > 1 ? 's' : ''}
              ${urgents.length > 0 ? ' · ' + urgents.length + ' urgent' + (urgents.length > 1 ? 's' : '') : ''}
            </span>
          </div>
          <div style="padding:14px 16px">${rappelsHTML}</div>
        </div>
      `;
    });
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rappels GFF du ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#F2F2F2;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:#0F0F0F;border-radius:12px 12px 0 0;padding:24px 28px;
      display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:13px;font-weight:700;color:#BF8F00;letter-spacing:.8px;
          text-transform:uppercase;margin-bottom:4px">Groupe Financier Formule</div>
        <div style="font-size:22px;font-weight:800;color:#fff">Rappels du jour</div>
        <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px">${dateStr}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:32px;font-weight:900;color:#BF8F00">${resultats.length}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;
          letter-spacing:.5px">client${resultats.length > 1 ? 's' : ''}</div>
      </div>
    </div>

    <!-- Résumé -->
    <div style="background:#BF8F00;padding:14px 28px;display:flex;gap:24px">
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:#fff">${total}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.7);text-transform:uppercase;
          letter-spacing:.5px">rappel${total > 1 ? 's' : ''} total</div>
      </div>
      <div style="width:1px;background:rgba(255,255,255,.2)"></div>
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:#fff">${prioritaires}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.7);text-transform:uppercase;
          letter-spacing:.5px">urgent${prioritaires > 1 ? 's' : ''}</div>
      </div>
      <div style="width:1px;background:rgba(255,255,255,.2)"></div>
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:#fff">${resultats.length}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.7);text-transform:uppercase;
          letter-spacing:.5px">client${resultats.length > 1 ? 's' : ''} à contacter</div>
      </div>
    </div>

    <!-- Corps -->
    <div style="background:#F9F9F9;padding:20px;border:1px solid #E8E8E8;border-top:none">
      ${clientsHTML}
    </div>

    <!-- Footer -->
    <div style="background:#0F0F0F;border-radius:0 0 12px 12px;padding:16px 28px;
      display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:11px;color:rgba(255,255,255,.35)">
        Généré automatiquement chaque matin à 8h00 EST
      </div>
      <a href="https://gfformule.ca/conseiller" style="font-size:11px;color:#BF8F00;
        text-decoration:none;font-weight:700">Ouvrir le simulateur →</a>
    </div>

  </div>
</body>
</html>`;
}

// ── Handler principal ─────────────────────────────────────
export default async function handler(req) {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante");
    return new Response("Config manquante", { status: 500 });
  }

  try {
    // 1. Charger tous les clients
    const store = getStore('gff-clients');
    const { blobs } = await store.list();

    const clients = await Promise.all(
      blobs.map(async ({ key }) => {
        const data = await store.get(key, { type: 'json' });
        return { id: key, ...data };
      })
    );

    console.log(`${clients.length} client(s) chargé(s)`);

    // 2. Analyser chaque client
    const resultats = clients
      .map(c => analyserClient(c))
      .filter(r => r.rappels.length > 0)
      .sort((a, b) => {
        const maxA = Math.min(...a.rappels.map(r => r.priorite));
        const maxB = Math.min(...b.rappels.map(r => r.priorite));
        return maxA - maxB;
      });

    console.log(`${resultats.length} client(s) avec rappels`);

    // 3. Générer et envoyer le courriel
    const dateAujourdhui = new Date().toISOString();
    const htmlCourriel = genererCourriel(dateAujourdhui, resultats);

    const dateStr = new Date().toLocaleDateString('fr-CA', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    const sujet = resultats.length > 0
      ? `📋 GFF — ${resultats.length} client(s) à contacter aujourd'hui (${resultats.reduce((s,r)=>s+r.rappels.filter(x=>x.priorite===1).length,0)} urgent(s))`
      : `📋 GFF — Rappels du ${dateStr} — Aucun rappel aujourd'hui`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: DESTINATAIRES,
        subject: sujet,
        html: htmlCourriel,
      }),
    });

    if (res.ok) {
      console.log(`✓ Courriel envoyé à ${DESTINATAIRES.join(', ')}`);
      return new Response(JSON.stringify({
        success: true,
        clients: resultats.length,
        rappels: resultats.reduce((s,r) => s + r.rappels.length, 0)
      }), { status: 200 });
    } else {
      const err = await res.text();
      console.error("Erreur Resend:", err);
      return new Response(JSON.stringify({ error: err }), { status: 500 });
    }

  } catch (e) {
    console.error("Erreur:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
