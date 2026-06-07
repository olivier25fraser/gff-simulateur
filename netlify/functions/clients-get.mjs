/**
 * GET /api/clients — Récupérer tous les clients
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  // Vérification mot de passe (hash SHA-256 de GFF2026!OFMT)
  const auth = req.headers.get('x-gff-auth');
  const HASH = "d781ec969b160c2beb25b3e01a3c059a213009d03b07f5c188ed1285ef647575";
  if (auth !== HASH) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const store = getStore('gff-clients');
    const { blobs } = await store.list();
    
    const clients = await Promise.all(
      blobs.map(async ({ key }) => {
        const data = await store.get(key, { type: 'json' });
        return { id: key, ...data };
      })
    );

    // Trier par nom
    clients.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));

    return new Response(JSON.stringify(clients), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = { path: '/api/clients' };
