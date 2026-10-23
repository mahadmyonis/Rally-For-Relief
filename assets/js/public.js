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
// When following a team: their "games" timeline or their "players"
let teamView = "games";
// Horizontal position in the round columns; null until the first render
let roundsLeft = null;

function wireRounds() {
  const scroller = view.querySelector(".rounds-scroll");
  if (!scroller) { roundsLeft = null; return; }
  const cols = [...scroller.querySelectorAll(".rcol")];
  const chips = [...view.querySelectorAll(".rnav")];
  const colLeft = (i) => cols[i].offsetLeft - cols[0].offsetLeft;
  // First visit: jump to the round being played; after that, stay put
  scroller.scrollLeft = roundsLeft ?? colLeft(Number(scroller.dataset.current) || 0);
  const mark = () => {
    const x = scroller.scrollLeft + 24;
    let idx = 0;
    cols.forEach((c, i) => { if (colLeft(i) <= x) idx = i; });
    chips.forEach((ch, i) => ch.classList.toggle("is-active", i === idx));
    // Keep the active round's chip visible in the chip row
    const nav = view.querySelector(".rounds-nav");
    const chip = chips[idx];
    if (nav && chip) {
      const l = chip.offsetLeft - nav.offsetLeft, r = l + chip.offsetWidth;
      if (l < nav.scrollLeft) nav.scrollLeft = l - 8;
      else if (r > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = r - nav.clientWidth + 8;
    }
    roundsLeft = scroller.scrollLeft;
  };
  let raf = 0;
  scroller.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); }, { passive: true });
  chips.forEach((ch, i) => ch.addEventListener("click", () => {
    scroller.scrollTo({ left: colLeft(i), behavior: "smooth" });
  }));
  mark();
}

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

