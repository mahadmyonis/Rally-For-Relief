// Rally for Relief — organiser app
// Sign in, create tournaments, manage teams and format, and enter live scores.

import { store, DELETE } from "./store.js";
import * as C from "./tournament-core.js";
import { esc, formatDate, formatTime, statusChip, query, safeUrl, money } from "./ui.js";
import { openShare, shareButton } from "./share.js";

const view = document.getElementById("view");
const userBox = document.getElementById("admin-user");
const toastEl = document.getElementById("toast");
const id = query("t");

let user = null;
let current = null;
let tab = sessionStorageGet("r4r-admin-tab") || "";
let scoreFilter = "open";
// Games just marked final stay put on the "To play" list (so the next card
// doesn't slide under a finger) until the filter or tab changes.
const stickyIds = new Set();
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

    <section class="panel" id="donate-panel">
      <h2 class="panel-title">Donations</h2>
      <p class="muted-sm">Loading…</p>
    </section>

    ${sorted.length ? `<h2 class="panel-title list-title">Tournaments</h2>` : ""}
    ${sorted.length ? `<div class="t-grid">${sorted.map((t) => `
      <a class="t-card" href="?t=${encodeURIComponent(t.id)}">
        <div class="t-card-top">${statusChip(t.status)}${t.published ? "" : `<span class="chip chip-draft">Hidden</span>`}</div>
        <h2>${esc(t.name)}</h2>
        <p class="t-meta">${t.date ? `<span>📅 ${esc(formatDate(t.date))}</span>` : ""}${t.location ? `<span>📍 ${esc(t.location)}</span>` : ""}</p>
        <p class="t-card-foot"><span>${Object.keys(t.teams || {}).length} teams</span><span>Manage →</span></p>
      </a>`).join("")}</div>` : `<p class="muted-sm">No tournaments yet — create your first one above.</p>`}
  `;

  renderDonations(view.querySelector("#donate-panel"));

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

// --- Donations (site-wide) --------------------------------------------------------

let siteSettings = null;
let watchingSite = false;

function renderDonations(panel) {
  if (!panel) return;
  if (!watchingSite) {
    watchingSite = true;
    store.watchSite((site) => {
      siteSettings = site || {};
      const live = document.getElementById("donate-panel");
      const a = document.activeElement;
      if (live && !(a && live.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName))) renderDonations(live);
    });
  }
  if (!siteSettings) return; // still loading — the watcher renders it
  const d = (siteSettings && siteSettings.donate) || {};
  const pct = d.goal > 0 ? Math.min(100, Math.floor(((d.raised || 0) / d.goal) * 100)) : 0;
  panel.innerHTML = `
    <h2 class="panel-title">Donations</h2>
    <p class="muted-sm">Shows a donation campaign with a progress bar on the home page, plus "Donate" buttons in the menu and footer.</p>
    <form id="donate-form" class="donate-form">
      <div class="field-row">
        <label class="field grow"><span>Campaign name</span><input name="title" maxlength="80" placeholder="e.g. Winter Relief for the Unhoused" value="${esc(d.title || "")}"></label>
        <label class="field grow"><span>Donation link</span><input name="url" type="text" inputmode="url" autocapitalize="off" spellcheck="false" maxlength="500" placeholder="https://www.launchgood.com/…" value="${esc(d.url || "")}"></label>
      </div>
      <label class="field"><span>Short description</span><textarea name="blurb" rows="2" maxlength="240" placeholder="One or two lines on what the money does.">${esc(d.blurb || "")}</textarea></label>
      <div class="field-row">
        <label class="field"><span>Raised so far ($)</span><input name="raised" type="number" min="0" step="1" inputmode="numeric" value="${Number(d.raised) || 0}"></label>
        <label class="field"><span>Goal ($)</span><input name="goal" type="number" min="0" step="1" inputmode="numeric" value="${Number(d.goal) || 0}"></label>
      </div>
      ${d.goal > 0 ? `<p class="muted-sm">Currently showing ${esc(money(d.raised))} of ${esc(money(d.goal))} (${pct}%). Set the goal to 0 to hide the progress bar.</p>` : ""}
      <label class="check big"><input type="checkbox" name="show" ${d.show ? "checked" : ""}> Show on the website</label>
      <div><button class="btn btn-accent" type="submit">Save donations</button></div>
    </form>`;

  panel.querySelector("#donate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const url = safeUrl(f.get("url"));
    if (String(f.get("url") || "").trim() && !url) return toast("That donation link doesn't look right — it should start with https://", "error");
    if (f.get("show") === "on" && !url) return toast("Add the donation link before showing it on the website.", "error");
    const n = (k) => Math.max(0, Math.round(Number(f.get(k)) || 0));
    try {
      await store.updateSite({
        donate: {
          title: String(f.get("title") || "").trim(),
          url,
          blurb: String(f.get("blurb") || "").trim(),
          raised: n("raised"),
          goal: n("goal"),
          show: f.get("show") === "on"
        }
      });
      toast("Donations saved");
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
          ${shareButton()}
          <a class="btn btn-ghost btn-sm" href="../tournaments/?t=${encodeURIComponent(id)}${t.published ? "" : "&preview=1"}" target="_blank" rel="noopener">${t.published ? "View public page" : "Preview public page"} ↗</a>
        </div>
      </div>
      ${t.published ? "" : `<p class="notice">This tournament is hidden from the public site. Turn on <strong>Show on public site</strong> in Settings when you're ready. Use <strong>Preview public page</strong> to check it first.</p>`}
      ${C.champion(t) ? `<div class="admin-champion">🏆 Champions: <strong>${esc(C.teamName(t, C.champion(t)))}</strong></div>` : ""}
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
    stickyIds.clear();
    render();
  }));
  view.querySelector("[data-share]").addEventListener("click", () => {
    if (!t.published) return toast("Turn on Show on public site in Settings first, so the link works for everyone.", "error");
    openShare({ id, ...t });
  });
  view.querySelector("#quick-status").addEventListener("change", (e) => save({ status: e.target.value }, "Status updated"));

  const panel = view.querySelector("#panel");
  if (tab === "scores") renderScores(t, panel);
  if (tab === "teams") renderTeams(t, panel);
  if (tab === "format") renderFormat(t, panel);
  if (tab === "setup") renderSetup(t, panel);
}

