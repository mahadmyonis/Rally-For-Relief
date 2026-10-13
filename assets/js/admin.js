// Rally for Relief — organiser app
// Sign in, create tournaments, manage teams and format, and enter live scores.

import { store, DELETE } from "./store.js";
import * as C from "./tournament-core.js";
import { esc, formatDate, formatTime, statusChip, query } from "./ui.js";

const view = document.getElementById("view");
const userBox = document.getElementById("admin-user");
const toastEl = document.getElementById("toast");
const id = query("t");

let user = null;
let current = null;
let tab = sessionStorageGet("r4r-admin-tab") || "";
let scoreFilter = "open";
let pendingRender = false;
let unwatch = null;

function sessionStorageGet(k) {
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function sessionStorageSet(k, v) {
  try { sessionStorage.setItem(k, v); } catch { /* ignore */ }
}

// --- Feedback ------------------------------------------------------------------

let toastTimer;
function toast(msg, kind = "ok") {
  toastEl.textContent = msg;
  toastEl.className = `toast is-visible toast-${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = "toast"; }, kind === "error" ? 6000 : 1800);
}

function friendlyError(err) {
  const code = err && err.code;
  if (code === "permission-denied") return "This account isn't an organiser yet. Add its email to the Firestore rules (see README).";
  if (code === "auth/popup-closed-by-user") return "Sign-in was cancelled.";
  if (code === "auth/unauthorized-domain") return "This domain isn't allowed to sign in yet. Add it in Firebase → Authentication → Settings → Authorized domains.";
  return (err && err.message) || "Something went wrong.";
}

async function save(patch, msg = "Saved") {
  try {
    await store.updateTournament(id, patch);
    if (msg) toast(msg);
  } catch (err) {
    console.error(err);
    toast(friendlyError(err), "error");
  }
}

function hasResults(t, filter = () => true) {
  return C.matchList(t).some((m) => filter(m) && m.status !== "scheduled");
}

// Don't redraw while someone is typing — wait until they leave the field
function scheduleRender() {
  const a = document.activeElement;
  if (a && view.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) {
    pendingRender = true;
    return;
  }
  render();
}
view.addEventListener("focusout", () => {
  setTimeout(() => {
    const a = document.activeElement;
    const typing = a && view.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
    if (pendingRender && !typing) { pendingRender = false; render(); }
  }, 0);
});

// --- Auth ----------------------------------------------------------------------

function renderUser() {
  if (!user) { userBox.innerHTML = ""; return; }
  userBox.innerHTML = `
    <span class="admin-email">${esc(user.email || user.displayName || "")}</span>
    <button class="btn btn-ghost btn-sm" id="sign-out">Sign out</button>`;
  userBox.querySelector("#sign-out").addEventListener("click", () => store.signOut());
}

function renderSignIn() {
  view.innerHTML = `
    <div class="signin">
      <img src="../assets/logo.png" alt="R4R — Rally for Relief" width="796" height="417">
      <h1>Organiser login</h1>
      <p>Manage tournaments, teams and live scores.</p>
      ${store.mode === "demo" ? `
        <button class="btn btn-accent btn-lg" id="sign-in">Enter demo mode</button>
        <p class="demo-note">Firebase isn't connected yet, so this runs in demo mode — everything is saved in this browser only. See the README to go live.</p>
      ` : `
        <button class="btn btn-accent btn-lg" id="sign-in">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#0B0B0B" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
          Sign in with Google
        </button>
        <p class="muted-sm">Only approved organiser accounts can make changes.</p>
      `}
      <p><a class="back-link" href="../tournaments/">← Public tournaments page</a></p>
    </div>`;
  view.querySelector("#sign-in").addEventListener("click", () => {
    store.signIn().catch((err) => toast(friendlyError(err), "error"));
  });
}

// --- Dashboard -----------------------------------------------------------------

function renderDashboard(list) {
  const sorted = list.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Organiser</p>
      <h1 class="section-title">Your tournaments</h1>
    </div>
    ${store.mode === "demo" ? `<p class="demo-note">Demo mode — data is only saved in this browser until Firebase is connected.</p>` : ""}

    <form class="panel new-form" id="new-form">
      <h2 class="panel-title">New tournament</h2>
      <div class="field-row">
        <label class="field grow"><span>Name</span><input name="name" required maxlength="80" placeholder="e.g. Winter Volleyball Rally"></label>
        <label class="field"><span>Date</span><input name="date" type="date"></label>
        <label class="field grow"><span>Location</span><input name="location" maxlength="80" placeholder="e.g. ICC Gym"></label>
      </div>
      <button class="btn btn-accent" type="submit">Create tournament <span aria-hidden="true">→</span></button>
    </form>

    ${sorted.length ? `<div class="t-grid">${sorted.map((t) => `
      <a class="t-card" href="?t=${encodeURIComponent(t.id)}">
        <div class="t-card-top">${statusChip(t.status)}${t.published ? "" : `<span class="chip chip-draft">Hidden</span>`}</div>
        <h2>${esc(t.name)}</h2>
        <p class="t-meta">${t.date ? `<span>📅 ${esc(formatDate(t.date))}</span>` : ""}${t.location ? `<span>📍 ${esc(t.location)}</span>` : ""}</p>
        <p class="t-card-foot"><span>${Object.keys(t.teams || {}).length} teams</span><span>Manage →</span></p>
      </a>`).join("")}</div>` : `<p class="muted-sm">No tournaments yet — create your first one above.</p>`}
  `;

  view.querySelector("#new-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const newId = await store.createTournament({
        name: String(f.get("name")).trim(),
        date: f.get("date") || "",
        location: String(f.get("location") || "").trim(),
        status: "upcoming",
        published: false,
        settings: { ...C.DEFAULT_SETTINGS },
        teams: {},
        groups: [],
        matches: {}
      });
      sessionStorageSet("r4r-admin-tab", "teams");
      location.href = `?t=${encodeURIComponent(newId)}`;
    } catch (err) {
      toast(friendlyError(err), "error");
    }
  });
}

