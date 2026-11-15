/**
 * Verification de la session conseiller (cookie signe pose par
 * netlify/edge-functions/conseiller-gate.ts). Utilisee par les fonctions
 * qui donnent acces aux donnees clients.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "gff_session";

export function sessionValide(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookies = req.headers.get("cookie") || "";
  const match = cookies.split(";").map((c) => c.trim()).find((c) => c.startsWith(COOKIE + "="));
  if (!match) return false;
  const [exp, sig] = match.slice(COOKIE.length + 1).split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const attendu = createHmac("sha256", secret).update("gff-session:" + exp).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}
