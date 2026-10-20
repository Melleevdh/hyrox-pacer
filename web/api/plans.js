import crypto from "node:crypto";
import {
  handler, body, HttpError, requireUser, getPlans, savePlans, validPlan,
} from "./_lib.js";

const MAX_PLANS = 50;

export default handler({
  async GET(req) {
    const user = requireUser(req);
    return { plans: await getPlans(user) };
  },

  // Nieuw schema, schema wijzigen, of schema actief maken.
  async POST(req) {
    const user = requireUser(req);
    const b = body(req);
    const plans = await getPlans(user);

    if (b.action === "activate") {
      const target = plans.find((p) => p.id === b.id);
      if (!target) throw new HttpError(404, "Schema niet gevonden.");
      plans.forEach((p) => (p.active = p.id === b.id));
      await savePlans(user, plans);
      return { plans };
    }

    const clean = validPlan(b);
    if (b.id) {
      const existing = plans.find((p) => p.id === b.id);
      if (!existing) throw new HttpError(404, "Schema niet gevonden.");
      Object.assign(existing, clean, { updated: Date.now() });
    } else {
      if (plans.length >= MAX_PLANS) throw new HttpError(400, `Maximaal ${MAX_PLANS} schema's.`);
      plans.push({
        id: crypto.randomBytes(6).toString("hex"),
        ...clean,
        active: plans.length === 0, // eerste schema is meteen actief
        updated: Date.now(),
      });
    }
    await savePlans(user, plans);
    return { plans };
  },

  async DELETE(req) {
    const user = requireUser(req);
    const id = req.query.id;
    let plans = await getPlans(user);
    const wasActive = plans.find((p) => p.id === id)?.active;
    plans = plans.filter((p) => p.id !== id);
    if (wasActive && plans.length) plans[0].active = true;
    await savePlans(user, plans);
    return { plans };
  },
});
