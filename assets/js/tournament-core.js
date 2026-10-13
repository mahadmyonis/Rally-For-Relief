// Rally for Relief — tournament logic
// Pure functions shared by the public page and the admin app: fixture
// generation, standings, bracket building and resolving who plays whom.
//
// Data model (one document per tournament):
//   name, date, location, status ("upcoming" | "live" | "finished"), published
//   settings: { win, draw, loss, allowDraws }
//   teams:    { [teamId]: { name, order } }
//   groups:   [{ id, name, teamIds: [], advance }]
//   matches:  { [matchId]: Match }
//
// Match: { stage: "group" | "ko", group, round, slot, home, away,
//          hs, as, status: "scheduled" | "live" | "final", time, court }
// home/away are "sources" so knockout slots can fill in automatically:
//   { t: "team", id } | { t: "group", g, pos } | { t: "winner", m }
//   { t: "loser", m } | { t: "bye" } | null (to be decided)

export const DEFAULT_SETTINGS = { win: 3, draw: 1, loss: 0, allowDraws: true };

export function uid(prefix = "") {
  const rand = Math.random().toString(36).slice(2, 8);
  return prefix + Date.now().toString(36).slice(-4) + rand;
}

export function groupLetter(i) {
  return String.fromCharCode(65 + i);
}