// --- Scores --------------------------------------------------------------------
// A compact match list grouped by round; tapping a game opens a scoreboard sheet.

let courtFilter = sessionStorageGet("r4r-admin-court") || "";
let sheetId = null;

function courtsOf(t) {
  return [...new Set(C.scheduleList(t).map((m) => m.court).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function groupName(t, m) {
  const g = (t.groups || []).find((x) => x.id === m.group);
  return g ? g.name : "";
}

function renderScores(t, panel) {
  const all = C.scheduleList(t);
  if (!all.length) {
    panel.innerHTML = `<div class="empty"><h2>No games yet</h2><p>Add teams, then set up groups or a bracket in <strong>Format</strong>.</p></div>`;
    return;
  }
  const courts = courtsOf(t);
  if (courtFilter && !courts.includes(courtFilter)) courtFilter = "";
  const onCourt = (m) => !courtFilter || m.court === courtFilter;
  const scoped = all.filter(onCourt);
  const counts = {
    open: scoped.filter((m) => m.status !== "final").length,
    live: scoped.filter((m) => m.status === "live").length,
    done: scoped.filter((m) => m.status === "final").length,
    all: scoped.length
  };
  const show = (m) => onCourt(m) && (scoreFilter === "all" || stickyIds.has(m.id) ||
    (scoreFilter === "live" ? m.status === "live" : scoreFilter === "done" ? m.status === "final" : m.status !== "final"));
  const doneAll = all.filter((m) => m.status === "final").length;
  const cols = C.roundColumns(t).map((c) => ({ ...c, shown: c.matches.filter(show) })).filter((c) => c.shown.length);

  const row = (m) => {
    const win = C.winnerSide(m);
    const hId = C.resolveSource(t, m.home), aId = C.resolveSource(t, m.away);
    const sc = (v) => (m.status === "scheduled" || !Number.isFinite(v) ? "" : v);
    const sub = [m.court, m.stage === "group" ? groupName(t, m) : (m.third ? "3rd place" : "")].filter(Boolean).join(" · ");
    return `
      <button type="button" class="mrow status-${m.status}" data-open="${esc(m.id)}">
        <span class="mrow-when"><b>${m.time ? esc(formatTime(m.time)) : "—"}</b><small>${esc(sub)}</small></span>
        <span class="mrow-teams">
          <span class="mrow-team ${win === "home" ? "is-winner" : win ? "is-loser" : ""} ${hId ? "" : "is-tbd"}"><span class="nm">${esc(C.sourceLabel(t, m.home))}</span><span class="sc">${sc(m.hs)}</span></span>
          <span class="mrow-team ${win === "away" ? "is-winner" : win ? "is-loser" : ""} ${aId ? "" : "is-tbd"}"><span class="nm">${esc(C.sourceLabel(t, m.away))}</span><span class="sc">${sc(m.as)}</span></span>
        </span>
        <span class="mrow-state" aria-hidden="true">${m.status === "live" ? `<span class="live-dot"></span>` : m.status === "final" ? "✓" : "›"}</span>
      </button>`;
  };

  panel.innerHTML = `
    <div class="score-top">
      <div class="progress-wrap">
        <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${all.length}" aria-valuenow="${doneAll}" aria-label="Games finished"><span style="width:${(doneAll / all.length) * 100}%"></span></div>
        <p class="progress-text"><b>${doneAll}</b> of ${all.length} games done${counts.live ? ` · <span class="gold">${counts.live} live</span>` : ""}</p>
      </div>
      <div class="score-filters">
        <div class="filter-row" role="group" aria-label="Show games">
          ${[["open", "To play"], ["live", "Live"], ["done", "Done"], ["all", "All"]].map(([k, label]) =>
            `<button class="pill-btn ${scoreFilter === k ? "is-active" : ""}" data-filter="${k}">${label} <span>${counts[k]}</span></button>`).join("")}
        </div>
        ${courts.length > 1 ? `
          <label class="court-pick"><span class="sr-only">Court</span>
            <select id="court-filter">
              <option value="">All courts</option>
              ${courts.map((c) => `<option value="${esc(c)}" ${c === courtFilter ? "selected" : ""}>${esc(c)}</option>`).join("")}
            </select>
          </label>` : ""}
      </div>
    </div>
    ${cols.length ? cols.map((c) => `
      <section class="mlist-round">
        <h3 class="mlist-title">${esc(c.title)} <span>${c.matches.filter((m) => m.status === "final").length}/${c.matches.length}</span></h3>
        <div class="mlist">${c.shown.map(row).join("")}</div>
      </section>`).join("")
    : `<p class="muted-sm">Nothing here — ${scoreFilter === "live" ? "no games are live right now" : scoreFilter === "done" ? "no games are finished yet" : "every game is finished 🎉"}.</p>`}
    <p class="muted-sm">Tap a game to score it. Add times and courts inside each game.</p>
  `;

  panel.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    scoreFilter = b.dataset.filter;
    stickyIds.clear();
    render();
  }));
  const cf = panel.querySelector("#court-filter");
  if (cf) cf.addEventListener("change", () => {
    courtFilter = cf.value;
    sessionStorageSet("r4r-admin-court", courtFilter);
    stickyIds.clear();
    render();
  });
  panel.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openSheet(b.dataset.open)));

  if (sheetId) renderSheet();
}

