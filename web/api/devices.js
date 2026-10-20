import { handler, body, redis, getJSON, setJSON, HttpError, requireUser } from "./_lib.js";

async function listDevices(user) {
  return (await getJSON(`devices:${user}`)) || [];
}

export default handler({
  async GET(req) {
    const user = requireUser(req);
    return { devices: await listDevices(user) };
  },

  // Horloge koppelen met de 6-cijferige code die op het horloge staat.
  async POST(req) {
    const user = requireUser(req);
    const code = String(body(req).code || "").replace(/\D/g, "");
    if (code.length !== 6) throw new HttpError(400, "De code bestaat uit 6 cijfers.");

    const attempts = await redis("INCR", `rl:pair:${user}`);
    if (attempts === 1) await redis("EXPIRE", `rl:pair:${user}`, 900);
    if (attempts > 20) throw new HttpError(429, "Te vaak geprobeerd. Wacht een kwartier.");

    const deviceId = await redis("GET", `paircode:${code}`);
    if (!deviceId) {
      throw new HttpError(404, "Code niet gevonden of verlopen. Open de app op je horloge opnieuw voor een nieuwe code.");
    }

    await redis("SET", `device:${deviceId}`, user);
    await redis("DEL", `paircode:${code}`);
    await redis("DEL", `devicecode:${deviceId}`);

    const devices = (await listDevices(user)).filter((d) => d.id !== deviceId);
    devices.push({ id: deviceId, paired: Date.now() });
    await setJSON(`devices:${user}`, devices);
    return { devices };
  },

  // Horloge ontkoppelen.
  async DELETE(req) {
    const user = requireUser(req);
    const id = String(req.query.id || "");
    const owner = await redis("GET", `device:${id}`);
    if (owner === user) await redis("DEL", `device:${id}`);
    const devices = (await listDevices(user)).filter((d) => d.id !== id);
    await setJSON(`devices:${user}`, devices);
    return { devices };
  },
});