export function sortedTeams(t) {
  return Object.entries(t.teams || {})
    .map(([id, team]) => ({ id, ...team }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export function teamName(t, id) {
  return (t.teams && t.teams[id] && t.teams[id].name) || "TBD";
}

export function matchList(t) {
  return Object.entries(t.matches || {}).map(([id, m]) => ({ id, ...m }));
}

// --- Round robin -----------------------------------------------------------

// Circle method: every team plays every other team once.
export function roundRobin(teamIds) {
  const ids = teamIds.slice();
  if (ids.length < 2) return [];
  if (ids.length % 2) ids.push(null);
  const n = ids.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}

// Spread teams across groups like a snake draft so groups stay even.
export function assignGroups(teamIds, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  teamIds.forEach((id, i) => {
    const lap = Math.floor(i / groupCount);
    const pos = i % groupCount;
    groups[lap % 2 ? groupCount - 1 - pos : pos].push(id);
  });
  return groups;
}

export function groupMatches(group) {
  const out = {};
  roundRobin(group.teamIds).forEach((pairs, r) => {
    pairs.forEach(([home, away]) => {
      out[uid("m")] = {
        stage: "group", group: group.id, round: r + 1, slot: 0,
        home: { t: "team", id: home }, away: { t: "team", id: away },
        hs: null, as: null, status: "scheduled", time: "", court: ""
      };
    });
  });
  return out;
}

// --- Results & standings ---------------------------------------------------

export function isPlayed(m) {
  return m.status === "final" && Number.isFinite(m.hs) && Number.isFinite(m.as);
}

// Tally results for the given teams, counting only games between two of them
function tally(t, teamIds, games) {
  const s = Object.assign({}, DEFAULT_SETTINGS, t.settings);
  const rows = {};
  teamIds.forEach((id) => {
    rows[id] = { id, name: teamName(t, id), p: 0, w: 0, d: 0, l: 0, f: 0, a: 0, diff: 0, pts: 0 };
  });
  games.forEach((m) => {
    const h = rows[m.home && m.home.id];
    const a = rows[m.away && m.away.id];
    if (!h || !a) return;
    h.p++; a.p++;
    h.f += m.hs; h.a += m.as;
    a.f += m.as; a.a += m.hs;
    if (m.hs > m.as) { h.w++; a.l++; h.pts += s.win; a.pts += s.loss; }
    else if (m.hs < m.as) { a.w++; h.l++; a.pts += s.win; h.pts += s.loss; }
    else { h.d++; a.d++; h.pts += s.draw; a.pts += s.draw; }
  });
  Object.values(rows).forEach((r) => { r.diff = r.f - r.a; });
  return rows;
}

const byMain = (x, y) => y.pts - x.pts || y.diff - x.diff || y.f - x.f;

// Ranking: points → score difference → scored → head-to-head between the
// tied teams (points, difference, scored) → wins → name.
export function computeStandings(t, group) {
  const games = matchList(t).filter((m) => m.stage === "group" && m.group === group.id && isPlayed(m));
  const rows = Object.values(tally(t, group.teamIds, games)).sort(byMain);

  const out = [];
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    while (j < rows.length && byMain(rows[i], rows[j]) === 0) j++;
    const tied = rows.slice(i, j);
    if (tied.length > 1) {
      const ids = tied.map((r) => r.id);
      const h2h = tally(t, ids, games);
      tied.sort((x, y) => byMain(h2h[x.id], h2h[y.id]) || y.w - x.w || x.name.localeCompare(y.name));
    }
    out.push(...tied);
    i = j;
  }
  return out;
}

export function groupComplete(t, groupId) {
  const ms = matchList(t).filter((m) => m.stage === "group" && m.group === groupId);
  return ms.length > 0 && ms.every(isPlayed);
}

export function winnerSide(m) {
  if (m.home && m.home.t === "bye") return "away";
  if (m.away && m.away.t === "bye") return "home";
  if (!isPlayed(m) || m.hs === m.as) return null;
  return m.hs > m.as ? "home" : "away";
}

// Turn a source into a team id (or null if it isn't decided yet).
export function resolveSource(t, src, depth = 0) {
  if (!src || depth > 12) return null;
  if (src.t === "team") return t.teams && t.teams[src.id] ? src.id : null;
  if (src.t === "group") {
    const group = (t.groups || []).find((g) => g.id === src.g);
    if (!group || !groupComplete(t, group.id)) return null;
    const row = computeStandings(t, group)[src.pos - 1];
    return row ? row.id : null;
  }
  if (src.t === "winner" || src.t === "loser") {
    const m = t.matches && t.matches[src.m];
    if (!m) return null;
    const side = winnerSide(m);
    if (!side) return null;
    const pick = src.t === "winner" ? side : side === "home" ? "away" : "home";
    return resolveSource(t, m[pick], depth + 1);
  }
  return null;
}

export function sourceLabel(t, src) {
  if (!src) return "TBD";
  if (src.t === "bye") return "Bye";
  const id = resolveSource(t, src);
  if (id) return teamName(t, id);
  if (src.t === "group") {
    const group = (t.groups || []).find((g) => g.id === src.g);
    return `${group ? group.name : "Group"} · ${ordinal(src.pos)}`;
  }
  if (src.t === "winner" || src.t === "loser") {
    const m = t.matches && t.matches[src.m];
    const label = m ? matchCode(t, src.m) : "match";
    return `${src.t === "winner" ? "Winner" : "Loser"} ${label}`;
  }
  return "TBD";
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// --- Knockout --------------------------------------------------------------

// Standard bracket order so the top seeds meet as late as possible.
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    order = order.flatMap((s) => [s, n - s]);
  }
  return order;
}

export function roundName(roundsTotal, round) {
  const left = roundsTotal - round;
  if (left === 0) return "Final";
  if (left === 1) return "Semi-finals";
  if (left === 2) return "Quarter-finals";
  return `Round of ${2 ** (left + 1)}`;
}

// seeds: ordered list of sources (seed 1 first). Returns a matches map.
export function buildKnockout(seeds, { thirdPlace = false } = {}) {
  const out = {};
  if (seeds.length < 2) return out;
  const size = 2 ** Math.ceil(Math.log2(seeds.length));
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  let prev = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    const ids = [];
    for (let i = 0; i < count; i++) {
      let home, away;
      if (r === 1) {
        home = seeds[order[i * 2] - 1] || { t: "bye" };
        away = seeds[order[i * 2 + 1] - 1] || { t: "bye" };
      } else {
        home = { t: "winner", m: prev[i * 2] };
        away = { t: "winner", m: prev[i * 2 + 1] };
      }
      const id = uid("k");
      ids.push(id);
      out[id] = {
        stage: "ko", group: null, round: r, slot: i, rounds,
        home, away, hs: null, as: null, status: "scheduled", time: "", court: ""
      };
    }
    if (r === 1) separateGroups(ids.map((id) => out[id]));
    prev = ids;
  }
  const semis = Object.entries(out).filter(([, m]) => m.round === rounds - 1).sort((a, b) => a[1].slot - b[1].slot);
  // A semi-final against a bye has no loser, so a third-place game can't happen
  if (thirdPlace && rounds >= 2 && !semis.some(([, m]) => isByeMatch(m))) {
    out[uid("k")] = {
      stage: "ko", group: null, round: rounds, slot: 1, rounds, third: true,
      home: { t: "loser", m: semis[0][0] }, away: { t: "loser", m: semis[1][0] },
      hs: null, as: null, status: "scheduled", time: "", court: ""
    };
  }
  return out;
}

