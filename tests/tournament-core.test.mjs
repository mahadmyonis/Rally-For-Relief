// Tests for the tournament maths. Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../assets/js/tournament-core.js";

// --- helpers -------------------------------------------------------------------

function makeTournament(teamNames, settings = {}) {
  const t = { settings: { ...C.DEFAULT_SETTINGS, ...settings }, teams: {}, groups: [], matches: {} };
  teamNames.forEach((name, i) => { t.teams[`t${i}`] = { name, order: i }; });
  return t;
}

function addGroups(t, count, advance = 2) {
  C.assignGroups(Object.keys(t.teams), count).forEach((ids, i) => {
    const g = { id: `g${i}`, name: `Group ${C.groupLetter(i)}`, teamIds: ids, advance };
    t.groups.push(g);
    Object.assign(t.matches, C.groupMatches(g));
  });
}

function play(t, id, hs, as) {
  Object.assign(t.matches[id], { hs, as, status: "final" });
}

function findMatch(t, a, b) {
  return C.matchList(t).find((m) => m.stage === "group" &&
    ((m.home.id === a && m.away.id === b) || (m.home.id === b && m.away.id === a)));
}

// Set a result from team a's point of view regardless of home/away
function result(t, a, b, aScore, bScore) {
  const m = findMatch(t, a, b);
  if (m.home.id === a) play(t, m.id, aScore, bScore);
  else play(t, m.id, bScore, aScore);
}

function groupOf(t, src) {
  return src && src.t === "group" ? src.g : null;
}

// --- round robin -----------------------------------------------------------------

test("round robin: every pair meets exactly once, nobody plays twice in a round", () => {
  for (let n = 2; n <= 12; n++) {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const rounds = C.roundRobin(ids);
    const seen = new Set();
    rounds.forEach((pairs) => {
      const inRound = new Set();
      pairs.forEach(([a, b]) => {
        assert.notEqual(a, b);
        assert.ok(!inRound.has(a) && !inRound.has(b), `team twice in a round (n=${n})`);
        inRound.add(a); inRound.add(b);
        const key = [a, b].sort().join("-");
        assert.ok(!seen.has(key), `pair repeated (n=${n})`);
        seen.add(key);
      });
    });
    assert.equal(seen.size, (n * (n - 1)) / 2, `all pairs played (n=${n})`);
    assert.equal(rounds.length, n % 2 ? n : n - 1);
  }
});

test("groups: teams are spread evenly", () => {
  for (let n = 2; n <= 20; n++) {
    for (let g = 1; g <= Math.floor(n / 2); g++) {
      const sizes = C.assignGroups(Array.from({ length: n }, (_, i) => i), g).map((x) => x.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `n=${n} g=${g} sizes=${sizes}`);
      assert.equal(sizes.reduce((a, b) => a + b, 0), n);
    }
  }
});

// --- standings -------------------------------------------------------------------

test("standings: points, wins/draws/losses and score difference", () => {
  const t = makeTournament(["A", "B", "C", "D"]);
  addGroups(t, 1);
  // A beats B 3-1, A draws C 2-2, D beats A 1-0, B beats C 2-0, B draws D 1-1, C beats D 4-0
  result(t, "t0", "t1", 3, 1);
  result(t, "t0", "t2", 2, 2);
  result(t, "t3", "t0", 1, 0);
  result(t, "t1", "t2", 2, 0);
  result(t, "t1", "t3", 1, 1);
  result(t, "t2", "t3", 4, 0);
  const rows = Object.fromEntries(C.computeStandings(t, t.groups[0]).map((r) => [r.name, r]));
  assert.deepEqual(
    { p: rows.A.p, w: rows.A.w, d: rows.A.d, l: rows.A.l, f: rows.A.f, a: rows.A.a, diff: rows.A.diff, pts: rows.A.pts },
    { p: 3, w: 1, d: 1, l: 1, f: 5, a: 4, diff: 1, pts: 4 }
  );
  assert.deepEqual([rows.B.pts, rows.B.f, rows.B.a], [4, 4, 4]);
  assert.deepEqual([rows.C.pts, rows.C.f, rows.C.a], [4, 6, 4]);
  assert.deepEqual([rows.D.pts, rows.D.f, rows.D.a], [4, 2, 5]);
  // Every result adds up: total scored = total conceded, wins = losses
  const all = Object.values(rows);
  assert.equal(all.reduce((s, r) => s + r.f, 0), all.reduce((s, r) => s + r.a, 0));
  assert.equal(all.reduce((s, r) => s + r.w, 0), all.reduce((s, r) => s + r.l, 0));
});

