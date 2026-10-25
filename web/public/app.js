const SEGMENTS = [
  "Run 1", "SkiErg", "Run 2", "Sled Push", "Run 3", "Sled Pull", "Run 4", "Burpee Broad Jumps",
  "Run 5", "Rowing", "Run 6", "Farmers Carry", "Run 7", "Sandbag Lunges", "Run 8", "Wall Balls",
];
const DEFAULT_SPLITS = [300, 270, 300, 240, 330, 300, 330, 300, 330, 285, 330, 150, 330, 300, 345, 360];
const DEFAULT_ROXZONE = 360;

// Roxzone wordt verdeeld over de 8 runs (je drukt LAP bij begin en eind van elk station).
export function roxShare(roxzone, runIndex) {
  return Math.floor(roxzone / 8) + (runIndex < roxzone % 8 ? 1 : 0);
}

function planTotal(p) {
  return p.splits.reduce((a, b) => a + b, 0) + (p.roxzone || 0);
}

const app = document.getElementById("app");
const state = { user: null, plans: [], devices: [] };

// ---------- Hulpfuncties ----------

async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data.error || "Er ging iets mis.");
  return data;
}

export function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// "4:30" -> 270, "1:02:00" -> 3720, "5" -> 300 (minuten), "4.30" -> 270
export function parseTime(str) {
  const t = String(str).trim().replace(/[.,]/g, ":");
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(":").map(Number);
  if (parts.length === 1) return parts[0] * 60;
  if (parts.slice(1).some((p) => p > 59)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function show(tplId) {
  app.replaceChildren(document.getElementById(tplId).content.cloneNode(true));
  window.scrollTo(0, 0);
}

function showError(el, msg) {
  el.textContent = msg || "";
  el.hidden = !msg;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Tijdkiezer (draaiwiel, werkt op telefoon en computer) ----------

const ITEM_H = 44; // hoogte van één regel in het wiel (px), gelijk aan CSS --wheel-item

// Kolomsets
const HMS = (maxH = 4) => [
  { label: "uur", min: 0, max: maxH },
  { label: "min", min: 0, max: 59 },
  { label: "sec", min: 0, max: 59 },
];
const MS = (minM = 0, maxM = 59) => [
  { label: "min", min: minM, max: maxM },
  { label: "sec", min: 0, max: 59 },
];

function splitSeconds(total, cols) {
  if (cols.length === 3) return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return [Math.floor(total / 60), total % 60];
}

function joinSeconds(parts) {
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

// Maakt van een <input> een tikveld dat het draaiwiel opent.
// opts: { title, cols, optional, fallback (seconden als het veld leeg is) }
function timeField(input, opts) {
  input.readOnly = true;
  input.setAttribute("inputmode", "none");
  input.classList.add("time-field");
  input.addEventListener("click", () => openWheel(input, opts));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openWheel(input, opts); }
  });
}

function openWheel(input, { title, cols, optional = false, fallback = 0 }) {
  const current = parseTime(input.value);
  const start = splitSeconds(current ?? fallback, cols).map((v, i) => Math.min(cols[i].max, Math.max(cols[i].min, v)));

  const sheet = document.createElement("div");
  sheet.className = "wheel-backdrop";
  sheet.innerHTML = `
    <div class="wheel-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="wheel-top">
        <button type="button" class="link" data-act="cancel">Annuleren</button>
        <strong>${esc(title)}</strong>
        <button type="button" class="link accent" data-act="done">Klaar</button>
      </div>
      <div class="wheel-labels">${cols.map((c) => `<span>${c.label}</span>`).join("")}</div>
      <div class="wheel-cols">
        <div class="wheel-band" aria-hidden="true"></div>
        ${cols.map((c, ci) => `
          <div class="wheel" data-col="${ci}" tabindex="0" aria-label="${c.label}">
            ${Array.from({ length: c.max - c.min + 1 }, (_, k) => {
              const v = c.min + k;
              return `<div class="wheel-item" data-v="${v}">${ci === 0 && cols.length === 3 ? v : String(v).padStart(2, "0")}</div>`;
            }).join("")}
          </div>`).join("")}
      </div>
      ${optional ? `<button type="button" class="btn wheel-clear" data-act="clear">Leegmaken</button>` : ""}
    </div>`;
  document.body.appendChild(sheet);
  document.body.classList.add("no-scroll");

  const wheels = [...sheet.querySelectorAll(".wheel")];
  const value = (ci) => {
    const c = cols[ci];
    const idx = Math.round(wheels[ci].scrollTop / ITEM_H);
    return Math.min(c.max, Math.max(c.min, c.min + idx));
  };
  const mark = (ci) => {
    const v = value(ci);
    wheels[ci].querySelectorAll(".wheel-item").forEach((it) => it.classList.toggle("sel", Number(it.dataset.v) === v));
  };

  wheels.forEach((w, ci) => {
    w.scrollTop = (start[ci] - cols[ci].min) * ITEM_H;
    mark(ci);
    w.addEventListener("scroll", () => mark(ci), { passive: true });
    // Tik op een getal = daarheen draaien
    w.addEventListener("click", (e) => {
      const it = e.target.closest(".wheel-item");
      if (it) w.scrollTo({ top: (Number(it.dataset.v) - cols[ci].min) * ITEM_H, behavior: "smooth" });
    });
    // Pijltjestoetsen op de computer
    w.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const next = value(ci) + (e.key === "ArrowDown" ? 1 : -1);
      if (next >= cols[ci].min && next <= cols[ci].max) w.scrollTo({ top: (next - cols[ci].min) * ITEM_H, behavior: "smooth" });
    });
  });
  // Schermen die net geopend zijn zetten scrollTop soms pas na de opmaak goed.
  requestAnimationFrame(() => wheels.forEach((w, ci) => { w.scrollTop = (start[ci] - cols[ci].min) * ITEM_H; mark(ci); }));

  function close() {
    sheet.classList.add("closing");
    document.body.classList.remove("no-scroll");
    setTimeout(() => sheet.remove(), 180);
    input.focus({ preventScroll: true });
  }
  function commit(str) {
    input.value = str;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  }

  sheet.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (e.target === sheet || act === "cancel") return close();
    if (act === "clear") return commit("");
    if (act === "done") return commit(fmtCols(joinSeconds(wheels.map((_, ci) => value(ci))), cols));
  });
  sheet.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  wheels[0].focus({ preventScroll: true });
}

