// Rally for Relief — public tournaments page (live scores, standings, bracket)

import { store } from "./store.js";
import * as C from "./tournament-core.js";
import { esc, formatDate, formatTime, statusChip, query, safeUrl, signupsOpen } from "./ui.js";
import { openShare, shareButton } from "./share.js";

const view = document.getElementById("view");
const id = query("t");
// Organisers can check a hidden tournament with ?preview=1 before publishing
const preview = query("preview") === "1";
let current = null;
let tab = (location.hash || "").slice(1);
let teamFilter = "";

function demoNote() {
  return store.mode === "demo"
    ? `<p class="demo-note">Demo mode — data is only saved in this browser until Firebase is connected.</p>`
    : "";
}

// --- Tournament list ---------------------------------------------------------

function renderList(list) {
  const rank = { live: 0, upcoming: 1, finished: 2 };
  const items = list
    .filter((t) => t.published)
    .sort((a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1) ||
      (a.status === "finished" ? (b.date || "").localeCompare(a.date || "") : (a.date || "").localeCompare(b.date || "")));

  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow"><span class="dot" aria-hidden="true"></span> Live scores &amp; standings</p>
      <h1 class="section-title">Tournaments</h1>
      <p class="section-lede">Follow every game, see who's top of the group and track the bracket — updated live on match day.</p>
    </div>
    ${demoNote()}
    ${items.length ? `<div class="t-grid">${items.map((t) => {
      const teams = Object.keys(t.teams || {}).length;
      return `
        <a class="t-card" href="?t=${encodeURIComponent(t.id)}">
          <div class="t-card-top">${statusChip(t.status)}${signupsOpen(t) ? `<span class="chip chip-signup">Sign-ups open</span>` : ""}</div>
          <h2>${esc(t.name)}</h2>
          <p class="t-meta">
            ${t.date ? `<span>📅 ${esc(formatDate(t.date))}</span>` : ""}
            ${t.location ? `<span>📍 ${esc(t.location)}</span>` : ""}
          </p>
          <p class="t-card-foot"><span>${teams} team${teams === 1 ? "" : "s"}</span><span aria-hidden="true">→</span></p>
        </a>`;
    }).join("")}</div>` : `
      <div class="empty">
        <h2>No tournaments yet</h2>
        <p>Our next tournament will show up here. Follow <a href="https://instagram.com/rally4relief" target="_blank" rel="noopener">@rally4relief</a> so you don't miss sign-ups.</p>
      </div>`}
  `;
}

// --- Single tournament -------------------------------------------------------

function scoreCell(m, side) {
  if (m.status === "scheduled" || !Number.isFinite(m[side === "home" ? "hs" : "as"])) return "";
  return `<span class="score">${m[side === "home" ? "hs" : "as"]}</span>`;
}

function matchCard(t, m) {
  const win = C.winnerSide(m);
  const homeId = C.resolveSource(t, m.home);
  const awayId = C.resolveSource(t, m.away);
  const meta = [
    m.stage === "group" ? esc(((t.groups || []).find((g) => g.id === m.group) || {}).name || "Group") : esc(C.stageLabel(t, m)),
    m.time ? esc(formatTime(m.time)) : "",
    m.court ? esc(m.court) : ""
  ].filter(Boolean).join(" · ");
  const status = m.status === "live"
    ? `<span class="chip chip-live"><span class="live-dot" aria-hidden="true"></span>Live</span>`
    : m.status === "final" ? `<span class="chip chip-final">Final</span>` : "";
  const row = (side, teamId) => `
    <div class="m-team ${win === side ? "is-winner" : ""} ${win && win !== side ? "is-loser" : ""} ${teamId ? "" : "is-tbd"}">
      <span class="m-name">${esc(C.sourceLabel(t, m[side]))}</span>${scoreCell(m, side)}
    </div>`;
  return `
    <article class="match ${m.status === "live" ? "is-live" : ""}" data-teams="${esc([homeId, awayId].filter(Boolean).join(" "))}">
      <header class="m-head"><span>${meta}</span>${status}</header>
      ${row("home", homeId)}
      ${row("away", awayId)}
    </article>`;
}

function matchesTab(t) {
  const list = C.scheduleList(t).filter((m) => {
    if (!teamFilter) return true;
    return [C.resolveSource(t, m.home), C.resolveSource(t, m.away)].includes(teamFilter);
  });
  if (!list.length) {
    return `<div class="empty"><h2>${teamFilter ? "No games for this team yet" : "Schedule coming soon"}</h2><p>Check back closer to the day.</p></div>`;
  }
  // Group into sections: group-stage rounds, then each knockout round
  const sections = [];
  const byKey = {};
  list.forEach((m) => {
    const key = m.stage === "group" ? `Round ${m.round}` : C.stageLabel(t, m);
    if (!byKey[key]) { byKey[key] = []; sections.push(key); }
    byKey[key].push(m);
  });
  const hasTimes = list.some((m) => m.time);
  if (hasTimes) {
    return `<div class="match-grid">${list.map((m) => matchCard(t, m)).join("")}</div>`;
  }
  return sections.map((key) => `
    <section class="round-block">
      <h3 class="round-title">${esc(key)}</h3>
      <div class="match-grid">${byKey[key].map((m) => matchCard(t, m)).join("")}</div>
    </section>`).join("");
}

function standingsTab(t) {
  const draws = (t.settings || {}).allowDraws !== false;
  const s = Object.assign({}, C.DEFAULT_SETTINGS, t.settings);
  const pts = (n) => `${n} pt${n === 1 ? "" : "s"}`;
  const rules = `<p class="rules-note">Win ${pts(s.win)}${draws ? ` · Draw ${pts(s.draw)}` : ""} · Loss ${pts(s.loss)}.
    Ties are split by score difference (+/−), then total scored, then the result between the tied teams.</p>`;
  return (t.groups || []).map((g) => {
    const rows = C.computeStandings(t, g);
    const adv = g.advance || 0;
    const hasKo = C.matchList(t).some((m) => m.stage === "ko");
    return `
      <section class="standings">
        <h3 class="round-title">${esc(g.name)}${C.groupComplete(t, g.id) ? ` <span class="chip chip-final">Complete</span>` : ""}</h3>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th class="num">#</th><th class="team">Team</th>
              <th class="num" title="Played">P</th><th class="num" title="Won">W</th>
              ${draws ? `<th class="num" title="Drawn">D</th>` : ""}
              <th class="num" title="Lost">L</th><th class="num hide-sm" title="Scored">+</th>
              <th class="num hide-sm" title="Conceded">−</th><th class="num" title="Difference">+/−</th>
              <th class="num pts" title="Points">Pts</th>
            </tr></thead>
            <tbody>${rows.map((r, i) => `
              <tr class="${hasKo && i < adv ? "advances" : ""} ${teamFilter === r.id ? "is-focus" : ""}">
                <td class="num">${i + 1}</td><td class="team">${esc(r.name)}</td>
                <td class="num">${r.p}</td><td class="num">${r.w}</td>
                ${draws ? `<td class="num">${r.d}</td>` : ""}
                <td class="num">${r.l}</td><td class="num hide-sm">${r.f}</td><td class="num hide-sm">${r.a}</td>
                <td class="num">${r.diff > 0 ? "+" : ""}${r.diff}</td><td class="num pts">${r.pts}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
        ${hasKo && adv ? `<p class="legend"><span class="legend-bar" aria-hidden="true"></span>Top ${adv} go through to the knockouts</p>` : ""}
      </section>`;
  }).join("") + rules;
}