test("standings: order is points, then difference, then scored", () => {
  const t = makeTournament(["A", "B", "C", "D"]);
  addGroups(t, 1);
  result(t, "t0", "t1", 3, 1);
  result(t, "t0", "t2", 2, 2);
  result(t, "t3", "t0", 1, 0);
  result(t, "t1", "t2", 2, 0);
  result(t, "t1", "t3", 1, 1);
  result(t, "t2", "t3", 4, 0);
  // All on 4 pts. Diff: C +2, A +1, B 0, D -3
  assert.deepEqual(C.computeStandings(t, t.groups[0]).map((r) => r.name), ["C", "A", "B", "D"]);
});

test("standings: only final games count; live and unplayed games are ignored", () => {
  const t = makeTournament(["A", "B", "C"]);
  addGroups(t, 1);
  const m = findMatch(t, "t0", "t1");
  Object.assign(t.matches[m.id], { hs: 5, as: 0, status: "live" });
  const rows = C.computeStandings(t, t.groups[0]);
  assert.ok(rows.every((r) => r.p === 0 && r.pts === 0));
});

test("standings: custom points (volleyball style 2 for a win, 0 for a loss)", () => {
  const t = makeTournament(["A", "B", "C"], { win: 2, draw: 0, loss: 0, allowDraws: false });
  addGroups(t, 1);
  result(t, "t0", "t1", 2, 1);
  result(t, "t0", "t2", 2, 0);
  result(t, "t1", "t2", 2, 1);
  const rows = C.computeStandings(t, t.groups[0]);
  assert.deepEqual(rows.map((r) => [r.name, r.pts, r.diff]), [["A", 4, 3], ["B", 2, 0], ["C", 0, -3]]);
});

test("standings: head-to-head breaks a two-way tie on points, difference and scored", () => {
  const t = makeTournament(["A", "B", "C", "D"]);
  addGroups(t, 1);
  // A and B finish level on everything except they played each other: B won
  result(t, "t1", "t0", 2, 1); // B beats A
  result(t, "t0", "t2", 2, 1); // A beats C
  result(t, "t0", "t3", 2, 1); // A beats D... A: 6pts f5 a4
  result(t, "t1", "t2", 1, 2); // C beats B
  result(t, "t1", "t3", 2, 1); // B beats D... B: 6pts f5 a4
  result(t, "t2", "t3", 0, 3); // D beats C
  const rows = C.computeStandings(t, t.groups[0]);
  const a = rows.find((r) => r.name === "A");
  const b = rows.find((r) => r.name === "B");
  assert.deepEqual([a.pts, a.diff, a.f], [b.pts, b.diff, b.f]);
  assert.deepEqual(rows.slice(0, 2).map((r) => r.name), ["B", "A"]);
});

test("standings: matches the brute-force tally on random results", () => {
  for (let run = 0; run < 300; run++) {
    const n = 2 + (run % 7);
    const t = makeTournament(Array.from({ length: n }, (_, i) => `Team ${i}`), {
      win: 1 + (run % 3), draw: run % 2, loss: 0
    });
    addGroups(t, 1);
    const tally = {};
    Object.keys(t.teams).forEach((id) => { tally[id] = { pts: 0, f: 0, a: 0, p: 0 }; });
    C.matchList(t).forEach((m) => {
      if (Math.random() < 0.2) return; // some games unplayed
      const hs = Math.floor(Math.random() * 4);
      const as = Math.floor(Math.random() * 4);
      play(t, m.id, hs, as);
      const h = tally[m.home.id], a = tally[m.away.id];
      h.p++; a.p++; h.f += hs; h.a += as; a.f += as; a.a += hs;
      const s = t.settings;
      h.pts += hs > as ? s.win : hs < as ? s.loss : s.draw;
      a.pts += as > hs ? s.win : as < hs ? s.loss : s.draw;
    });
    const rows = C.computeStandings(t, t.groups[0]);
    rows.forEach((r) => {
      assert.equal(r.pts, tally[r.id].pts);
      assert.equal(r.f, tally[r.id].f);
      assert.equal(r.a, tally[r.id].a);
      assert.equal(r.p, tally[r.id].p);
      assert.equal(r.diff, r.f - r.a);
    });
    for (let i = 1; i < rows.length; i++) {
      const x = rows[i - 1], y = rows[i];
      assert.ok(x.pts > y.pts || (x.pts === y.pts && (x.diff > y.diff || (x.diff === y.diff && x.f >= y.f))),
        "sorted by points, then difference, then scored");
    }
  }
});

