/**
 * GET /api/clients — Récupérer tous les clients
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'x-gff-auth, Content-Type'
      }
    });
  }

  const auth = req.headers.get('x-gff-auth');
  const HASH = "d781ec969b160c2beb25b3e01a3c059a213009d03b07f5c188ed1285ef647575";
  if (auth !== HASH) {
    return new Response(JSON.stringify({ error: 'Non autorise' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const store = getStore('gff-clients');
    const listResult = await store.list();

    // Compatibilité multi-versions @netlify/blobs
    const blobs = Array.isArray(listResult)
      ? listResult
      : (listResult?.blobs || listResult?.result?.blobs || []);

    if (!blobs.length) {
      // Retourner tableau vide — le simulateur attend un Array
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const clients = [];
    for (const blob of blobs) {
      const key = blob.key || blob;
      try {
        const data = await store.get(key, { type: 'json' });
        if (data) {
          clients.push({ id: key, ...data });
        }
      } catch (e) {
        console.warn('Erreur lecture client ' + key + ':', e.message);
      }
    }

    // Trier par nom
    clients.sort((a, b) => {
      const na = (a.name || a.nom || '').toLowerCase();
      const nb = (b.name || b.nom || '').toLowerCase();
      return na.localeCompare(nb, 'fr');
    });

    return new Response(JSON.stringify(clients), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (e) {
    console.error('clients-get error:', e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export const config = { path: '/api/clients' };
