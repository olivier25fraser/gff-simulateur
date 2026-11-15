/**
 * POST /api/clients/delete — Supprimer un client
 * Groupe Financier Formule
 */
import { getStore } from "@netlify/blobs";
import { sessionValide } from "./_shared/session.mjs";

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (!sessionValide(req)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID manquant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const store = getStore('gff-clients');
    await store.delete(id);

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    console.error('clients-delete error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export const config = { path: '/api/clients/delete' };
