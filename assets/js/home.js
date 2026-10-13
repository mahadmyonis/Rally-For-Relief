// Rally for Relief — home page: promote the live or next upcoming tournament

import { store } from "./store.js";
import { esc, formatDate } from "./ui.js";

const box = document.getElementById("promo");

function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
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

function render(list) {
  const t = pick(list);
  if (!t) { box.hidden = true; box.innerHTML = ""; return; }

  const live = t.status === "live";
  const days = daysUntil(t.date);
  let countdown = "";
  if (!live && days !== null) {
    countdown = days === 0 ? `Today<span>Game day</span>`
      : days === 1 ? `Tomorrow<span>Get ready</span>`
      : `${days}<span>days to go</span>`;
  }

  box.innerHTML = `
    <div class="container">
      <a class="promo-card" href="tournaments/?t=${encodeURIComponent(t.id)}">
        <div>
          <p class="promo-label">${live ? `<span class="promo-live-dot" aria-hidden="true"></span> Happening now` : "Next tournament"}</p>
          <h2 class="promo-title">${esc(t.name)}</h2>
          <p class="promo-meta">
            ${t.date ? `<span>📅 <strong>${esc(formatDate(t.date))}</strong></span>` : ""}
            ${t.location ? `<span>📍 <strong>${esc(t.location)}</strong></span>` : ""}
            ${live ? "" : "<span>Limited spots</span>"}
          </p>
        </div>
        <div class="promo-side">
          ${countdown ? `<p class="promo-countdown">${countdown}</p>` : ""}
          <span class="btn btn-accent promo-cta">${live ? "Follow live scores" : "See the details"} <span aria-hidden="true">→</span></span>
        </div>
      </a>
    </div>`;
  box.hidden = false;
}

// Demo mode only has data in the organiser's own browser, so keep the
// promo off the public home page until Firebase is connected
if (store.mode === "firebase") store.watchTournaments(render);
