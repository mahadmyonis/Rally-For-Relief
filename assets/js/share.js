// Rally for Relief — share a tournament with a ready-made message

import * as C from "./tournament-core.js";
import { esc, formatDate, signupsOpen } from "./ui.js";

export function tournamentUrl(id) {
  return new URL(`/tournaments/?t=${encodeURIComponent(id)}`, location.origin).href;
}

// The message changes with the tournament: sign-ups, live, or results
export function shareMessage(t, url) {
  const when = [t.date ? `📅 ${formatDate(t.date)}` : "", t.location ? `📍 ${t.location}` : ""].filter(Boolean).join("  ");
  const champ = C.champion(t);
  const live = C.matchList(t).filter((m) => m.status === "live" && !C.isByeMatch(m)).length;
  let lines;
  if (t.status === "finished" || champ) {
    lines = [
      champ ? `🏆 ${C.teamName(t, champ)} are the ${t.name} champions!` : `🏆 That's a wrap on ${t.name}!`,
      "Thank you to every team, volunteer and supporter who came out for a good cause 🤍",
      "",
      `See all the results, standings and the bracket 👇`
    ];
  } else if (t.status === "live") {
    lines = [
      `🔴 LIVE: ${t.name} is happening right now!`,
      live ? `${live} game${live === 1 ? "" : "s"} on court — follow every score as it happens.` : "Follow every score, the standings and the bracket as it happens.",
      t.location ? `📍 ${t.location}` : "",
      "",
      "Live scores 👇"
    ];
  } else {
    lines = [
      `🏐 ${t.name} is coming up!`,
      when,
      signupsOpen(t)
        ? "Limited spots — get your team in and play for a good cause 🤍"
        : "Come play, cheer and give back with us 🤍",
      "",
      signupsOpen(t) ? "Details & sign-up 👇" : "Schedule & details 👇"
    ];
  }
  return [...lines.filter((l, i) => l !== "" || i > 0), url, "", "Play hard. Give back. 🏹 @rally4relief"]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / non-secure pages
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

let sheet = null;

export function openShare(t, url = tournamentUrl(t.id)) {
  if (sheet) sheet.remove();
  const message = shareMessage(t, url);
  sheet = document.createElement("div");
  sheet.className = "share-backdrop";
  sheet.innerHTML = `
    <div class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div class="share-head">
        <h2 id="share-title">Share ${esc(t.name)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <label class="field"><span>Message — edit it if you like</span>
        <textarea class="share-text" rows="8">${esc(message)}</textarea>
      </label>
      <div class="share-actions">
        ${navigator.share ? `<button type="button" class="btn btn-accent" data-native>Share… <span aria-hidden="true">↗</span></button>` : ""}
        <a class="btn ${navigator.share ? "btn-ghost" : "btn-accent"}" data-whatsapp target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="btn btn-ghost" data-copy>Copy message</button>
        <button type="button" class="btn btn-ghost" data-copy-link>Copy link</button>
      </div>
      <p class="share-status" role="status" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(sheet);

  const text = sheet.querySelector(".share-text");
  const status = sheet.querySelector(".share-status");
  const wa = sheet.querySelector("[data-whatsapp]");
  const syncWa = () => { wa.href = `https://wa.me/?text=${encodeURIComponent(text.value)}`; };
  syncWa();
  text.addEventListener("input", syncWa);

  const flash = (msg) => { status.textContent = msg; setTimeout(() => { status.textContent = ""; }, 2500); };
  const close = () => { sheet.remove(); sheet = null; document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });
  sheet.querySelector("[data-close]").addEventListener("click", close);

  sheet.querySelector("[data-copy]").addEventListener("click", async () => {
    flash((await copy(text.value)) ? "✓ Message copied — paste it anywhere" : "Couldn't copy — select the text and copy it");
  });
  sheet.querySelector("[data-copy-link]").addEventListener("click", async () => {
    flash((await copy(url)) ? "✓ Link copied" : "Couldn't copy the link");
  });
  const native = sheet.querySelector("[data-native]");
  if (native) native.addEventListener("click", async () => {
    // Most apps take the link from `url`, so keep it out of the text to avoid it twice
    const body = text.value.replace(url, "").replace(/\n{3,}/g, "\n\n").trim();
    try { await navigator.share({ title: t.name, text: body, url }); } catch { /* cancelled */ }
  });

  text.focus({ preventScroll: true });
}

export function shareButton(label = "Share") {
  return `<button type="button" class="btn btn-ghost btn-sm share-btn" data-share>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>
    ${label}</button>`;
}
