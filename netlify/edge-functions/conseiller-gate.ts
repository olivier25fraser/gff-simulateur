/**
 * Protection serveur du portail conseiller (/conseiller/*)
 * Groupe Financier Formule
 *
 * - POST /conseiller/login  : verifie le mot de passe (variable CONSEILLER_PASSWORD)
 *                             et pose un cookie de session signe (HttpOnly).
 * - GET  /conseiller/logout : supprime le cookie.
 * - Toute autre page /conseiller/* est refusee sans cookie valide, sauf la page
 *   de connexion (/conseiller/), qui ne contient aucun secret.
 *
 * Variables d'environnement Netlify requises :
 *   CONSEILLER_PASSWORD  mot de passe du portail
 *   SESSION_SECRET       longue chaine aleatoire servant a signer les sessions
 */

declare const Netlify: { env: { get(key: string): string | undefined } };

const COOKIE = "gff_session";
const DUREE_SECONDES = 12 * 60 * 60;
const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sessionValide(request: Request, secret: string): Promise<boolean> {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE + "="));
  if (!match) return false;
  const [exp, sig] = match.slice(COOKIE.length + 1).split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return egal(sig, await hmac(secret, "gff-session:" + exp));
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const password = Netlify.env.get("CONSEILLER_PASSWORD");
  const secret = Netlify.env.get("SESSION_SECRET");
  const configure = Boolean(password && secret);

  const estPageConnexion = path === "/conseiller" || path === "/conseiller/" || path === "/conseiller/index.html";

  // Connexion
  if (path === "/conseiller/login") {
    if (request.method !== "POST") return json({ error: "Methode non supportee" }, 405);
    if (!configure) return json({ error: "Acces non configure" }, 503);
    let saisi = "";
    try {
      saisi = String((await request.json()).password ?? "");
    } catch (_e) {
      return json({ error: "Requete invalide" }, 400);
    }
    // Comparaison a temps constant (empreintes HMAC de meme longueur)
    const a = await hmac(secret!, "pwd:" + saisi);
    const b = await hmac(secret!, "pwd:" + password!);
    if (!egal(a, b)) {
      await new Promise((r) => setTimeout(r, 1000));
      return json({ error: "Mot de passe incorrect" }, 401);
    }
    const exp = String(Math.floor(Date.now() / 1000) + DUREE_SECONDES);
    const token = exp + "." + (await hmac(secret!, "gff-session:" + exp));
    return json({ ok: true }, 200, {
      "Set-Cookie": `${COOKIE}=${token}; Path=/; Max-Age=${DUREE_SECONDES}; HttpOnly; Secure; SameSite=Strict`,
    });
  }

  // Deconnexion
  if (path === "/conseiller/logout") {
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/conseiller/",
        "Cache-Control": "no-store",
        "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }

  const connecte = configure ? await sessionValide(request, secret!) : false;

  if (estPageConnexion) {
    if (connecte) {
      return new Response(null, { status: 302, headers: { Location: "/conseiller/app.html", "Cache-Control": "no-store" } });
    }
    return context.next();
  }

  if (!connecte) {
    return new Response(null, { status: 302, headers: { Location: "/conseiller/", "Cache-Control": "no-store" } });
  }

  const reponse = await context.next();
  reponse.headers.set("Cache-Control", "no-store");
  return reponse;
};

export const config = { path: ["/conseiller", "/conseiller/*"] };
