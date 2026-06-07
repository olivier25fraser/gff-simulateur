/**
 * POST /api/clients/save — Sauvegarder un client
 * Body JSON: { id, nom, prenom, ...donnees }
 */
import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  const auth = req.headers.get('x-gff-auth');
  const HASH = "d781ec969b160c2beb25b3e01a3c059a213009d03b07f5c188ed1285ef647575";
  if (auth !== HASH) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  if (req.method !== 'POST') {
    return new Response('Méthode non supportée', { status: 405 });
  }

  try {
    const body = await req.json();
    const { id, ...clientData } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID manquant' }), { status: 400 });
    }

    // Ajouter horodatage
    clientData.derniere_maj = new Date().toISOString();

    const store = getStore('gff-clients');
    await store.setJSON(id, clientData);

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export const config = { path: '/api/clients/save' };