// If two teams from the same group meet in round 1, swap opponents with
// another round-1 game so neither game is an all-group clash.
function separateGroups(firstRound) {
  const grp = (src) => (src && src.t === "group" ? src.g : null);
  const clash = (a, b) => grp(a) !== null && grp(a) === grp(b);
  firstRound.forEach((m, i) => {
    if (!clash(m.home, m.away)) return;
    for (let j = 0; j < firstRound.length; j++) {
      const o = firstRound[j];
      if (j === i) continue;
      // Swap like-for-like (runner-up for runner-up) to keep the seeding fair
      if (o.away.t !== m.away.t || (o.away.pos ?? 0) !== (m.away.pos ?? 0)) continue;
      if (!clash(m.home, o.away) && !clash(o.home, m.away)) {
        [m.away, o.away] = [o.away, m.away];
        return;
      }
    }
  });
}

// Seeds from group finishing positions: all group winners, then runners-up…
export function seedsFromGroups(groups, perGroup) {
  const seeds = [];
  for (let pos = 1; pos <= perGroup; pos++) {
    groups.forEach((g) => {
      if (g.teamIds.length >= pos) seeds.push({ t: "group", g: g.id, pos });
    });
  }
  return seeds;
}

export function knockoutRounds(t) {
  const ko = matchList(t).filter((m) => m.stage === "ko");
  if (!ko.length) return { rounds: [], third: null, total: 0 };
  const total = Math.max(...ko.map((m) => m.rounds || m.round));
  const rounds = [];
  for (let r = 1; r <= total; r++) {
    rounds.push({
      round: r,
      name: roundName(total, r),
      matches: ko.filter((m) => m.round === r && !m.third).sort((a, b) => a.slot - b.slot)
    });
  }
  const third = ko.find((m) => m.third);
  return { rounds, third, total };
}

export function isByeMatch(m) {
  return (m.home && m.home.t === "bye") || (m.away && m.away.t === "bye");
}

export function matchCode(t, id) {
  const m = t.matches[id];
  if (!m) return "";
  if (m.stage === "ko") {
    const total = m.rounds || m.round;
    if (m.third) return "3rd place";
    const name = roundName(total, m.round);
    if (name === "Final") return "Final";
    const short = name === "Semi-finals" ? "SF" : name === "Quarter-finals" ? "QF" : `R${2 ** (total - m.round + 1)}`;
    return `${short}${m.slot + 1}`;
  }
  return "";
}

// Matches people care about: no byes, in a sensible play order.
export function scheduleList(t) {
  const groupIndex = {};
  (t.groups || []).forEach((g, i) => { groupIndex[g.id] = i; });
  return matchList(t)
    .filter((m) => !isByeMatch(m))
    .sort((a, b) => {
      if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (a.stage !== b.stage) return a.stage === "group" ? -1 : 1;
      return a.round - b.round || (groupIndex[a.group] ?? 0) - (groupIndex[b.group] ?? 0) || a.slot - b.slot || a.id.localeCompare(b.id);
    });
}

export function stageLabel(t, m) {
  if (m.stage === "ko") {
    if (m.third) return "Third place";
    return roundName(m.rounds || m.round, m.round);
  }
  const g = (t.groups || []).find((x) => x.id === m.group);
  return `${g ? g.name : "Group"} · Round ${m.round}`;
}

export function champion(t) {
  const ko = knockoutRounds(t);
  if (ko.rounds && ko.rounds.length) {
    const final = ko.rounds[ko.rounds.length - 1].matches[0];
    const side = final && winnerSide(final);
    return side ? resolveSource(t, final[side]) : null;
  }
  // League only: the leader once every match is played
  if ((t.groups || []).length === 1 && groupComplete(t, t.groups[0].id)) {
    return computeStandings(t, t.groups[0])[0].id;
  }
  return null;
}
