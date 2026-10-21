// Endpoint voor het horloge: GET /api/watch?id=<device-id>
// - Nog niet gekoppeld -> { paired: false, code: "123456" }
// - Gekoppeld          -> { paired: true, user, plan: { name, splits: [16 x seconden], roxzone: seconden } | null }
import crypto from "node:crypto";
import { handler, redis, HttpError, getPlans } from "./_lib.js";

const ID_RE = /^[a-z0-9]{16,64}$/;
const CODE_TTL = 15 * 60; // seconden

export default handler({
  async GET(req) {
    const id = String(req.query.id || "").toLowerCase();
    if (!ID_RE.test(id)) throw new HttpError(400, "Ongeldig apparaat.");

    const user = await redis("GET", `device:${id}`);
    if (user) {
      const plans = await getPlans(user);
      const active = plans.find((p) => p.active) || null;
      return {
        paired: true,
        user,
        plan: active ? { name: active.name, splits: active.splits, roxzone: active.roxzone || 0 } : null,
      };
    }

    // Niet gekoppeld: geef (dezelfde) koppelcode terug.
    let code = await redis("GET", `devicecode:${id}`);
    if (!code) {
      for (let i = 0; i < 10 && !code; i++) {
        const candidate = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
        const ok = await redis("SET", `paircode:${candidate}`, id, "NX", "EX", CODE_TTL);
        if (ok === "OK") code = candidate;
      }
      if (!code) throw new HttpError(503, "Probeer het zo opnieuw.");
      await redis("SET", `devicecode:${id}`, code, "EX", CODE_TTL);
    }
    return { paired: false, code };
  },
});
