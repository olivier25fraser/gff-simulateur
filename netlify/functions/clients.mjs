/**
 * /api/clients — API clients unifiée
 * Groupe Financier Formule
 */

import { getStore } from "@netlify/blobs";

const HASH = "d781ec969b160c2beb25b3e01a3c059a213009d03b07f5c188ed1285ef647575";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-gff-auth, Content-Type"
};

function resp(data, status) {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status: status || 200,
    headers: HEADERS
  });
}

export default async function handler(req, context) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });

  const auth = req.headers.get("x-gff-auth");
  if (auth !== HASH) return resp({ error: "Non autorise" }, 401);

  try {
    const store = getStore({ name: "gff-clients", consistency: "strong" });

    // GET — liste tous les clients
    if (req.method === "GET") {
      const { blobs } = await store.list();

      if (!blobs || blobs.length === 0) {
        return resp([], 200);
      }

      const clients = [];
      for (const { key } of blobs) {
        try {
          const data = await store.get(key, { type: "json" });
          if (data) clients.push({ id: key, ...data });
        } catch(e) {
          console.warn("skip", key, e.message);
        }
      }

      clients.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase(), "fr"));
      return resp(clients, 200);
    }

    // POST — save ou delete
    if (req.method === "POST") {
      const body = await req.json();
      const { action, id } = body;

      if (!id) return resp({ error: "ID manquant" }, 400);

      if (action === "delete") {
        await store.delete(id);
        return resp({ success: true, id }, 200);
      }

      // Save
      const { action: _a, id: _i, ...clientData } = body;
      clientData.derniere_maj = new Date().toISOString();
      await store.setJSON(id, clientData);
      return resp({ success: true, id }, 200);
    }

    return resp({ error: "Methode non supportee" }, 405);

  } catch(e) {
    console.error("clients error:", e.message, e.stack);
    return resp({ error: e.message }, 500);
  }
}