// Tijd tonen in het formaat van de kiezer (h:mm:ss of m:ss).
function fmtCols(sec, cols) {
  if (cols.length === 3) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s2).padStart(2, "0")}`;
  }
  return fmt(sec);
}

// ---------- Inloggen ----------

function renderAuth() {
  show("tpl-auth");
  let mode = "login";
  const form = app.querySelector("#auth-form");
  const err = form.querySelector(".error");
  const submit = form.querySelector("button[type=submit]");
  const pw = form.querySelector("input[name=password]");

  app.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      mode = tab.dataset.mode;
      app.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      submit.textContent = mode === "login" ? "Inloggen" : "Account maken";
      pw.autocomplete = mode === "login" ? "current-password" : "new-password";
      showError(err, "");
    })
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(err, "");
    submit.disabled = true;
    try {
      const fd = new FormData(form);
      const { user } = await api("/api/auth", {
        method: "POST",
        body: { action: mode, username: fd.get("username"), password: fd.get("password") },
      });
      state.user = user;
      await loadHome();
    } catch (ex) {
      showError(err, ex.message);
    } finally {
      submit.disabled = false;
    }
  });
}

// ---------- Overzicht ----------

async function loadHome() {
  const [p, d] = await Promise.all([api("/api/plans"), api("/api/devices")]);
  state.plans = p.plans;
  state.devices = d.devices;
  renderHome();
}

function renderHome() {
  show("tpl-home");
  app.querySelector(".user").textContent = state.user;
  app.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/auth", { method: "POST", body: { action: "logout" } });
    state.user = null;
    renderAuth();
  });

  // Horloge
  const status = app.querySelector("#watch-status");
  const list = app.querySelector("#device-list");
  const pairBox = app.querySelector("#pair-box");
  if (state.devices.length) {
    status.textContent = state.devices.length === 1 ? "Gekoppeld" : `${state.devices.length} gekoppeld`;
    status.classList.add("ok");
    list.innerHTML = state.devices
      .map((d, i) => `
        <div class="device">
          <span>⌚ Horloge ${i + 1} <small>sinds ${new Date(d.paired).toLocaleDateString("nl-NL")}</small></span>
          <button class="link danger" data-unpair="${esc(d.id)}">Ontkoppelen</button>
        </div>`)
      .join("");
    pairBox.querySelector("summary").textContent = "Nog een horloge koppelen";
  } else {
    status.textContent = "Niet gekoppeld";
    pairBox.open = true;
  }
  list.querySelectorAll("[data-unpair]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Dit horloge ontkoppelen?")) return;
      state.devices = (await api(`/api/devices?id=${encodeURIComponent(b.dataset.unpair)}`, { method: "DELETE" })).devices;
      renderHome();
    })
  );

  const pairForm = app.querySelector("#pair-form");
  const pairErr = pairBox.querySelector(".error");
  pairForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(pairErr, "");
    try {
      const code = new FormData(pairForm).get("code");
      state.devices = (await api("/api/devices", { method: "POST", body: { code } })).devices;
      renderHome();
    } catch (ex) {
      showError(pairErr, ex.message);
    }
  });

  // Schema's
  const plansEl = app.querySelector("#plan-list");
  if (!state.plans.length) {
    plansEl.innerHTML = `<div class="card empty">Nog geen schema's. Maak je eerste schema aan.</div>`;
  } else {
    const sorted = [...state.plans].sort((a, b) => (b.active - a.active) || (b.updated - a.updated));
    plansEl.innerHTML = sorted
      .map((p) => {
        const rox = p.roxzone || 0;
        const total = planTotal(p);
        const run = p.splits.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
        return `
        <article class="card plan ${p.active ? "active" : ""}">
          <div class="plan-main">
            <div>
              ${p.active ? `<span class="pill ok">Actief op horloge</span>` : ""}
              <h3>${esc(p.name)}</h3>
              <p class="meta">Lopen ${fmt(run)} · Stations ${fmt(total - run - rox)} · Roxzone ${fmt(rox)}</p>
            </div>
            <strong class="plan-total">${fmt(total)}</strong>
          </div>
          <div class="plan-actions">
            ${p.active ? "" : `<button class="btn" data-activate="${p.id}">Maak actief</button>`}
            <button class="btn" data-edit="${p.id}">Bewerken</button>
            <button class="btn" data-copy="${p.id}">Kopiëren</button>
            <button class="link danger" data-delete="${p.id}">Verwijderen</button>
          </div>
        </article>`;
      })
      .join("");
  }

  app.querySelector("#new-plan").addEventListener("click", () => renderEditor(null));
  app.querySelector("#ai-plan").addEventListener("click", renderAI);
  plansEl.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => renderEditor(state.plans.find((p) => p.id === b.dataset.edit)))
  );
  plansEl.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => {
      const src = state.plans.find((p) => p.id === b.dataset.copy);
      renderEditor({ name: `${src.name} (kopie)`, splits: [...src.splits], roxzone: src.roxzone || 0 });
    })
  );
  plansEl.querySelectorAll("[data-activate]").forEach((b) =>
    b.addEventListener("click", async () => {
      state.plans = (await api("/api/plans", { method: "POST", body: { action: "activate", id: b.dataset.activate } })).plans;
      renderHome();
    })
  );
  plansEl.querySelectorAll("[data-delete]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Dit schema verwijderen?")) return;
      state.plans = (await api(`/api/plans?id=${encodeURIComponent(b.dataset.delete)}`, { method: "DELETE" })).plans;
      renderHome();
    })
  );
}