// Compact game tile used in the round columns
// One team's day, step by step: summary, then each game in order
function teamTimeline(t, teamId, mine) {
  const list = C.scheduleList(t).filter(mine);
  const name = C.teamName(t, teamId);
  const group = (t.groups || []).find((g) => g.teamIds.includes(teamId));
  const maybe = C.possibleKnockouts(t, teamId);

  // Result from this team's side
  const view1 = (m) => {
    const home = C.resolveSource(t, m.home) === teamId;
    return { us: home ? m.hs : m.as, them: home ? m.as : m.hs, opp: C.sourceLabel(t, home ? m.away : m.home) };
  };
  const played = list.filter((m) => m.status === "final");
  const won = played.filter((m) => { const v = view1(m); return v.us > v.them; }).length;
  const drawn = played.filter((m) => { const v = view1(m); return v.us === v.them; }).length;
  const lost = played.length - won - drawn;
  const next = list.find((m) => m.status !== "final");
  const nextIdx = next ? list.indexOf(next) : -1;
  let pos = "";
  if (group) {
    const rows = C.computeStandings(t, group);
    const i = rows.findIndex((r) => r.id === teamId);
    if (i >= 0 && played.some((m) => m.stage === "group")) pos = `${C.ordinal(i + 1)} in ${group.name}`;
    else pos = group.name;
  }
  const whenWhere = (m) => [m.time ? `🕒 ${esc(formatTime(m.time))}` : "", m.court ? `📍 ${esc(m.court)}` : ""].filter(Boolean).join("<span class=\"dot-sep\">·</span>");

  const summary = `
    <section class="team-sum">
      <p class="eyebrow">Following</p>
      <h3 class="team-sum-name">${esc(name)}</h3>
      <div class="team-sum-stats">
        ${pos ? `<span>${esc(pos)}</span>` : ""}
        <span>${list.length} game${list.length === 1 ? "" : "s"}${maybe.length ? " so far" : ""}</span>
        ${played.length ? `<span>Won ${won}${drawn ? ` · Drew ${drawn}` : ""} · Lost ${lost}</span>` : ""}
      </div>
      <div class="seg-toggle" role="tablist" aria-label="Show">
        <button type="button" role="tab" data-tview="games" aria-selected="${teamView === "games"}" class="${teamView === "games" ? "is-active" : ""}">Games</button>
        <button type="button" role="tab" data-tview="players" aria-selected="${teamView === "players"}" class="${teamView === "players" ? "is-active" : ""}">Players${(t.teams[teamId].players || []).length ? ` <span>${t.teams[teamId].players.length}</span>` : ""}</button>
      </div>
      ${next ? `
        <div class="team-sum-next ${next.status === "live" ? "is-live" : ""}">
          <p class="tsn-label">${next.status === "live" ? `<span class="live-dot" aria-hidden="true"></span> Playing now` : "Next game"}</p>
          <p class="tsn-main">Game ${nextIdx + 1} of ${list.length} · vs <strong>${esc(view1(next).opp)}</strong></p>
          ${whenWhere(next) ? `<p class="tsn-when">${whenWhere(next)}</p>` : ""}
        </div>` : list.length ? `<div class="team-sum-next"><p class="tsn-main">All games played ✓</p></div>` : ""}
    </section>`;

  const items = list.map((m, i) => {
    const v = view1(m);
    const state = m.status === "final" ? "done" : m.status === "live" ? "live" : m === next ? "next" : "later";
    let result = "";
    if (m.status === "final") {
      const word = v.us > v.them ? "Won" : v.us < v.them ? "Lost" : "Draw";
      result = `<span class="tl-result r-${word.toLowerCase()}">${word} ${v.us}–${v.them}</span>`;
    } else if (m.status === "live") {
      result = `<span class="tl-result r-live"><span class="live-dot" aria-hidden="true"></span>Live ${Number.isFinite(v.us) ? v.us : 0}–${Number.isFinite(v.them) ? v.them : 0}</span>`;
    } else if (state === "next") {
      result = `<span class="tl-result r-next">Up next</span>`;
    }
    return `
      <li class="tl-item state-${state}">
        <span class="tl-marker" aria-hidden="true">${state === "done" ? "✓" : state === "live" ? "" : i + 1}</span>
        <div class="tl-card">
          <div class="tl-top">
            <p class="tl-step">Game ${i + 1} <span>of ${list.length}</span></p>
            ${result}
          </div>
          <p class="tl-vs">vs <strong>${esc(v.opp)}</strong></p>
          <p class="tl-meta">${esc(gameLabel(t, m))}</p>
          ${whenWhere(m) ? `<p class="tl-when">${whenWhere(m)}</p>` : ""}
        </div>
      </li>`;
  }).join("");

  const adv = group ? group.advance || 0 : 0;
  const firstKo = maybe[0];
  const maybeItem = firstKo && adv ? `
      <li class="tl-item state-maybe">
        <span class="tl-marker" aria-hidden="true">?</span>
        <div class="tl-card">
          <p class="tl-step">Knockouts</p>
          <p class="tl-vs">If ${esc(name)} finish in the top ${adv} of ${esc(group.name)}</p>
          <p class="tl-meta">${esc(C.stageLabel(t, firstKo))}${firstKo.time ? ` from ${esc(formatTime(firstKo.time))}` : ""}</p>
        </div>
      </li>` : "";

  if (teamView === "players") return summary + rosterCard(t, teamId, { big: true });
  if (!list.length && !maybeItem) return summary + `<div class="empty"><h2>No games for ${esc(name)} yet</h2><p>Check back closer to the day.</p></div>`;
  return `${summary}<ol class="timeline">${items}${maybeItem}</ol>`;
}

// "Group A · Game 3", "Semi-final 1", "Final", "3rd place" — worked out once per update
const orderCache = new WeakMap();
function gameLabel(t, m) {
  if (!orderCache.has(t)) orderCache.set(t, C.groupOrder(t));
  if (m.stage === "group") {
    const g = (t.groups || []).find((x) => x.id === m.group);
    const o = orderCache.get(t)[m.id];
    return `${g ? g.name : "Group"}${o ? ` · Game ${o.n}` : ""}`;
  }
  if (m.third) return "3rd place";
  const name = C.roundName(m.rounds || m.round, m.round);
  if (name === "Final") return "Final";
  const count = C.matchList(t).filter((x) => x.stage === "ko" && !x.third && x.round === m.round && !C.isByeMatch(x)).length;
  const single = name.replace(/s$/, "").replace("Semi-finals", "Semi-final").replace("Quarter-finals", "Quarter-final");
  return count > 1 ? `${single} ${m.slot + 1}` : single;
}

