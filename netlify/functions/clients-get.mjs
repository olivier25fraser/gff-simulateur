/**
 * GET /api/clients — Récupérer tous les clients
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  // CORS preflight
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

  // Vérification auth
  const auth = req.headers.get('x-gff-auth');
  const HASH = "d781ec969b160c2beb25b3e01a3c059a213009d03b07f5c188ed1285ef647575";
  if (auth !== HASH) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const store = getStore('gff-clients');

    // Lister les blobs de façon robuste
    const listResult = await store.list();
    const blobs = listResult?.blobs || listResult?.result?.blobs || [];

    if (!blobs || blobs.length === 0) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Charger chaque client
    const entries = await Promise.all(
      blobs.map(async ({ key }) => {
        try {
          const data = await store.get(key, { type: 'json' });
          if (!data) return null;
          return [key, data];
        } catch (e) {
          console.warn(`Erreur lecture client ${key}:`, e.message);
          return null;
        }
      })
    );

    // Construire l'objet clients (format attendu par le simulateur)
    const clients = {};
    entries.filter(Boolean).forEach(([key, data]) => {
      clients[key] = data;
    });

    return new Response(JSON.stringify(clients), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (e) {
    console.error('clients-get error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export const config = { path: '/api/clients' };