// --- knockout --------------------------------------------------------------------

test("bracket: right number of games and byes for any team count", () => {
  for (let n = 2; n <= 20; n++) {
    const seeds = Array.from({ length: n }, (_, i) => ({ t: "team", id: `t${i}` }));
    const ko = Object.values(C.buildKnockout(seeds));
    const size = 2 ** Math.ceil(Math.log2(n));
    assert.equal(ko.length, size - 1, `n=${n}`);
    const r1 = ko.filter((m) => m.round === 1);
    const byes = r1.filter((m) => C.isByeMatch(m)).length;
    assert.equal(byes, size - n, `n=${n} byes`);
    assert.ok(r1.every((m) => !(m.home.t === "bye" && m.away.t === "bye")), "never bye vs bye");
    // Every team appears exactly once in round 1
    const ids = r1.flatMap((m) => [m.home, m.away]).filter((s) => s.t === "team").map((s) => s.id);
    assert.equal(new Set(ids).size, n);
  }
});

test("bracket: top seeds get the byes and are kept apart", () => {
  const seeds = Array.from({ length: 6 }, (_, i) => ({ t: "team", id: `s${i + 1}` }));
  const r1 = Object.values(C.buildKnockout(seeds)).filter((m) => m.round === 1).sort((a, b) => a.slot - b.slot);
  const byeTeams = r1.filter(C.isByeMatch).map((m) => (m.home.t === "bye" ? m.away.id : m.home.id)).sort();
  assert.deepEqual(byeTeams, ["s1", "s2"]);
  // Seeds 1 and 2 are in opposite halves, so they can only meet in the final
  const half = (id) => r1.findIndex((m) => m.home.id === id || m.away.id === id) < r1.length / 2;
  assert.notEqual(half("s1"), half("s2"));
});

test("bracket from groups: teams from the same group never meet in the first round", () => {
  for (let g = 1; g <= 8; g++) {
    for (let adv = 1; adv <= 4; adv++) {
      if (g * adv < 2) continue;
      const groups = Array.from({ length: g }, (_, i) => ({ id: `g${i}`, teamIds: Array(adv + 1).fill(0).map((_, k) => `g${i}t${k}`) }));
      const seeds = C.seedsFromGroups(groups, adv);
      const r1 = Object.values(C.buildKnockout(seeds)).filter((m) => m.round === 1);
      r1.forEach((m) => {
        const a = groupOf(null, m.home), b = groupOf(null, m.away);
        if (g > 1 && a && b) assert.notEqual(a, b, `groups=${g} advance=${adv}: ${a} vs ${b}`);
      });
    }
  }
});

test("bracket from groups: group winners never face each other in round 1 when avoidable", () => {
  const groups = Array.from({ length: 4 }, (_, i) => ({ id: `g${i}`, teamIds: ["a", "b", "c"].map((x) => `g${i}${x}`) }));
  const r1 = Object.values(C.buildKnockout(C.seedsFromGroups(groups, 2))).filter((m) => m.round === 1);
  r1.forEach((m) => assert.ok(!(m.home.pos === 1 && m.away.pos === 1), "winner vs winner"));
});

test("bracket: winners advance, byes advance automatically, champion is decided", () => {
  const t = makeTournament(["A", "B", "C", "D", "E"]);
  Object.assign(t.matches, C.buildKnockout(Object.keys(t.teams).map((id) => ({ t: "team", id }))));
  let ko = C.knockoutRounds(t);
  assert.equal(ko.rounds.length, 3);
  // Play every real game in order; home side always wins
  for (const r of ko.rounds) {
    for (const m of r.matches) {
      if (C.isByeMatch(m)) continue;
      assert.ok(C.resolveSource(t, m.home) && C.resolveSource(t, m.away), `both teams known in ${r.name}`);
      play(t, m.id, 2, 1);
    }
    ko = C.knockoutRounds(t);
  }
  const final = ko.rounds[2].matches[0];
  assert.equal(C.champion(t), C.resolveSource(t, final.home));
});

