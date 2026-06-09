/**
 * /api/clients — API clients unifiée
 * GET    → liste tous les clients
 * POST   body {action:"save", id, ...data} → sauvegarder
 * POST   body {action:"delete", id} → supprimer
 */
import { getStore } from "@netlify/blobs";

const HASH = "d781ec969b160c2beb25b3e01a3c059a213009d03b07f5c188ed1285ef647575";

function cors(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "x-gff-auth, Content-Type"
    }
  });
}

export default async function handler(req) {
  // CORS preflight
  if (req.method === "OPTIONS") return cors(null, 204);

  // Auth
  const auth = req.headers.get("x-gff-auth");
  if (auth !== HASH) return cors(JSON.stringify({error:"Non autorise"}), 401);

  const store = getStore("gff-clients");

  try {
    // GET — liste tous les clients
    if (req.method === "GET") {
      let blobs = [];
      try {
        const result = await store.list();
        blobs = result?.blobs || result || [];
      } catch(e) {
        console.error("list error:", e.message);
        return cors(JSON.stringify([]), 200);
      }

      if (!blobs.length) return cors(JSON.stringify([]), 200);

      const clients = [];
      for (const blob of blobs) {
        const key = typeof blob === "string" ? blob : blob.key;
        try {
          const data = await store.get(key, { type: "json" });
          if (data) clients.push({ id: key, ...data });
        } catch(e) {
          console.warn("skip", key, e.message);
        }
      }

      clients.sort((a, b) => {
        const na = (a.name || "").toLowerCase();
        const nb = (b.name || "").toLowerCase();
        return na.localeCompare(nb, "fr");
      });

      return cors(JSON.stringify(clients), 200);
    }

    // POST — save ou delete
    if (req.method === "POST") {
      const body = await req.json();
      const { action, id } = body;

      if (!id) return cors(JSON.stringify({error:"ID manquant"}), 400);

      if (action === "delete") {
        await store.delete(id);
        return cors(JSON.stringify({success:true, id}), 200);
      }

      // Par défaut: save
      const { action: _, id: __, ...clientData } = body;
      clientData.derniere_maj = new Date().toISOString();
      await store.setJSON(id, clientData);
      return cors(JSON.stringify({success:true, id}), 200);
    }

    return cors(JSON.stringify({error:"Méthode non supportée"}), 405);

  } catch(e) {
    console.error("clients error:", e.message, e.stack);
    return cors(JSON.stringify({error: e.message}), 500);
  }
}
