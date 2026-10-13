// Rally for Relief — home page: promote the live or next upcoming tournament

import { store } from "./store.js";
import { esc } from "./ui.js";

const box = document.getElementById("promo");
let timer = null;

function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

function daysUntil(iso) {
  const d = parseDate(iso);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// Live first; otherwise the soonest upcoming one that hasn't already passed
function pick(list) {
  const shown = list.filter((t) => t.published);
  const live = shown.find((t) => t.status === "live");
  if (live) return live;
  return shown
    .filter((t) => t.status === "upcoming" && (daysUntil(t.date) ?? 0) >= 0)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))[0] || null;
}

// Counts down to the start of the tournament day
function countdownParts(iso) {
  const d = parseDate(iso);
  if (!d) return null;
  const ms = Math.max(0, d - Date.now());
  return {
    days: Math.floor(ms / 86400000),
    hrs: Math.floor(ms / 3600000) % 24,
    min: Math.floor(ms / 60000) % 60
  };
}

function countdownHtml(iso) {
  const c = countdownParts(iso);
  if (!c) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `
    <div class="countdown" aria-label="${c.days} days, ${c.hrs} hours and ${c.min} minutes to go">
      <div><b>${c.days}</b><small>Days</small></div>
      <div><b>${pad(c.hrs)}</b><small>Hrs</small></div>
      <div><b>${pad(c.min)}</b><small>Min</small></div>
    </div>`;
}

function render(list) {
  clearInterval(timer);
  const t = pick(list);
  if (!t) { box.hidden = true; box.innerHTML = ""; return; }

  const live = t.status === "live";
  const date = parseDate(t.date);
  const days = daysUntil(t.date);
  const gameDay = days === 0;

  const stub = live
    ? `<span class="stub-dot" aria-hidden="true"></span><span class="stub-live">LIVE</span><span class="stub-bottom">Right now</span>`
    : date
      ? `<span class="stub-day">${date.getDate()}</span>
         <span class="stub-stack">
           <span class="stub-top">${date.toLocaleDateString(undefined, { month: "short" })}</span>
           <span class="stub-bottom">${date.toLocaleDateString(undefined, { weekday: "long" })}</span>
         </span>`
      : `<span class="stub-live">TBA</span><span class="stub-bottom">Date soon</span>`;

  box.innerHTML = `
    <div class="container">
      <a class="ticket" href="tournaments/?t=${encodeURIComponent(t.id)}">
        <div class="ticket-stub">${stub}</div>
        <div class="ticket-body">
          <div>
            <p class="promo-label">${live ? "Happening now" : gameDay ? "It's game day" : "Next tournament"}</p>
            <h2 class="promo-title">${esc(t.name)}</h2>
            <p class="promo-meta">
              ${t.location ? `<span>📍 ${esc(t.location)}</span>` : ""}
              ${live ? `<span class="promo-hot">🏐 Scores updating live</span>` : `<span class="promo-hot">Limited spots</span>`}
            </p>
          </div>
          <div class="ticket-side">
            ${!live && !gameDay ? `<div class="countdown-slot">${countdownHtml(t.date)}</div>` : ""}
            <span class="btn btn-accent promo-cta">${live ? "Follow live scores" : gameDay ? "See today's games" : "See the details"} <span aria-hidden="true">→</span></span>
          </div>
        </div>
      </a>
    </div>`;
  box.hidden = false;

  // Line the phone-layout notches up with the tear line under the stub
  const ticket = box.querySelector(".ticket");
  const stubEl = box.querySelector(".ticket-stub");
  const syncNotch = () => ticket.style.setProperty("--stub-h", `${stubEl.offsetHeight}px`);
  syncNotch();
  window.addEventListener("resize", syncNotch, { passive: true });

  const slot = box.querySelector(".countdown-slot");
  if (slot) timer = setInterval(() => { slot.innerHTML = countdownHtml(t.date); }, 30000);
}

// Demo mode only has data in the organiser's own browser, so keep the
// promo off the public home page until Firebase is connected
if (store.mode === "firebase") store.watchTournaments(render);