test("bracket: a tied knockout game doesn't send anyone through", () => {
  const t = makeTournament(["A", "B"]);
  Object.assign(t.matches, C.buildKnockout([{ t: "team", id: "t0" }, { t: "team", id: "t1" }]));
  const [m] = C.matchList(t);
  play(t, m.id, 1, 1);
  assert.equal(C.winnerSide(t.matches[m.id]), null);
  assert.equal(C.champion(t), null);
});

test("third-place game: the two semi-final losers", () => {
  const t = makeTournament(["A", "B", "C", "D"]);
  Object.assign(t.matches, C.buildKnockout(Object.keys(t.teams).map((id) => ({ t: "team", id })), { thirdPlace: true }));
  const ko = C.knockoutRounds(t);
  ko.rounds[0].matches.forEach((m) => play(t, m.id, 3, 0));
  const losers = ko.rounds[0].matches.map((m) => C.resolveSource(t, m.away)).sort();
  const third = C.knockoutRounds(t).third;
  assert.deepEqual([C.resolveSource(t, third.home), C.resolveSource(t, third.away)].sort(), losers);
});

test("third-place game is skipped when a semi-final is a bye", () => {
  const seeds = ["a", "b", "c"].map((id) => ({ t: "team", id }));
  const ko = Object.values(C.buildKnockout(seeds, { thirdPlace: true }));
  assert.ok(!ko.some((m) => m.third), "no third-place game with only 3 teams");
});

// --- groups → knockout -----------------------------------------------------------

test("groups → bracket: the right teams go through once each group finishes", () => {
  const t = makeTournament(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]);
  t.groups = [
    { id: "gA", name: "Group A", teamIds: ["t0", "t1", "t2", "t3"], advance: 2 },
    { id: "gB", name: "Group B", teamIds: ["t4", "t5", "t6", "t7"], advance: 2 }
  ];
  t.groups.forEach((g) => Object.assign(t.matches, C.groupMatches(g)));
  Object.assign(t.matches, C.buildKnockout(C.seedsFromGroups(t.groups, 2)));
  const semis = () => C.knockoutRounds(t).rounds[0].matches;

  // Lower team number always wins, so A1 and A2 top group A, B1 and B2 top group B
  const strength = (id) => Number(id.slice(1));
  C.matchList(t).filter((m) => m.stage === "group" && m.group === "gA").forEach((m) => {
    play(t, m.id, strength(m.home.id) < strength(m.away.id) ? 2 : 0, strength(m.home.id) < strength(m.away.id) ? 0 : 2);
  });
  // Group B not finished yet: its slots stay undecided, group A's are filled
  const filled = semis().flatMap((m) => [m.home, m.away]).map((s) => [s.g, C.resolveSource(t, s)]);
  assert.ok(filled.filter(([g]) => g === "gA").every(([, id]) => id));
  assert.ok(filled.filter(([g]) => g === "gB").every(([, id]) => id === null));

  C.matchList(t).filter((m) => m.stage === "group" && m.group === "gB").forEach((m) => {
    play(t, m.id, strength(m.home.id) < strength(m.away.id) ? 2 : 0, strength(m.home.id) < strength(m.away.id) ? 0 : 2);
  });
  const names = semis().map((m) => [C.resolveSource(t, m.home), C.resolveSource(t, m.away)].map((id) => t.teams[id].name));
  // Winners play the other group's runner-up
  assert.deepEqual(names.map((p) => p.sort().join(" v ")).sort(), ["A1 v B2", "A2 v B1"]);
});

test("dependent games: a group game feeds the whole bracket; a semi feeds the final and third place", () => {
  const t = makeTournament(["A1", "A2", "A3", "B1", "B2", "B3"]);
  t.groups = [
    { id: "gA", name: "Group A", teamIds: ["t0", "t1", "t2"], advance: 2 },
    { id: "gB", name: "Group B", teamIds: ["t3", "t4", "t5"], advance: 2 }
  ];
  t.groups.forEach((g) => Object.assign(t.matches, C.groupMatches(g)));
  Object.assign(t.matches, C.buildKnockout(C.seedsFromGroups(t.groups, 2), { thirdPlace: true }));
  const ko = C.knockoutRounds(t);
  const groupGame = C.matchList(t).find((m) => m.group === "gA");
  // Group A feeds both semis (A1 and A2 are in different semis), so everything after them too
  assert.equal(C.dependentMatches(t, groupGame.id).length, 4);
  const semi = ko.rounds[0].matches[0];
  assert.deepEqual(C.dependentMatches(t, semi.id).sort(), [ko.rounds[1].matches[0].id, ko.third.id].sort());
  assert.deepEqual(C.dependentMatches(t, ko.rounds[1].matches[0].id), []);
});