// --- Scoreboard sheet ------------------------------------------------------------

const sheetEl = document.createElement("div");
sheetEl.className = "ssheet-backdrop";
sheetEl.hidden = true;
document.body.appendChild(sheetEl);
sheetEl.addEventListener("click", (e) => { if (e.target === sheetEl) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetId) closeSheet(); });

function openSheet(mid) {
  sheetId = mid;
  renderSheet();
  sheetEl.hidden = false;
  document.body.classList.add("no-scroll");
}

function closeSheet() {
  sheetId = null;
  sheetEl.hidden = true;
  sheetEl.innerHTML = "";
  document.body.classList.remove("no-scroll");
}

function startGame(t, mid) {
  const m = t.matches[mid];
  const patch = { [`matches.${mid}.status`]: "live" };
  if (!Number.isFinite(m.hs)) patch[`matches.${mid}.hs`] = 0;
  if (!Number.isFinite(m.as)) patch[`matches.${mid}.as`] = 0;
  if (t.status === "upcoming") patch.status = "live";
  return save(patch, "Game is live");
}

function finishGame(t, mid) {
  const m = t.matches[mid];
  const problem = C.resultProblem(t, m, m.hs, m.as);
  if (problem) { toast(problem, "error"); return; }
  if (scoreFilter !== "all") stickyIds.add(mid);
  return save({ [`matches.${mid}.status`]: "final" }, "Final score saved");
}