function bracketMatch(t, m) {
  if (!m) return "";
  const win = C.winnerSide(m);
  const side = (s) => {
    const src = m[s];
    const bye = src && src.t === "bye";
    const tid = C.resolveSource(t, src);
    const score = !bye && m.status !== "scheduled" && Number.isFinite(m[s === "home" ? "hs" : "as"]) ? m[s === "home" ? "hs" : "as"] : "";
    return `<div class="b-team ${win === s ? "is-winner" : ""} ${bye || !tid ? "is-tbd" : ""}">
      <span>${esc(C.sourceLabel(t, src))}</span><span class="b-score">${score}</span></div>`;
  };
  return `<div class="b-match ${m.status === "live" ? "is-live" : ""}">
    ${m.time || m.court ? `<div class="b-meta">${esc([formatTime(m.time), m.court].filter(Boolean).join(" · "))}</div>` : ""}
    ${side("home")}${side("away")}</div>`;
}

function bracketTab(t) {
  const ko = C.knockoutRounds(t);
  return `
    <div class="bracket-scroll">
      <div class="bracket" style="--rounds:${ko.rounds.length}">
        ${ko.rounds.map((r) => `
          <div class="b-round">
            <h3 class="b-round-title">${esc(r.name)}</h3>
            <div class="b-round-matches">${r.matches.map((m) => bracketMatch(t, m)).join("")}</div>
          </div>`).join("")}
      </div>
    </div>
    ${ko.third ? `<div class="third-place"><h3 class="b-round-title">Third place</h3>${bracketMatch(t, ko.third)}</div>` : ""}`;
}