test("columns: group stage in slots (each group's game N together), then knockout rounds", () => {
  const t = makeTournament(["A", "B", "C", "D", "E", "F"]);
  addGroups(t, 2, 2);
  Object.assign(t.matches, C.buildKnockout(C.seedsFromGroups(t.groups, 2), { thirdPlace: true }));
  const cols = C.roundColumns(t);
  // 3 teams per group → 3 games each → 3 slots of 2 games (one per group), then semis and final
  assert.deepEqual(cols.map((c) => c.title), ["Slot 1", "Slot 2", "Slot 3", "Semi-finals", "Final"]);
  cols.slice(0, 3).forEach((c) => assert.deepEqual(c.matches.map((m) => m.group).sort(), ["g0", "g1"]));
  assert.equal(cols.reduce((n, c) => n + c.matches.length, 0), C.scheduleList(t).length);
  assert.ok(cols[4].matches[1].third, "third place after the final");

  const k = makeTournament(["A", "B", "C"]);
  Object.assign(k.matches, C.buildKnockout(Object.keys(k.teams).map((id) => ({ t: "team", id }))));
  assert.deepEqual(C.roundColumns(k).map((c) => [c.title, c.matches.length]), [["Semi-finals", 1], ["Final", 1]]);
});

test("schedule, one court per group: game N of every group at the same time, own court", () => {
  const t = makeTournament(Array.from({ length: 10 }, (_, i) => `T${i}`));
  addGroups(t, 2, 2);
  Object.assign(t.matches, C.buildKnockout(C.seedsFromGroups(t.groups, 2), { thirdPlace: true }));
  const plan = C.autoSchedule(t, { start: "10:00", minutes: 25, mode: "perGroup" });
  Object.entries(plan).forEach(([id, p]) => Object.assign(t.matches[id], p));
  const order = C.groupOrder(t);
  const group = C.matchList(t).filter((m) => m.stage === "group");
  group.forEach((m) => assert.equal(m.court, m.group === "g0" ? "Court 1" : "Court 2"));
  // Same game number → same time across groups; times go 10:00, 10:25, 10:50…
  for (let n = 1; n <= 10; n++) {
    const games = group.filter((m) => order[m.id].n === n);
    assert.equal(games.length, 2, `two games in slot ${n}`);
    assert.equal(games[0].time, games[1].time);
  }
  assert.equal(group.find((m) => order[m.id].n === 1).time, "10:00");
  assert.equal(group.find((m) => order[m.id].n === 2).time, "10:25");
  // Nobody on two courts at once, and the columns line up with the slots
  const cols = C.roundColumns(t);
  cols.forEach((c) => {
    const teams = c.matches.flatMap((m) => [m.home.id, m.away.id]).filter(Boolean);
    assert.equal(new Set(teams).size, teams.length);
  });
  assert.equal(cols.filter((c) => c.stage === "group").length, 10);
  // Knockouts after the last group slot (10 slots → semis at 14:10, final + 3rd at 14:35)
  const ko = C.knockoutRounds(t);
  ko.rounds[0].matches.forEach((m) => assert.equal(m.time, "14:10"));
  assert.equal(ko.rounds[1].matches[0].time, "14:35");
  assert.equal(ko.third.time, "14:35");
  assert.notEqual(ko.rounds[1].matches[0].court, ko.third.court);
  assert.match(C.stageLabel(t, group.find((m) => m.group === "g0" && order[m.id].n === 3)), /Group A · Game 3 of 10/);
});

test("schedule, one court per group: nobody plays two games in a row when avoidable", () => {
  const t = makeTournament(Array.from({ length: 10 }, (_, i) => `T${i}`));
  addGroups(t, 2);
  const plan = C.autoSchedule(t, { mode: "perGroup" });
  Object.entries(plan).forEach(([id, p]) => Object.assign(t.matches[id], p));
  t.groups.forEach((g) => {
    const seq = C.matchList(t).filter((m) => m.group === g.id).sort((a, b) => a.time.localeCompare(b.time));
    let backToBack = 0;
    for (let i = 1; i < seq.length; i++) {
      const prev = [seq[i - 1].home.id, seq[i - 1].away.id];
      if ([seq[i].home.id, seq[i].away.id].some((x) => prev.includes(x))) backToBack++;
    }
    assert.ok(backToBack <= 1, `${g.name}: ${backToBack} back-to-back games`);
  });
});

