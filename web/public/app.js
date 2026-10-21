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
      <input data-i="${i}" value="${fmt(splits[i])}" inputmode="numeric" aria-label="Doeltijd ${name}">
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

  [...inputs, roxInput].forEach((inp) => {
    inp.addEventListener("input", recalc);
    inp.addEventListener("blur", () => {
      const v = parseTime(inp.value);
      if (v != null && v > 0) inp.value = fmt(v);
    });
    inp.addEventListener("focus", () => inp.select());
  });

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
