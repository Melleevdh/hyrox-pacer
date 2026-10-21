// Gedeelde helpers: opslag (Upstash Redis via REST), wachtwoorden, sessies.
// Geen externe packages nodig.
import crypto from "node:crypto";

// ---------- Opslag ----------

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Alle sleutels krijgen dit voorvoegsel, zodat de database veilig gedeeld kan worden
// met andere projecten.
const KEY_PREFIX = "hp:";

export async function redis(...cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new HttpError(503, "Database is nog niet gekoppeld.");
  }
  // Alle gebruikte commando's (GET, SET, DEL, INCR, EXPIRE) hebben de sleutel als eerste argument.
  cmd[1] = KEY_PREFIX + cmd[1];
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function getJSON(key) {
  const v = await redis("GET", key);
  return v == null ? null : JSON.parse(v);
}

export async function setJSON(key, value) {
  await redis("SET", key, JSON.stringify(value));
}

// ---------- HTTP ----------

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function handler(methods) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const fn = methods[req.method];
    if (!fn) {
      res.status(405).json({ error: "Methode niet toegestaan." });
      return;
    }
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: status === 500 ? "Er ging iets mis op de server." : e.message });
    }
  };
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

// ---------- Wachtwoorden ----------

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return { salt, hash };
}

export function checkPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 32);
  const real = Buffer.from(hash, "hex");
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

// ---------- Sessies (ondertekende cookie) ----------

const COOKIE = "hp_session";
const SESSION_DAYS = 90;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new HttpError(503, "SESSION_SECRET ontbreekt.");
  return s;
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function setSession(res, username) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = `${Buffer.from(username).toString("base64url")}.${exp}`;
  const token = `${payload}.${sign(payload)}`;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
  );
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function getUser(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "").split(";").map((c) => {
      const i = c.indexOf("=");
      return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
  const token = cookies[COOKIE];
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  if (expected.length !== parts[2].length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return Buffer.from(parts[0], "base64url").toString();
}

export function requireUser(req) {
  const u = getUser(req);
  if (!u) throw new HttpError(401, "Je bent niet ingelogd.");
  return u;
}

// ---------- Schema's ----------

export const SEGMENTS = [
  "Run 1", "SkiErg", "Run 2", "Sled Push", "Run 3", "Sled Pull", "Run 4", "Burpee Broad Jumps",
  "Run 5", "Rowing", "Run 6", "Farmers Carry", "Run 7", "Sandbag Lunges", "Run 8", "Wall Balls",
];

export async function getPlans(username) {
  return (await getJSON(`plans:${username}`)) || [];
}

export async function savePlans(username, plans) {
  await setJSON(`plans:${username}`, plans);
}

export function validPlan(p) {
  if (!p || typeof p !== "object") throw new HttpError(400, "Ongeldig schema.");
  const name = String(p.name || "").trim().slice(0, 60);
  if (!name) throw new HttpError(400, "Geef je schema een naam.");
  if (!Array.isArray(p.splits) || p.splits.length !== 16) {
    throw new HttpError(400, "Een schema heeft precies 16 tijden.");
  }
  const splits = p.splits.map((s) => Math.round(Number(s)));
  if (splits.some((s) => !Number.isFinite(s) || s < 1 || s > 36000)) {
    throw new HttpError(400, "Elke tijd moet tussen 0:01 en 10:00:00 liggen.");
  }
  const roxzone = Math.round(Number(p.roxzone || 0));
  if (!Number.isFinite(roxzone) || roxzone < 0 || roxzone > 3600) {
    throw new HttpError(400, "Roxzone-tijd moet tussen 0:00 en 60:00 liggen.");
  }
  return { name, splits, roxzone };
}

// Eenvoudige daglimiet per gebruiker (bijv. voor AI-aanvragen).
export async function dailyLimit(name, user, max) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${name}:${user}:${day}`;
  const n = await redis("INCR", key);
  if (n === 1) await redis("EXPIRE", key, 90000);
  if (n > max) throw new HttpError(429, `Je hebt het maximum van ${max} per dag bereikt. Probeer het morgen weer.`);
}