// A team's roster: name, group, captain first with a C badge, then the players
function rosterCard(t, teamId, { big = false } = {}) {
  const tm = t.teams[teamId];
  if (!tm) return "";
  const group = (t.groups || []).find((g) => g.teamIds.includes(teamId));
  const players = tm.players || [];
  return `
    <article class="roster ${big ? "is-big" : ""}">
      <header class="roster-head">
        <h3>${esc(tm.name)}</h3>
        ${group ? `<span class="roster-group">${esc(group.name)}</span>` : ""}
      </header>
      ${players.length ? `
        <ul class="roster-list">
          ${players.map((n) => `<li class="${n === tm.captain ? "is-captain" : ""}"><span>${esc(n)}</span>${n === tm.captain ? `<span class="cap-badge" title="Team captain" aria-label="Captain">C</span>` : ""}</li>`).join("")}
        </ul>`
      : `<p class="roster-empty">Players coming soon.</p>`}
      ${big ? "" : `<footer class="roster-foot"><button type="button" class="link-btn" data-follow="${esc(teamId)}">Follow ${esc(tm.name)} →</button></footer>`}
    </article>`;
}

function teamsTab(t) {
  const groups = (t.groups || []).filter((g) => g.teamIds.length);
  const sections = groups.length
    ? groups.map((g) => ({ title: `${g.name}`, ids: g.teamIds }))
    : [{ title: "", ids: C.sortedTeams(t).map((x) => x.id) }];
  const anyCaptain = Object.values(t.teams || {}).some((x) => x.captain);
  return sections.map((sec) => `
    <section class="roster-section">
      ${sec.title ? `<h3 class="round-title">${esc(sec.title)} <span class="muted">rosters</span></h3>` : ""}
      <div class="roster-grid">${sec.ids.map((id) => rosterCard(t, id)).join("")}</div>
    </section>`).join("") +
    (anyCaptain ? `<p class="legend"><span class="cap-badge" aria-hidden="true">C</span> Team captain</p>` : "");
}

function gameTile(t, m) {
  const win = C.winnerSide(m);
  const meta = (m.stage === "group" ? [m.court] : [m.time ? formatTime(m.time) : "", m.court]).filter(Boolean).map(esc).join(" · ");
  const side = (s) => {
    const tid = C.resolveSource(t, m[s]);
    const v = m[s === "home" ? "hs" : "as"];
    const score = m.status !== "scheduled" && Number.isFinite(v) ? v : "";
    return `<div class="gt-team ${win === s ? "is-winner" : win ? "is-loser" : ""} ${tid ? "" : "is-tbd"} ${teamFilter && tid === teamFilter ? "is-mine" : ""}">
      <span class="gt-name">${esc(C.sourceLabel(t, m[s]))}</span><span class="gt-score">${score}</span></div>`;
  };
  return `
    <article class="gtile status-${m.status}">
      <header class="gt-head">
        <span class="gt-tag">${esc(gameLabel(t, m))}</span>
        <span class="gt-meta">${meta}</span>
        ${m.status === "live" ? `<span class="gt-live"><span class="live-dot" aria-hidden="true"></span>Live</span>` : m.status === "final" ? `<span class="gt-final">FT</span>` : ""}
      </header>
      ${side("home")}${side("away")}
    </article>`;
}

function matchesTab(t) {
  const mine = (m) => [C.resolveSource(t, m.home), C.resolveSource(t, m.away)].includes(teamFilter);
  // Following a team: a numbered timeline of their games, in play order
  if (teamFilter) return teamTimeline(t, teamFilter, mine);

  const cols = C.roundColumns(t);
  if (!cols.length) {
    return `<div class="empty"><h2>Schedule coming soon</h2><p>Check back closer to the day.</p></div>`;
  }
  const currentIdx = Math.max(0, cols.findIndex((c) => c.matches.some((m) => m.status !== "final")));
  return `
    <nav class="rounds-nav" aria-label="Rounds">
      ${cols.map((c, i) => {
        const done = c.matches.filter((m) => m.status === "final").length;
        const live = c.matches.some((m) => m.status === "live");
        return `<button type="button" class="rnav ${i === currentIdx ? "is-current" : ""}" data-col="${i}">
          ${live ? `<span class="live-dot" aria-hidden="true"></span>` : done === c.matches.length ? "✓ " : ""}${esc(c.title)}</button>`;
      }).join("")}
    </nav>
    <div class="rounds-scroll" data-current="${currentIdx}">
      <div class="rounds">
        ${cols.map((c, i) => {
          const times = c.matches.map((m) => m.time).filter(Boolean).sort();
          const span = times.length ? esc(formatTime(times[0])) + (times[times.length - 1] !== times[0] ? `–${esc(formatTime(times[times.length - 1]))}` : "") : "";
          return `
            <section class="rcol ${c.stage === "ko" ? "is-ko" : ""} ${i === currentIdx ? "is-current" : ""}" data-col="${i}">
              <header class="rcol-head">
                <h3>${esc(c.title)}</h3>
                ${span ? `<p>${span}</p>` : ""}
              </header>
              ${c.stage === "group" ? `<div class="rcol-slots">${c.slots.map((sl) => `
                <div class="rslot">
                  <p class="rslot-head"><b>Slot ${sl.n}</b>${sl.time ? ` · ${esc(formatTime(sl.time))}` : ""}</p>
                  <div class="rcol-games">${sl.matches.map((m) => gameTile(t, m)).join("")}</div>
                </div>`).join("")}</div>`
              : `<div class="rcol-games">${c.matches.map((m) => gameTile(t, m)).join("")}</div>`}
            </section>`;
        }).join("")}
      </div>
    </div>
    <p class="swipe-hint">Swipe across to see every round →</p>`;
}