// ---------- Schema bewerken ----------

function renderEditor(plan, aiUitleg) {
  show("tpl-editor");
  const form = app.querySelector("#plan-form");
  const err = form.querySelector(".error");
  const rows = app.querySelector("#split-rows");
  const totalEl = app.querySelector("#total");
  const splits = plan ? [...plan.splits] : [...DEFAULT_SPLITS];
  let roxzone = plan ? plan.roxzone || 0 : DEFAULT_ROXZONE;
  const roxInput = app.querySelector("#roxzone");
  const roxHint = app.querySelector("#rox-hint");
  roxInput.value = fmt(roxzone);

  if (aiUitleg !== undefined) {
    const note = app.querySelector("#ai-note");
    note.hidden = false;
    note.querySelector("p").textContent = aiUitleg;
  }

  app.querySelector(".editor-title").textContent = plan?.id ? "Schema bewerken" : aiUitleg !== undefined ? "AI-schema" : "Nieuw schema";
  const nameInput = form.querySelector("input[name=name]");
  nameInput.value = plan?.name || "";
  app.querySelector("#back").addEventListener("click", renderHome);

  rows.innerHTML = SEGMENTS.map((name, i) => `
    <li class="${i % 2 === 0 ? "run" : "station"}">
      <span class="seg"><b>${i + 1}</b>${name}</span>
      <input data-i="${i}" value="${fmt(splits[i])}" aria-label="Doeltijd ${name}">
      <span class="cum" data-cum="${i}"></span>
    </li>`).join("");

  const inputs = [...rows.querySelectorAll("input")];

  function recalc() {
    let valid = true;
    const rv = roxInput.value.trim() === "" ? 0 : parseTime(roxInput.value);
    const roxBad = rv == null || rv > 3600;
    roxInput.classList.toggle("bad", roxBad);
    if (roxBad) valid = false;
    else roxzone = rv;

    let sum = 0;
    inputs.forEach((inp, i) => {
      const v = parseTime(inp.value);
      inp.classList.toggle("bad", v == null || v < 1);
      if (v == null || v < 1) valid = false;
      else splits[i] = v;
      sum += splits[i] + (i % 2 === 0 ? roxShare(roxzone, i / 2) : 0);
      rows.querySelector(`[data-cum="${i}"]`).textContent = fmt(sum);
    });
    totalEl.textContent = fmt(sum);

    const share = roxShare(roxzone, 0);
    roxHint.textContent = roxzone
      ? `De Roxzone telt mee bij je runs: +${fmt(share)} per run. Op je horloge is het doel voor Run 1 dus ${fmt(splits[0])} + ${fmt(share)} = ${fmt(splits[0] + share)}. De kolom Totaal en je eindtijd zijn inclusief Roxzone.`
      : "Vul je verwachte totale Roxzone-tijd in (meestal 5 tot 10 minuten). Die telt mee bij je runs en je eindtijd.";
    return valid;
  }

  inputs.forEach((inp, i) => timeField(inp, { title: `${i + 1}. ${SEGMENTS[i]}`, cols: MS(0, 59) }));
  timeField(roxInput, { title: "Roxzone (totaal)", cols: MS(0, 30) });
  timeField(app.querySelector("#pace"), { title: "Looptempo per km", cols: MS(2, 15), fallback: 315 });
  [...inputs, roxInput].forEach((inp) => inp.addEventListener("input", recalc));

  app.querySelector("#apply-pace").addEventListener("click", () => {
    const pace = parseTime(app.querySelector("#pace").value);
    if (!pace) return showError(err, "Vul een tempo in, bijv. 5:15.");
    showError(err, "");
    inputs.forEach((inp, i) => { if (i % 2 === 0) inp.value = fmt(pace); });
    recalc();
  });

  recalc();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(err, "");
    if (!recalc()) return showError(err, "Controleer de rood gemarkeerde tijden (gebruik m:ss).");
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const res = await api("/api/plans", {
        method: "POST",
        body: { id: plan?.id, name: nameInput.value, splits, roxzone },
      });
      state.plans = res.plans;
      renderHome();
    } catch (ex) {
      showError(err, ex.message);
      btn.disabled = false;
    }
  });
}

