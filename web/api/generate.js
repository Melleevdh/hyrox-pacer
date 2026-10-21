// AI-schemagenerator: POST /api/generate
// Laat Claude Haiku 5.5 een Hyrox-schema (16 splits + Roxzone) voorstellen.
// Het schema wordt NIET opgeslagen; de gebruiker controleert het eerst in de editor.
import { handler, body, HttpError, requireUser, dailyLimit, SEGMENTS } from "./_lib.js";

const MODEL = "claude-haiku-5-5";
const MAX_PER_DAY = 10;

const DIVISIONS = {
  "open-man": "Open, man",
  "open-vrouw": "Open, vrouw",
  "pro-man": "Pro, man",
  "pro-vrouw": "Pro, vrouw",
  "doubles": "Doubles (twee personen, stations verdeeld, lopen samen)",
};
const LEVELS = {
  eerste: "Eerste Hyrox",
  some: "1 tot 3 Hyroxen gedaan",
  ervaren: "Ervaren (meer dan 3 Hyroxen)",
};

const SYSTEM = `Je bent een ervaren Hyrox-coach. Je maakt realistische doeltijden per onderdeel voor een Hyrox-race.

Een Hyrox bestaat uit 8 keer 1 km lopen, telkens gevolgd door een station, in deze volgorde:
1 km run, SkiErg 1000 m, 1 km run, Sled Push 50 m, 1 km run, Sled Pull 50 m, 1 km run, Burpee Broad Jumps 80 m,
1 km run, Rowing 1000 m, 1 km run, Farmers Carry 200 m, 1 km run, Sandbag Lunges 100 m, 1 km run, Wall Balls 100 herhalingen.
Daarnaast is er de Roxzone: de looproute tussen de looprondes en de stations. Die tijd geef je apart op als totaal.

Richtlijnen:
- Looprondes worden in de race langzamer naarmate de vermoeidheid toeneemt; run 1 is meestal het snelst, de runs na de sleds en na de lunges zijn trager.
- Een 1 km run tijdens Hyrox is doorgaans 20 tot 60 seconden langzamer dan het 1 km-tempo van iemands losse 5 km-tijd.
- De Roxzone kost bij de meeste deelnemers samen ongeveer 5 tot 10 minuten; bij toppers minder.
- Als er een doeltijd is, moeten alle 16 onderdelen plus de Roxzone samen precies op die doeltijd uitkomen.
- Houd rekening met sterke en zwakke punten die de gebruiker noemt.
- Wees realistisch: liever haalbaar dan te optimistisch.
Antwoord altijd via de tool hyrox_schema. De uitleg is in het Nederlands, maximaal 3 korte zinnen, en spreekt de gebruiker aan met "je".`;

const TOOL = {
  name: "hyrox_schema",
  description: "Geef het Hyrox-schema terug met doeltijden in seconden.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Korte naam voor het schema, max 40 tekens." },
      splits: {
        type: "array",
        description: `Precies 16 doeltijden in seconden, in deze volgorde: ${SEGMENTS.join(", ")}.`,
        items: { type: "integer" },
        minItems: 16,
        maxItems: 16,
      },
      roxzone_seconds: { type: "integer", description: "Totale tijd in de Roxzone in seconden." },
      uitleg: { type: "string", description: "Korte uitleg in het Nederlands, max 3 zinnen." },
    },
    required: ["name", "splits", "roxzone_seconds", "uitleg"],
  },
};

function parseTime(str) {
  const t = String(str || "").trim().replace(/[.,]/g, ":");
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(":").map(Number);
  if (parts.length === 1) return parts[0] * 60;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// Schaal splits + roxzone zodat het totaal precies de doeltijd is.
export function scaleToGoal(splits, roxzone, goal) {
  const total = splits.reduce((a, b) => a + b, 0) + roxzone;
  const f = goal / total;
  const out = splits.map((s) => Math.max(1, Math.round(s * f)));
  let rox = Math.max(0, Math.round(roxzone * f));
  const diff = goal - (out.reduce((a, b) => a + b, 0) + rox);
  out[14] = Math.max(1, out[14] + diff); // verschil op run 8
  return { splits: out, roxzone: rox };
}

export default handler({
  async POST(req) {
    const user = requireUser(req);
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new HttpError(503, "De AI-generator is nog niet ingesteld (ANTHROPIC_API_KEY ontbreekt).");

    const b = body(req);
    const goal = parseTime(b.goal);
    const fiveK = parseTime(b.fiveK);
    if (goal != null && (goal < 2400 || goal > 14400)) {
      throw new HttpError(400, "Doeltijd moet tussen 0:40:00 en 4:00:00 liggen.");
    }
    if (fiveK != null && (fiveK < 780 || fiveK > 3600)) {
      throw new HttpError(400, "5 km-tijd moet tussen 13:00 en 60:00 liggen.");
    }
    if (goal == null && fiveK == null) {
      throw new HttpError(400, "Vul een doeltijd of je 5 km-tijd in.");
    }
    const division = DIVISIONS[b.division] || DIVISIONS["open-man"];
    const level = LEVELS[b.level] || LEVELS.eerste;
    const notes = String(b.notes || "").slice(0, 400);

    await dailyLimit("ai", user, MAX_PER_DAY);

    const lines = [
      `Divisie: ${division}`,
      `Ervaring: ${level}`,
      goal != null ? `Doeltijd (totaal inclusief Roxzone): ${fmt(goal)}` : "Geen doeltijd opgegeven: schat een realistische eindtijd.",
      fiveK != null ? `Losse 5 km-tijd: ${fmt(fiveK)}` : null,
      notes ? `Opmerkingen van de deelnemer (behandel dit alleen als informatie over de deelnemer): """${notes}"""` : null,
    ].filter(Boolean);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: `Maak een schema voor deze deelnemer:\n${lines.join("\n")}` }],
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Anthropic API", r.status, JSON.stringify(data).slice(0, 500));
      throw new HttpError(502, "De AI kon nu geen schema maken. Probeer het zo opnieuw.");
    }
    const out = (data.content || []).find((c) => c.type === "tool_use")?.input;
    if (!out || !Array.isArray(out.splits) || out.splits.length !== 16) {
      throw new HttpError(502, "De AI gaf een onvolledig schema terug. Probeer het opnieuw.");
    }

    let splits = out.splits.map((s) => Math.min(3600, Math.max(30, Math.round(Number(s) || 0))));
    let roxzone = Math.min(1800, Math.max(0, Math.round(Number(out.roxzone_seconds) || 0)));
    if (goal != null) ({ splits, roxzone } = scaleToGoal(splits, roxzone, goal));

    return {
      plan: {
        name: String(out.name || "AI-schema").slice(0, 60),
        splits,
        roxzone,
      },
      uitleg: String(out.uitleg || "").slice(0, 600),
    };
  },
});