// --- Editor --------------------------------------------------------------------

function render() {
  if (!user) return renderSignIn();
  if (!id) return; // dashboard renders from its own subscription
  const t = current;
  if (!t) {
    view.innerHTML = `<div class="empty"><h1>Tournament not found</h1><p><a class="btn btn-ghost" href="./">Back to dashboard</a></p></div>`;
    return;
  }
  const matches = C.matchList(t);
  if (!tab) tab = matches.length ? "scores" : Object.keys(t.teams || {}).length ? "format" : "teams";

  const tabs = [["scores", "Scores"], ["teams", "Teams"], ["format", "Format"], ["setup", "Settings"]];
  view.innerHTML = `
    <a class="back-link" href="./">← All tournaments</a>
    <header class="t-hero admin-hero">
      <div class="t-hero-row">
        <div>
          <div>${statusChip(t.status)}${t.published ? `<span class="chip chip-final">Public</span>` : `<span class="chip chip-draft">Hidden</span>`}</div>
          <h1 class="section-title">${esc(t.name)}</h1>
          <p class="t-meta">${t.date ? `<span>📅 ${esc(formatDate(t.date))}</span>` : ""}${t.location ? `<span>📍 ${esc(t.location)}</span>` : ""}</p>
        </div>
        <div class="hero-quick">
          <label class="field"><span>Status</span>
            <select id="quick-status">
              ${["upcoming", "live", "finished"].map((s) => `<option value="${s}" ${t.status === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}
            </select>
          </label>
          <a class="btn btn-ghost btn-sm" href="../tournaments/?t=${encodeURIComponent(id)}" target="_blank" rel="noopener">View public page ↗</a>
        </div>
      </div>
      ${t.published ? "" : `<p class="notice">This tournament is hidden from the public site. Turn on <strong>Show on public site</strong> in Settings when you're ready.</p>`}
    </header>

    <div class="tabs-bar">
      <div class="tabs" role="tablist">
        ${tabs.map(([k, label]) => `<button role="tab" class="tab ${k === tab ? "is-active" : ""}" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join("")}
      </div>
    </div>
    <div class="tab-panel" id="panel"></div>
  `;

  view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    tab = b.dataset.tab;
    sessionStorageSet("r4r-admin-tab", tab);
    render();
  }));
  view.querySelector("#quick-status").addEventListener("change", (e) => save({ status: e.target.value }, "Status updated"));

  const panel = view.querySelector("#panel");
  if (tab === "scores") renderScores(t, panel);
  if (tab === "teams") renderTeams(t, panel);
  if (tab === "format") renderFormat(t, panel);
  if (tab === "setup") renderSetup(t, panel);
}

