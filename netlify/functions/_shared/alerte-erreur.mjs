/**
 * Utilitaire partagé — Envoie un courriel d'alerte quand une automatisation échoue.
 * Réutilisé par marches-update, news-update et fonds-update.
 * Groupe Financier Formule
 *
 * Ce fichier ne commence pas par un verbe HTTP standard donc Netlify ne le traite
 * pas comme une fonction planifiée à part entière — c'est un simple module importé.
 */

export async function alerterEchec(nomAutomatisation, messageErreur) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const EMAIL_DEST = process.env.EMAIL_DESTINATAIRE || "info@groupefinancierformule.com";
  const EMAIL_FROM = process.env.EMAIL_EXPEDITEUR || "GFF Simulateur <noreply@groupefinancierformule.com>";

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY manquante — impossible d'envoyer l'alerte d'échec");
    return;
  }

  const quand = new Date().toLocaleString('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' });

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
  <tr><td style="background:#C00000;padding:20px 32px">
    <p style="margin:0;color:#fff;font-size:18px;font-weight:700">⚠️ Échec d'une automatisation — Simulateur GFF</p>
  </td></tr>
  <tr><td style="padding:28px 32px">
    <p style="margin:0 0 6px;font-size:13px;color:#666">Automatisation :</p>
    <p style="margin:0 0 18px;font-size:16px;font-weight:700;color:#0F0F0F">${nomAutomatisation}</p>
    <p style="margin:0 0 6px;font-size:13px;color:#666">Quand :</p>
    <p style="margin:0 0 18px;font-size:14px;color:#0F0F0F">${quand}</p>
    <p style="margin:0 0 6px;font-size:13px;color:#666">Message d'erreur :</p>
    <div style="background:#FFF3F3;border-left:4px solid #C00000;padding:12px 16px;border-radius:4px;font-size:13px;color:#7F1D1D;font-family:monospace;white-space:pre-wrap;word-break:break-word">${(messageErreur || 'Erreur inconnue').slice(0,800)}</div>
    <p style="margin:20px 0 0;font-size:12px;color:#999;line-height:1.6">
      Le site continue de fonctionner normalement avec les dernières données valides en cache.
      Vérifiez les journaux dans Netlify → Functions → ${nomAutomatisation} pour plus de détails,
      ou demandez à Claude d'investiguer.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

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
        subject: `⚠️ ${nomAutomatisation} a échoué — Simulateur GFF`,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Échec envoi courriel d'alerte:", await res.text());
    }
  } catch (e) {
    console.error("Exception envoi courriel d'alerte:", e.message);
  }
}
