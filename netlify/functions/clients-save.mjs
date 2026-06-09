/**
 * POST /api/clients/save — Sauvegarder un client
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'x-gff-auth, Content-Type'
      }
    });
  }

  const auth = req.headers.get('x-gff-auth');
  const HASH = "d781ec969b160c2beb25b3e01a3c059a213009d03b07f5c188ed1285ef647575";
  if (auth !== HASH) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Méthode non supportée', { status: 405 });
  }

  try {
    const body = await req.json();
    const { id, ...clientData } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID manquant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    clientData.derniere_maj = new Date().toISOString();

    const store = getStore('gff-clients');
    await store.setJSON(id, clientData);

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    console.error('clients-save error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export const config = { path: '/api/clients/save' };