test("schedule, shared courts: courts filled, nobody double-booked", () => {
  const t = makeTournament(Array.from({ length: 8 }, (_, i) => `T${i}`));
  addGroups(t, 2);
  const plan = C.autoSchedule(t, { start: "09:00", minutes: 20, mode: "shared", courts: 3 });
  Object.entries(plan).forEach(([id, p]) => Object.assign(t.matches[id], p));
  const bySlot = {};
  C.matchList(t).forEach((m) => { (bySlot[m.time] = bySlot[m.time] || []).push(m); });
  Object.values(bySlot).forEach((games) => {
    assert.ok(games.length <= 3);
    const teams = games.flatMap((m) => [m.home.id, m.away.id]);
    assert.equal(new Set(teams).size, teams.length);
    assert.equal(new Set(games.map((m) => m.court)).size, games.length);
  });
  assert.equal(C.matchList(t).every((m) => m.time && m.court), true);
});

test("results: free scoring, draws and knockout ties", () => {
  const t = makeTournament(["A", "B"]);
  const g = { stage: "group" }, ko = { stage: "ko" };
  assert.equal(C.resultProblem(t, g, 3, 1), null);
  assert.equal(C.resultProblem(t, g, 1, 1), null, "draws allowed by default");
  assert.match(C.resultProblem(t, ko, 1, 1), /winner/);
  assert.match(C.resultProblem(t, g, null, 1), /both/);
  t.settings.allowDraws = false;
  assert.match(C.resultProblem(t, g, 2, 2), /Draws/);
});

test("results: best-of-3 and best-of-5 set scores", () => {
  const t = makeTournament(["A", "B"], { bestOf: 3, allowDraws: false });
  const g = { stage: "group" };
  for (const [h, a] of [[2, 0], [2, 1], [1, 2], [0, 2]]) assert.equal(C.resultProblem(t, g, h, a), null, `${h}-${a}`);
  for (const [h, a] of [[1, 0], [3, 0], [2, 2], [1, 1], [0, 0]]) assert.ok(C.resultProblem(t, g, h, a), `${h}-${a} rejected`);
  assert.deepEqual(C.quickResults(t), [[2, 0], [2, 1], [1, 2], [0, 2]]);
  t.settings.bestOf = 5;
  assert.deepEqual(C.quickResults(t), [[3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3]]);
  assert.equal(C.resultProblem(t, g, 3, 2), null);
  assert.ok(C.resultProblem(t, g, 2, 1));
  t.settings.bestOf = 0;
  assert.deepEqual(C.quickResults(t), []);
});

test("next game: same court first, skips finished and undecided games", () => {
  const t = makeTournament(["A", "B", "C", "D"]);
  addGroups(t, 1);
  const list = C.scheduleList(t);
  list.forEach((m, i) => { t.matches[m.id].court = i % 2 ? "Court 2" : "Court 1"; });
  const first = list[0];
  play(t, first.id, 1, 0);
  const next = C.nextGame(t, first.id, "Court 1");
  assert.equal(next.court, "Court 1");
  assert.notEqual(next.id, first.id);
  list.forEach((m) => play(t, m.id, 1, 0));
  assert.equal(C.nextGame(t, first.id, "Court 1"), null);
});

test("game numbers follow play order; possible knockouts only while the group is open", () => {
  const t = makeTournament(["A", "B", "C", "D"]);
  addGroups(t, 2, 1);
  Object.assign(t.matches, C.buildKnockout(C.seedsFromGroups(t.groups, 1)));
  const nums = C.gameNumbers(t);
  assert.deepEqual(C.scheduleList(t).map((m) => nums[m.id]), [1, 2, 3]);
  const team = t.groups[0].teamIds[0];
  assert.equal(C.possibleKnockouts(t, team).length, 1);
  C.matchList(t).filter((m) => m.group === t.groups[0].id).forEach((m) => play(t, m.id, 1, 0));
  assert.equal(C.possibleKnockouts(t, team).length, 0);
});