// Who beat whom: rows and columns in standings order, scores from the row team's side
function resultsGrid(t, g, rows) {
  const games = C.matchList(t).filter((m) => m.stage === "group" && m.group === g.id);
  const cell = (a, b) => {
    if (a === b) return `<td class="mx-self" aria-hidden="true"></td>`;
    const m = games.find((x) => (x.home.id === a && x.away.id === b) || (x.home.id === b && x.away.id === a));
    if (!m || m.status === "scheduled" || !Number.isFinite(m.hs)) return `<td class="mx-empty">·</td>`;
    const mine = m.home.id === a ? m.hs : m.as;
    const theirs = m.home.id === a ? m.as : m.hs;
    const cls = m.status === "live" ? "mx-live" : mine > theirs ? "mx-w" : mine < theirs ? "mx-l" : "mx-d";
    return `<td class="${cls}">${mine}–${theirs}</td>`;
  };
  return `
    <div class="matrix-wrap">
      <p class="matrix-title">Results grid <span>— read across: each row's score first</span></p>
      <div class="table-wrap">
        <table class="matrix">
          <thead><tr><th class="team"></th>${rows.map((r, i) => `<th class="num" title="${esc(r.name)}">${i + 1}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr class="${teamFilter === r.id ? "is-focus" : ""}"><th class="team"><span class="mx-n">${i + 1}</span>${esc(r.name)}</th>${rows.map((c) => cell(r.id, c.id)).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
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
        ${rows.length > 2 ? resultsGrid(t, g, rows) : ""}
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
  if (Object.keys(t.teams || {}).length) tabs.push(["teams", "Teams"]);
  if (!tabs.some(([k]) => k === tab)) tab = "matches";

  const live = C.scheduleList(t).filter((m) => m.status === "live");
  const champId = C.champion(t);
  const teams = C.sortedTeams(t);
  if (teamFilter && !t.teams[teamFilter]) teamFilter = "";

  let body = "";
  if (tab === "matches") body = matchesTab(t);
  if (tab === "standings") body = standingsTab(t);
  if (tab === "bracket") body = bracketTab(t);
  if (tab === "teams") body = teamsTab(t);

  const prevScroll = view.querySelector(".rounds-scroll");
  roundsLeft = prevScroll ? prevScroll.scrollLeft : roundsLeft;

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

  wireRounds();

  const shareBtn = view.querySelector("[data-share]");
  if (shareBtn) shareBtn.addEventListener("click", () => openShare(current));

  view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    tab = b.dataset.tab;
    history.replaceState(null, "", `#${tab}`);
    renderTournament(current);
  }));
  view.querySelectorAll("[data-tview]").forEach((b) => b.addEventListener("click", () => {
    teamView = b.dataset.tview;
    renderTournament(current);
  }));
  view.querySelectorAll("[data-follow]").forEach((b) => b.addEventListener("click", () => {
    teamFilter = b.dataset.follow;
    teamView = "players";
    tab = "matches";
    history.replaceState(null, "", "#matches");
    try { localStorage.setItem(`r4r-follow-${id}`, teamFilter); } catch { /* ignore */ }
    renderTournament(current);
    const top = view.querySelector(".team-sum");
    if (top) scrollTo({ top: top.getBoundingClientRect().top + scrollY - 96, behavior: "smooth" });
  }));

  const sel = view.querySelector("#team-filter");
  if (sel) sel.addEventListener("change", () => {
    teamFilter = sel.value;
    teamView = "games";
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