// --- Scores --------------------------------------------------------------------

function renderScores(t, panel) {
  const all = C.scheduleList(t);
  if (!all.length) {
    panel.innerHTML = `<div class="empty"><h2>No games yet</h2><p>Add teams, then set up groups or a bracket in <strong>Format</strong>.</p></div>`;
    return;
  }
  const counts = {
    open: all.filter((m) => m.status !== "final").length,
    live: all.filter((m) => m.status === "live").length,
    all: all.length
  };
  const list = all.filter((m) => scoreFilter === "all" || (scoreFilter === "live" ? m.status === "live" : m.status !== "final"));
  const draws = (t.settings || {}).allowDraws !== false;

  panel.innerHTML = `
    <div class="filter-row" role="group" aria-label="Show games">
      ${[["open", "To play"], ["live", "Live"], ["all", "All"]].map(([k, label]) =>
        `<button class="pill-btn ${scoreFilter === k ? "is-active" : ""}" data-filter="${k}">${label} <span>${counts[k]}</span></button>`).join("")}
    </div>
    ${list.length ? "" : `<p class="muted-sm">Nothing here — ${scoreFilter === "live" ? "no games are live right now" : "every game is finished"}.</p>`}
    <div class="score-list">
      ${list.map((m) => {
        const homeId = C.resolveSource(t, m.home);
        const awayId = C.resolveSource(t, m.away);
        const ready = homeId && awayId;
        const num = (side) => {
          const v = m[side];
          return `<div class="stepper">
            <button type="button" class="step" data-step="-1" data-side="${side}" aria-label="Minus one" ${ready ? "" : "disabled"}>−</button>
            <input type="number" inputmode="numeric" min="0" class="score-input" data-side="${side}" value="${Number.isFinite(v) ? v : ""}" placeholder="–" aria-label="Score" ${ready ? "" : "disabled"}>
            <button type="button" class="step" data-step="1" data-side="${side}" aria-label="Plus one" ${ready ? "" : "disabled"}>+</button>
          </div>`;
        };
        return `
          <article class="score-card status-${m.status}" data-id="${esc(m.id)}">
            <header class="score-head">
              <span class="score-stage">${esc(C.stageLabel(t, m))}</span>
              <div class="score-when">
                <input type="time" class="mini" data-field="time" value="${esc(m.time || "")}" aria-label="Start time">
                <input type="text" class="mini" data-field="court" value="${esc(m.court || "")}" placeholder="Court" maxlength="20" aria-label="Court">
              </div>
            </header>
            <div class="score-body">
              <div class="score-team ${homeId ? "" : "is-tbd"}">${esc(C.sourceLabel(t, m.home))}</div>
              ${num("hs")}
              <span class="score-sep">vs</span>
              ${num("as")}
              <div class="score-team right ${awayId ? "" : "is-tbd"}">${esc(C.sourceLabel(t, m.away))}</div>
            </div>
            <footer class="status-switch" role="group" aria-label="Game status">
              ${[["scheduled", "Not started"], ["live", "Live"], ["final", "Final"]].map(([s, label]) =>
                `<button type="button" class="seg ${m.status === s ? "is-active" : ""}" data-status="${s}" ${ready ? "" : "disabled"}>${label}</button>`).join("")}
            </footer>
            ${ready ? "" : `<p class="muted-sm">Teams are decided once earlier games finish.</p>`}
          </article>`;
      }).join("")}
    </div>
    ${draws ? "" : `<p class="muted-sm">Draws are turned off, so a game can't be marked final while tied.</p>`}
  `;

  panel.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    scoreFilter = b.dataset.filter;
    render();
  }));

  panel.querySelectorAll(".score-card").forEach((card) => {
    const mid = card.dataset.id;
    const m = t.matches[mid];
    const inputs = { hs: card.querySelector('.score-input[data-side="hs"]'), as: card.querySelector('.score-input[data-side="as"]') };

    const commitScore = (side, value) => {
      const n = value === "" ? null : Math.max(0, Math.floor(Number(value)));
      if (n !== null && !Number.isFinite(n)) return;
      const patch = { [`matches.${mid}.${side}`]: n };
      m[side] = n; // so "Final" right after typing sees the new score
      // Typing a score into a game that hasn't started marks it live
      if (m.status === "scheduled" && n !== null) {
        patch[`matches.${mid}.status`] = "live";
        m.status = "live";
        const other = side === "hs" ? "as" : "hs";
        if (!Number.isFinite(m[other])) { patch[`matches.${mid}.${other}`] = 0; m[other] = 0; }
        if (t.status === "upcoming") patch.status = "live";
      }
      save(patch, "");
    };

    Object.values(inputs).forEach((inp) => inp.addEventListener("change", () => commitScore(inp.dataset.side, inp.value.trim())));
    card.querySelectorAll(".step").forEach((b) => b.addEventListener("click", () => {
      const side = b.dataset.side;
      const cur = Number.isFinite(m[side]) ? m[side] : 0;
      const next = Math.max(0, cur + Number(b.dataset.step));
      inputs[side].value = next;
      commitScore(side, String(next));
    }));

    card.querySelectorAll("[data-field]").forEach((inp) => inp.addEventListener("change", () => {
      save({ [`matches.${mid}.${inp.dataset.field}`]: inp.value.trim() }, "");
    }));

    card.querySelectorAll("[data-status]").forEach((b) => b.addEventListener("click", () => {
      const s = b.dataset.status;
      const hs = m.hs, as = m.as;
      if (s === "final") {
        if (!Number.isFinite(hs) || !Number.isFinite(as)) return toast("Enter both scores before marking the game final.", "error");
        const drawsOk = m.stage === "group" && (t.settings || {}).allowDraws !== false;
        if (hs === as && !drawsOk) return toast(m.stage === "ko" ? "Knockout games need a winner — scores can't be tied." : "Draws are turned off for this tournament.", "error");
      }
      const patch = { [`matches.${mid}.status`]: s };
      if (s === "scheduled") { patch[`matches.${mid}.hs`] = null; patch[`matches.${mid}.as`] = null; }
      if (s === "scheduled" && (Number.isFinite(hs) || Number.isFinite(as)) && !confirm("Reset this game? The score will be cleared.")) return;
      // Kick off the tournament automatically when the first game goes live
      if (s === "live" && t.status === "upcoming") patch.status = "live";
      save(patch, s === "final" ? "Final score saved" : s === "live" ? "Game is live" : "Game reset");
    }));
  });
}

// --- Teams ---------------------------------------------------------------------

function teamInUse(t, teamId) {
  return C.matchList(t).some((m) => (m.home && m.home.id === teamId) || (m.away && m.away.id === teamId));
}

function renderTeams(t, panel) {
  const teams = C.sortedTeams(t);
  panel.innerHTML = `
    <div class="panel">
      <h2 class="panel-title">Add teams</h2>
      <form class="add-team" id="add-team">
        <label class="field grow"><span>Team name</span><input name="name" required maxlength="40" placeholder="e.g. Spike Squad" autocomplete="off"></label>
        <button class="btn btn-accent" type="submit">Add</button>
      </form>
      <details class="bulk">
        <summary>Add several at once</summary>
        <form id="bulk-form">
          <label class="field"><span>One team per line</span><textarea name="names" rows="6" placeholder="Spike Squad&#10;Net Ninjas&#10;Block Party"></textarea></label>
          <button class="btn btn-ghost btn-sm" type="submit">Add all</button>
        </form>
      </details>
    </div>

    <div class="panel">
      <h2 class="panel-title">Teams <span class="count">${teams.length}</span></h2>
      ${teams.length ? `<ol class="team-list">${teams.map((tm, i) => `
        <li data-id="${esc(tm.id)}">
          <span class="team-num">${i + 1}</span>
          <input class="team-name-input" value="${esc(tm.name)}" maxlength="40" aria-label="Team name">
          <div class="team-actions">
            <button class="icon-btn" data-move="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-btn" data-move="1" aria-label="Move down" ${i === teams.length - 1 ? "disabled" : ""}>↓</button>
            <button class="icon-btn danger" data-remove aria-label="Remove ${esc(tm.name)}">✕</button>
          </div>
        </li>`).join("")}</ol>
        <p class="muted-sm">Order matters when you build a bracket without groups: the top team is seed 1.</p>`
      : `<p class="muted-sm">No teams yet.</p>`}
    </div>`;

  const nextOrder = () => teams.reduce((mx, tm) => Math.max(mx, tm.order ?? 0), 0) + 1;

  panel.querySelector("#add-team").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = String(new FormData(e.target).get("name")).trim();
    if (!name) return;
    save({ [`teams.${C.uid("t")}`]: { name, order: nextOrder() } }, `Added ${name}`);
    e.target.reset();
    e.target.querySelector("input").focus();
  });

  panel.querySelector("#bulk-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const names = String(new FormData(e.target).get("names")).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const patch = {};
    let order = nextOrder();
    names.forEach((name) => { patch[`teams.${C.uid("t")}`] = { name: name.slice(0, 40), order: order++ }; });
    save(patch, `Added ${names.length} teams`);
  });

  panel.querySelectorAll(".team-list li").forEach((li) => {
    const tid = li.dataset.id;
    li.querySelector(".team-name-input").addEventListener("change", (e) => {
      const name = e.target.value.trim();
      if (name) save({ [`teams.${tid}.name`]: name }, "Renamed");
    });
    li.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
      const i = teams.findIndex((x) => x.id === tid);
      const j = i + Number(b.dataset.move);
      if (j < 0 || j >= teams.length) return;
      const patch = {};
      teams.forEach((x, k) => {
        const pos = k === i ? j : k === j ? i : k;
        patch[`teams.${x.id}.order`] = pos + 1;
      });
      save(patch, "");
    }));
    li.querySelector("[data-remove]").addEventListener("click", () => {
      if (teamInUse(t, tid)) {
        toast("This team already has games. Remove the groups/bracket in Format first.", "error");
        return;
      }
      if (!confirm(`Remove ${t.teams[tid].name}?`)) return;
      const groups = (t.groups || []).map((g) => ({ ...g, teamIds: g.teamIds.filter((x) => x !== tid) }));
      save({ [`teams.${tid}`]: DELETE, groups }, "Team removed");
    });
  });
}

// --- Format --------------------------------------------------------------------

function renderFormat(t, panel) {
  const teams = C.sortedTeams(t);
  const groups = t.groups || [];
  const matches = C.matchList(t);
  const groupMatches = matches.filter((m) => m.stage === "group");
  const koMatches = matches.filter((m) => m.stage === "ko");
  const advance = groups.length ? groups[0].advance || 0 : 2;
  const suggestedGroups = teams.length >= 12 ? 4 : teams.length >= 6 ? 2 : 1;

  if (teams.length < 2) {
    panel.innerHTML = `<div class="empty"><h2>Add at least two teams first</h2><p>Head to <strong>Teams</strong> to add them.</p></div>`;
    return;
  }

  panel.innerHTML = `
    <p class="muted-sm format-intro">Pick any mix: <strong>groups only</strong> (a league if you use one group), <strong>bracket only</strong>, or <strong>groups then a bracket</strong>.</p>

    <section class="panel">
      <h2 class="panel-title"><span class="step-badge">1</span> Group stage</h2>
      ${groups.length ? `
        <div class="group-grid">
          ${groups.map((g, gi) => `
            <div class="group-box">
              <h3>${esc(g.name)} <span class="count">${g.teamIds.length}</span></h3>
              <ul>${g.teamIds.map((tid) => `
                <li>
                  <span>${esc(C.teamName(t, tid))}</span>
                  ${groups.length > 1 ? `<select class="mini move-team" data-team="${esc(tid)}" data-from="${gi}" aria-label="Move ${esc(C.teamName(t, tid))} to group">
                    ${groups.map((g2, gj) => `<option value="${gj}" ${gj === gi ? "selected" : ""}>${esc(g2.name)}</option>`).join("")}
                  </select>` : ""}
                </li>`).join("")}</ul>
            </div>`).join("")}
        </div>
        ${unassigned(t).length ? `<p class="notice">Not in a group yet: ${unassigned(t).map((x) => esc(x.name)).join(", ")}. Rebuild the groups to include them.</p>` : ""}
        <div class="field-row">
          <label class="field"><span>Teams through per group</span>
            <input type="number" min="0" max="16" id="advance" value="${advance}">
          </label>
        </div>
        <p class="muted-sm">${groupMatches.length} group games. Moving a team between groups rebuilds that group's games.</p>
        <div class="btn-row">
          <button class="btn btn-ghost btn-sm" id="rebuild-groups">Rebuild groups</button>
          <button class="btn btn-ghost btn-sm danger" id="remove-groups">Remove group stage</button>
        </div>
      ` : `
        <p>Everyone in a group plays each other once. Standings are worked out automatically.</p>
        <div class="field-row">
          <label class="field"><span>Number of groups</span>
            <input type="number" min="1" max="${Math.max(1, Math.floor(teams.length / 2))}" id="group-count" value="${suggestedGroups}">
          </label>
          <label class="field"><span>Teams through per group</span>
            <input type="number" min="0" max="16" id="advance" value="2">
          </label>
          <label class="check"><input type="checkbox" id="shuffle"> Shuffle teams</label>
        </div>
        <p class="muted-sm">Use 1 group for a league where everyone plays everyone. Set "teams through" to 0 if there's no knockout after.</p>
        <button class="btn btn-accent" id="make-groups">Create groups &amp; games</button>
      `}
    </section>

    <section class="panel">
      <h2 class="panel-title"><span class="step-badge">2</span> Knockout bracket</h2>
      ${koMatches.length ? `
        <p>${C.knockoutRounds(t).rounds.map((r) => esc(r.name)).join(" → ")}${C.knockoutRounds(t).third ? " · plus a third-place game" : ""}.</p>
        <p class="muted-sm">${groups.length ? "Teams fill in automatically when each group finishes." : "Winners move through automatically when games are marked final."}</p>
        <button class="btn btn-ghost btn-sm danger" id="remove-ko">Remove bracket</button>
      ` : `
        <p>${groups.length
          ? `Build a bracket from the top ${advance} of each group (${groups.reduce((n, g) => n + Math.min(advance, g.teamIds.length), 0)} teams). Group winners are kept apart in the draw.`
          : `Build a bracket with all ${teams.length} teams, seeded in your team order. Byes are added if the numbers don't divide evenly.`}</p>
        <label class="check"><input type="checkbox" id="third"> Include a third-place game</label>
        ${!groups.length ? `<label class="check"><input type="checkbox" id="ko-shuffle"> Random draw instead of seeding</label>` : ""}
        <div><button class="btn btn-accent" id="make-ko" ${groups.length && !advance ? "disabled" : ""}>Create bracket</button></div>
      `}
    </section>`;

  const advInput = panel.querySelector("#advance");
  if (groups.length && advInput) {
    advInput.addEventListener("change", () => {
      const n = Math.max(0, Math.floor(Number(advInput.value) || 0));
      save({ groups: groups.map((g) => ({ ...g, advance: n })) }, "Updated");
    });
  }

  const makeGroups = (count, adv, shuffle) => {
    let ids = teams.map((x) => x.id);
    if (shuffle) ids = ids.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const newGroups = C.assignGroups(ids, count).map((teamIds, i) => ({
      id: C.uid("g"), name: count === 1 ? "League" : `Group ${C.groupLetter(i)}`, teamIds, advance: adv
    }));
    const keep = Object.fromEntries(Object.entries(t.matches || {}).filter(([, m]) => m.stage !== "group"));
    newGroups.forEach((g) => Object.assign(keep, C.groupMatches(g)));
    return { groups: newGroups, matches: keep };
  };

  const btnMake = panel.querySelector("#make-groups");
  if (btnMake) btnMake.addEventListener("click", () => {
    const count = Math.max(1, Math.min(Math.floor(Number(panel.querySelector("#group-count").value) || 1), Math.floor(teams.length / 2) || 1));
    const adv = Math.max(0, Math.floor(Number(panel.querySelector("#advance").value) || 0));
    save(makeGroups(count, adv, panel.querySelector("#shuffle").checked), "Groups and games created");
  });

  const btnRebuild = panel.querySelector("#rebuild-groups");
  if (btnRebuild) btnRebuild.addEventListener("click", () => {
    if (!confirm(hasResults(t, (m) => m.stage === "group")
      ? "Rebuild the groups? All group games and their scores will be replaced."
      : "Rebuild the groups with the current team list?")) return;
    save(makeGroups(groups.length, advance, false), "Groups rebuilt");
  });

  const btnRemoveGroups = panel.querySelector("#remove-groups");
  if (btnRemoveGroups) btnRemoveGroups.addEventListener("click", () => {
    const koFromGroups = koMatches.some((m) => [m.home, m.away].some((s) => s && s.t === "group"));
    if (!confirm(`Remove the group stage and all group games${koFromGroups ? " (and the bracket built from it)" : ""}?`)) return;
    const keep = Object.fromEntries(Object.entries(t.matches || {}).filter(([, m]) => m.stage !== "group" && !koFromGroups));
    save({ groups: [], matches: keep }, "Group stage removed");
  });

  panel.querySelectorAll(".move-team").forEach((sel) => sel.addEventListener("change", () => {
    const from = Number(sel.dataset.from);
    const to = Number(sel.value);
    const tid = sel.dataset.team;
    if (from === to) return;
    if (hasResults(t, (m) => m.stage === "group" && (m.group === groups[from].id || m.group === groups[to].id)) &&
        !confirm("Both groups' games will be rebuilt and their scores cleared. Continue?")) { sel.value = String(from); return; }
    const next = groups.map((g, i) => ({
      ...g,
      teamIds: i === from ? g.teamIds.filter((x) => x !== tid) : i === to ? g.teamIds.concat(tid) : g.teamIds
    }));
    const changed = new Set([next[from].id, next[to].id]);
    const keep = Object.fromEntries(Object.entries(t.matches || {}).filter(([, m]) => !(m.stage === "group" && changed.has(m.group))));
    Object.assign(keep, C.groupMatches(next[from]), C.groupMatches(next[to]));
    save({ groups: next, matches: keep }, "Team moved");
  }));

  const btnKo = panel.querySelector("#make-ko");
  if (btnKo) btnKo.addEventListener("click", () => {
    let seeds;
    if (groups.length) {
      seeds = C.seedsFromGroups(groups, advance);
    } else {
      let ids = teams.map((x) => x.id);
      if (panel.querySelector("#ko-shuffle") && panel.querySelector("#ko-shuffle").checked) {
        ids = ids.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      }
      seeds = ids.map((tid) => ({ t: "team", id: tid }));
    }
    if (seeds.length < 2) return toast("A bracket needs at least two teams.", "error");
    const ko = C.buildKnockout(seeds, { thirdPlace: panel.querySelector("#third").checked });
    const patch = {};
    Object.entries(ko).forEach(([mid, m]) => { patch[`matches.${mid}`] = m; });
    save(patch, "Bracket created");
  });

  const btnRemoveKo = panel.querySelector("#remove-ko");
  if (btnRemoveKo) btnRemoveKo.addEventListener("click", () => {
    if (!confirm(hasResults(t, (m) => m.stage === "ko") ? "Remove the bracket and all its scores?" : "Remove the bracket?")) return;
    const patch = {};
    koMatches.forEach((m) => { patch[`matches.${m.id}`] = DELETE; });
    save(patch, "Bracket removed");
  });
}

function unassigned(t) {
  const inGroup = new Set((t.groups || []).flatMap((g) => g.teamIds));
  return C.sortedTeams(t).filter((x) => !inGroup.has(x.id));
}

// --- Settings ------------------------------------------------------------------

function renderSetup(t, panel) {
  const s = Object.assign({}, C.DEFAULT_SETTINGS, t.settings);
  panel.innerHTML = `
    <form class="panel" id="setup-form">
      <h2 class="panel-title">Details</h2>
      <div class="field-row">
        <label class="field grow"><span>Name</span><input name="name" required maxlength="80" value="${esc(t.name)}"></label>
        <label class="field"><span>Date</span><input name="date" type="date" value="${esc(t.date || "")}"></label>
        <label class="field grow"><span>Location</span><input name="location" maxlength="80" value="${esc(t.location || "")}"></label>
      </div>
      <label class="check big"><input type="checkbox" name="published" ${t.published ? "checked" : ""}> Show on public site</label>

      <h2 class="panel-title">Points</h2>
      <p class="muted-sm">How many standings points a team gets for each result. For volleyball, enter the sets each team won as the score.</p>
      <div class="field-row">
        <label class="field"><span>Win</span><input name="win" type="number" min="0" max="10" value="${s.win}"></label>
        <label class="field"><span>Draw</span><input name="draw" type="number" min="0" max="10" value="${s.draw}"></label>
        <label class="field"><span>Loss</span><input name="loss" type="number" min="0" max="10" value="${s.loss}"></label>
      </div>
      <label class="check"><input type="checkbox" name="allowDraws" ${s.allowDraws ? "checked" : ""}> Allow draws in group games</label>
      <div><button class="btn btn-accent" type="submit">Save settings</button></div>
    </form>

    <div class="panel danger-zone">
      <h2 class="panel-title">Delete tournament</h2>
      <p class="muted-sm">Removes the tournament, its teams and every score. This can't be undone.</p>
      <button class="btn btn-ghost btn-sm danger" id="delete">Delete tournament</button>
    </div>`;

  panel.querySelector("#setup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const n = (k) => Math.max(0, Math.floor(Number(f.get(k)) || 0));
    save({
      name: String(f.get("name")).trim() || t.name,
      date: f.get("date") || "",
      location: String(f.get("location") || "").trim(),
      published: f.get("published") === "on",
      settings: { win: n("win"), draw: n("draw"), loss: n("loss"), allowDraws: f.get("allowDraws") === "on" }
    }, "Settings saved");
  });

  panel.querySelector("#delete").addEventListener("click", async () => {
    const typed = prompt(`Type the tournament name to delete it:\n${t.name}`);
    if (typed === null) return;
    if (typed.trim() !== t.name) return toast("Name didn't match — nothing was deleted.", "error");
    try {
      if (unwatch) unwatch();
      await store.deleteTournament(id);
      location.href = "./";
    } catch (err) {
      toast(friendlyError(err), "error");
    }
  });
}

// --- Boot ----------------------------------------------------------------------

store.onAuth((u) => {
  user = u;
  renderUser();
  if (unwatch) { unwatch(); unwatch = null; }
  if (!user) return renderSignIn();
  if (id) {
    unwatch = store.watchTournament(id, (t) => { current = t; scheduleRender(); });
  } else {
    unwatch = store.watchTournaments((list) => renderDashboard(list));
  }
});
