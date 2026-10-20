import {
  handler, body, redis, getJSON, HttpError,
  hashPassword, checkPassword, setSession, clearSession, getUser,
} from "./_lib.js";

const NAME_RE = /^[a-z0-9_.-]{3,24}$/;

export default handler({
  // Wie is er ingelogd?
  async GET(req) {
    return { user: getUser(req) };
  },

  async POST(req, res) {
    const { action, username: rawName, password } = body(req);

    if (action === "logout") {
      clearSession(res);
      return { ok: true };
    }

    const username = String(rawName || "").trim().toLowerCase();
    const pw = String(password || "");

    if (action === "register") {
      if (!NAME_RE.test(username)) {
        throw new HttpError(400, "Gebruikersnaam: 3-24 tekens, alleen letters, cijfers, punt, - of _.");
      }
      if (pw.length < 8) throw new HttpError(400, "Wachtwoord moet minstens 8 tekens zijn.");
      const { salt, hash } = hashPassword(pw);
      const created = await redis(
        "SET", `user:${username}`, JSON.stringify({ salt, hash, created: Date.now() }), "NX"
      );
      if (created !== "OK") throw new HttpError(409, "Deze gebruikersnaam is al bezet.");
      setSession(res, username);
      return { user: username };
    }

    if (action === "login") {
      const attempts = await redis("INCR", `rl:login:${username}`);
      if (attempts === 1) await redis("EXPIRE", `rl:login:${username}`, 900);
      if (attempts > 10) throw new HttpError(429, "Te vaak geprobeerd. Wacht een kwartier.");

      const user = await getJSON(`user:${username}`);
      if (!user || !checkPassword(pw, user.salt, user.hash)) {
        throw new HttpError(401, "Gebruikersnaam of wachtwoord klopt niet.");
      }
      await redis("DEL", `rl:login:${username}`);
      setSession(res, username);
      return { user: username };
    }

    throw new HttpError(400, "Onbekende actie.");
  },
});