function setResult(t, mid, hs, as) {
  const m = t.matches[mid];
  const patch = { [`matches.${mid}.hs`]: hs, [`matches.${mid}.as`]: as };
  if (m.status === "scheduled") {
    patch[`matches.${mid}.status`] = "live";
    if (t.status === "upcoming") patch.status = "live";
  }
  Object.assign(m, { hs, as, status: m.status === "scheduled" ? "live" : m.status });
  return save(patch, "");
}

function resetGame(t, mid) {
  if (!confirm("Reset this game to Not started? The score will be cleared.")) return;
  save({ [`matches.${mid}.status`]: "scheduled", [`matches.${mid}.hs`]: null, [`matches.${mid}.as`]: null }, "Game reset");
}

function editResult(t, mid) {
  const started = C.dependentMatches(t, mid).filter((x) => t.matches[x] && t.matches[x].status !== "scheduled");
  const names = started.map((x) => `${C.stageLabel(t, { id: x, ...t.matches[x] })}: ${C.sourceLabel(t, t.matches[x].home)} vs ${C.sourceLabel(t, t.matches[x].away)}`);
  const msg = started.length
    ? `Change this result?\n\nThese later games depend on it and have already started:\n• ${names.join("\n• ")}\n\nThey'll be reset to "Not started" and their scores cleared, because the teams in them could change.`
    : "Change this result? The game will reopen as Live so you can fix the score, then save it as final again.";
  if (!confirm(msg)) return;
  const patch = { [`matches.${mid}.status`]: "live" };
  started.forEach((x) => {
    patch[`matches.${x}.status`] = "scheduled";
    patch[`matches.${x}.hs`] = null;
    patch[`matches.${x}.as`] = null;
  });
  save(patch, started.length ? `Game reopened — ${started.length} later game${started.length === 1 ? "" : "s"} reset` : "Game reopened");
}