function renderTournament(t) {
  if (!t || (!t.published && !preview)) {
    view.innerHTML = `<div class="empty"><h1>Tournament not found</h1><p>It may have been removed or isn't public yet.</p><p><a class="btn btn-ghost" href="./">See all tournaments</a></p></div>`;
    return;
  }
  document.title = `${t.name} — Rally for Relief`;

  const hasGroups = (t.groups || []).length > 0;
  const hasKo = C.matchList(t).some((m) => m.stage === "ko");
  const tabs = [["matches", "Games"]];
  if (hasGroups) tabs.push(["standings", "Standings"]);
  if (hasKo) tabs.push(["bracket", "Bracket"]);
  if (!tabs.some(([k]) => k === tab)) tab = "matches";

  const live = C.scheduleList(t).filter((m) => m.status === "live");
  const champId = C.champion(t);
  const teams = C.sortedTeams(t);
  if (teamFilter && !t.teams[teamFilter]) teamFilter = "";

  let body = "";
  if (tab === "matches") body = matchesTab(t);
  if (tab === "standings") body = standingsTab(t);
  if (tab === "bracket") body = bracketTab(t);

  view.innerHTML = `
    <a class="back-link" href="./">← All tournaments</a>
    ${demoNote()}
    ${!t.published ? `<p class="notice">👀 Preview — this tournament is hidden, so it isn't listed on the site yet. Turn on <strong>Show on public site</strong> in the organiser app to publish it.</p>` : ""}
    <header class="t-hero">
      <div class="t-hero-top">${statusChip(t.status)}${t.published ? shareButton() : ""}</div>
      <h1 class="section-title">${esc(t.name)}</h1>
      <p class="t-meta">
        ${t.date ? `<span>📅 ${esc(formatDate(t.date))}</span>` : ""}
        ${t.location ? `<span>📍 ${esc(t.location)}</span>` : ""}
        ${teams.length ? `<span>👥 ${teams.length} team${teams.length === 1 ? "" : "s"}</span>` : ""}
      </p>
    </header>

    ${signupsOpen(t) ? `
      <div class="signup-cta">
        <div>
          <p class="signup-title">Sign-ups are open</p>
          <p class="signup-sub">Limited spots — get your team in early.</p>
        </div>
        <a class="btn btn-accent" href="${esc(safeUrl(t.signupUrl))}" target="_blank" rel="noopener">Sign up your team <span aria-hidden="true">↗</span></a>
      </div>` : ""}

    ${champId ? `<div class="champion"><span class="champion-icon" aria-hidden="true">🏆</span><div><p class="eyebrow eyebrow-dark">Champions</p><p class="champion-name">${esc(C.teamName(t, champId))}</p></div></div>` : ""}

    ${live.length ? `
      <section class="live-now" aria-label="Live now">
        <h2 class="round-title"><span class="live-dot" aria-hidden="true"></span> Live now</h2>
        <div class="match-grid">${live.map((m) => matchCard(t, m)).join("")}</div>
      </section>` : ""}

    <div class="tabs-bar">
      <div class="tabs" role="tablist">
        ${tabs.map(([k, label]) => `<button role="tab" class="tab ${k === tab ? "is-active" : ""}" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join("")}
      </div>
      ${teams.length ? `
        <label class="team-filter">
          <span class="sr-only">Follow a team</span>
          <select id="team-filter">
            <option value="">All teams</option>
            ${teams.map((tm) => `<option value="${esc(tm.id)}" ${tm.id === teamFilter ? "selected" : ""}>${esc(tm.name)}</option>`).join("")}
          </select>
        </label>` : ""}
    </div>

    <div class="tab-panel" role="tabpanel">${body}</div>
    <p class="updated">Updates automatically — no need to refresh.</p>
  `;

  const shareBtn = view.querySelector("[data-share]");
  if (shareBtn) shareBtn.addEventListener("click", () => openShare(current));

  view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    tab = b.dataset.tab;
    history.replaceState(null, "", `#${tab}`);
    renderTournament(current);
  }));
  const sel = view.querySelector("#team-filter");
  if (sel) sel.addEventListener("change", () => {
    teamFilter = sel.value;
    try { localStorage.setItem(`r4r-follow-${id}`, teamFilter); } catch { /* ignore */ }
    renderTournament(current);
  });
}

if (id) {
  try { teamFilter = localStorage.getItem(`r4r-follow-${id}`) || ""; } catch { /* ignore */ }
  store.watchTournament(id, (t) => { current = t; renderTournament(t); });
} else {
  store.watchTournaments((list) => renderList(list));
}
