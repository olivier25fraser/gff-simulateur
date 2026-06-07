/**
 * POST /api/clients/delete — Supprimer un client
 * Body JSON: { id }
 */
import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  const auth = req.headers.get('x-gff-auth');
  const HASH = "d781ec969b160c2beb25b3e01a3c059a213009d03b07f5c188ed1285ef647575";
  if (auth !== HASH) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!id) return new Response(JSON.stringify({ error: 'ID manquant' }), { status: 400 });

    const store = getStore('gff-clients');
    await store.delete(id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export const config = { path: '/api/clients/delete' };