function renderSheet() {
  const t = current;
  if (!sheetId || !t || !t.matches || !t.matches[sheetId]) { if (sheetId) closeSheet(); return; }
  const a = document.activeElement;
  if (a && sheetEl.contains(a) && /^(INPUT|SELECT)$/.test(a.tagName)) return; // don't redraw mid-typing
  const mid = sheetId;
  const m = { id: mid, ...t.matches[mid] };
  const hId = C.resolveSource(t, m.home), aId = C.resolveSource(t, m.away);
  const ready = hId && aId;
  const st = m.status;
  const win = C.winnerSide(m);
  const quick = st !== "final" && ready ? C.quickResults(t) : [];
  const next = st === "final" ? C.nextGame(t, mid, m.court) : null;
  const val = (v) => (Number.isFinite(v) ? v : 0);

  const teamRow = (side, scoreKey, teamId) => `
    <div class="board-row ${win === side ? "is-winner" : win ? "is-loser" : ""}">
      <p class="board-name ${teamId ? "" : "is-tbd"}">${win === side ? "🏆 " : ""}${esc(C.sourceLabel(t, m[side]))}</p>
      <div class="board-score">
        ${st === "final" || !ready ? "" : `<button type="button" class="board-btn" data-step="-1" data-side="${scoreKey}" aria-label="Minus one" ${val(m[scoreKey]) === 0 ? "disabled" : ""}>−</button>`}
        <span class="board-num">${st === "scheduled" ? "–" : val(m[scoreKey])}</span>
        ${st === "final" || !ready ? "" : `<button type="button" class="board-btn plus" data-step="1" data-side="${scoreKey}" aria-label="Plus one">+</button>`}
      </div>
    </div>`;

  const stateChip = st === "live" ? `<span class="chip chip-live"><span class="live-dot" aria-hidden="true"></span>Live</span>`
    : st === "final" ? `<span class="chip chip-final">Final</span>` : `<span class="chip">Not started</span>`;

  let actions;
  if (!ready) {
    actions = `<p class="muted-sm">Teams are decided once earlier games finish.</p>`;
  } else if (st === "scheduled") {
    actions = `<button type="button" class="btn btn-accent btn-lg" data-act="start">Start game</button>`;
  } else if (st === "live") {
    actions = `<button type="button" class="btn btn-accent btn-lg" data-act="final">✓ Save final score</button>
      <button type="button" class="btn btn-ghost btn-sm danger" data-act="reset">Reset game</button>`;
  } else {
    actions = `${next ? `<button type="button" class="btn btn-accent btn-lg" data-next="${esc(next.id)}">Next game${next.court && next.court === m.court ? ` on ${esc(next.court)}` : ""} →</button>
        <p class="next-preview">${esc(C.sourceLabel(t, next.home))} vs ${esc(C.sourceLabel(t, next.away))}${next.time ? ` · ${esc(formatTime(next.time))}` : ""}</p>`
      : `<p class="next-preview">No more games to play${m.court ? ` on ${esc(m.court)}` : ""} 🎉</p>`}
      <button type="button" class="btn btn-ghost btn-sm" data-act="edit">Edit result</button>`;
  }

  sheetEl.innerHTML = `
    <div class="ssheet status-${st}" role="dialog" aria-modal="true" aria-label="Score this game">
      <header class="ssheet-head">
        <div>
          <p class="ssheet-stage">${esc(C.stageLabel(t, m))}</p>
          <p class="ssheet-when">${[m.time ? formatTime(m.time) : "", m.court].filter(Boolean).map(esc).join(" · ") || "No time or court yet"}</p>
        </div>
        <div class="ssheet-head-right">${stateChip}<button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>
      </header>

      <div class="board">${teamRow("home", "hs", hId)}${teamRow("away", "as", aId)}</div>

      ${quick.length ? `
        <div class="quick">
          <p class="quick-label">Quick result</p>
          <div class="quick-btns">${quick.map(([h, a2]) => `<button type="button" class="quick-btn ${m.hs === h && m.as === a2 ? "is-active" : ""}" data-quick="${h}-${a2}">${h}–${a2}</button>`).join("")}</div>
        </div>` : ""}

      <div class="ssheet-actions">${actions}</div>

      <details class="ssheet-details">
        <summary>Time &amp; court</summary>
        <div class="field-row">
          <label class="field"><span>Start time</span><input type="time" data-field="time" value="${esc(m.time || "")}"></label>
          <label class="field"><span>Court</span><input type="text" data-field="court" value="${esc(m.court || "")}" placeholder="e.g. Court 1" maxlength="20"></label>
        </div>
      </details>
    </div>`;

  sheetEl.querySelector("[data-close]").addEventListener("click", closeSheet);
  sheetEl.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    const side = b.dataset.side;
    const delta = Number(b.dataset.step);
    if (delta < 0 && val(t.matches[mid][side]) === 0) return;
    store.adjustScore(id, mid, side, delta, t).catch((err) => toast(friendlyError(err), "error"));
  }));
  sheetEl.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => {
    const [h, a2] = b.dataset.quick.split("-").map(Number);
    setResult(t, mid, h, a2);
  }));
  sheetEl.querySelectorAll("[data-field]").forEach((inp) => inp.addEventListener("change", () => {
    save({ [`matches.${mid}.${inp.dataset.field}`]: inp.value.trim() }, "Saved");
  }));
  const act = (name, fn) => { const el = sheetEl.querySelector(`[data-act="${name}"]`); if (el) el.addEventListener("click", fn); };
  act("start", () => startGame(t, mid));
  act("final", () => finishGame(t, mid));
  act("reset", () => resetGame(t, mid));
  act("edit", () => editResult(t, mid));
  const nb = sheetEl.querySelector("[data-next]");
  if (nb) nb.addEventListener("click", () => openSheet(nb.dataset.next));
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

      <h2 class="panel-title">Team sign-ups</h2>
      <p class="muted-sm">Paste the link to your sign-up form (e.g. a Google Form). While sign-ups are open, a "Sign up your team" button shows on the home page and the tournament page.</p>
      <div class="field-row">
        <label class="field grow"><span>Sign-up form link</span><input name="signupUrl" type="text" inputmode="url" autocapitalize="off" spellcheck="false" maxlength="500" placeholder="https://forms.gle/…" value="${esc(t.signupUrl || "")}"></label>
      </div>
      <label class="check"><input type="checkbox" name="signupsOpen" ${t.signupsOpen ? "checked" : ""}> Sign-ups are open</label>

      <h2 class="panel-title">Points</h2>
      <p class="muted-sm">How many standings points a team gets for each result. For volleyball, enter the sets each team won as the score.</p>
      <div class="field-row">
        <label class="field"><span>Win</span><input name="win" type="number" min="0" max="10" value="${s.win}"></label>
        <label class="field"><span>Draw</span><input name="draw" type="number" min="0" max="10" value="${s.draw}"></label>
        <label class="field"><span>Loss</span><input name="loss" type="number" min="0" max="10" value="${s.loss}"></label>
      </div>
      <label class="check"><input type="checkbox" name="allowDraws" ${s.allowDraws ? "checked" : ""}> Allow draws in group games</label>

      <h2 class="panel-title">Scoring</h2>
      <p class="muted-sm">With sets, scorers get one-tap results (like 2–1) and the app checks every score is a real result.</p>
      <div class="field-row">
        <label class="field grow"><span>How games are scored</span>
          <select name="bestOf">
            ${[[0, "Points or goals (any score)"], [1, "Sets — one set"], [3, "Sets — best of 3"], [5, "Sets — best of 5"]].map(([v, label]) =>
              `<option value="${v}" ${(Number(s.bestOf) || 0) === v ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
      </div>
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
    if (String(f.get("signupUrl") || "").trim() && !safeUrl(f.get("signupUrl"))) {
      toast("That sign-up link doesn't look right — it should start with https://", "error");
      return;
    }
    if (f.get("signupsOpen") === "on" && !safeUrl(f.get("signupUrl"))) {
      toast("Add the sign-up form link before opening sign-ups.", "error");
      return;
    }
    const n = (k) => Math.max(0, Math.floor(Number(f.get(k)) || 0));
    save({
      name: String(f.get("name")).trim() || t.name,
      date: f.get("date") || "",
      location: String(f.get("location") || "").trim(),
      published: f.get("published") === "on",
      signupUrl: safeUrl(f.get("signupUrl")),
      signupsOpen: f.get("signupsOpen") === "on",
      settings: {
        win: n("win"), draw: n("draw"), loss: n("loss"),
        // Set games can't end level, so draws only make sense for free scoring
        allowDraws: f.get("allowDraws") === "on" && !n("bestOf"),
        bestOf: n("bestOf")
      }
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
    unwatch = store.watchTournament(id, (t) => { current = t; scheduleRender(); if (tab !== "scores" && sheetId) renderSheet(); });
  } else {
    unwatch = store.watchTournaments((list) => renderDashboard(list));
  }
});