// ---------- AI-schema ----------

function renderAI() {
  show("tpl-ai");
  app.querySelector("#back").addEventListener("click", renderHome);
  const form = app.querySelector("#ai-form");
  const err = form.querySelector(".error");
  const btn = form.querySelector("button[type=submit]");
  timeField(form.querySelector("input[name=goal]"), { title: "Doeltijd", cols: HMS(4), optional: true, fallback: 4800 });
  timeField(form.querySelector("input[name=fiveK]"), { title: "Je 5 km-tijd", cols: MS(12, 60), optional: true, fallback: 1500 });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(err, "");
    const fd = new FormData(form);
    if (!String(fd.get("goal")).trim() && !String(fd.get("fiveK")).trim()) {
      return showError(err, "Vul een doeltijd of je 5 km-tijd in.");
    }
    btn.disabled = true;
    btn.textContent = "Haiku denkt na…";
    try {
      const res = await api("/api/generate", { method: "POST", body: Object.fromEntries(fd) });
      renderEditor(res.plan, res.uitleg);
    } catch (ex) {
      showError(err, ex.message);
      btn.disabled = false;
      btn.textContent = "✨ Maak mijn schema";
    }
  });
}

// ---------- Start ----------

(async () => {
  try {
    const { user } = await api("/api/auth");
    state.user = user;
    if (user) await loadHome();
    else renderAuth();
  } catch (ex) {
    app.innerHTML = `<p class="error">${esc(ex.message)}</p>`;
  }
})();
