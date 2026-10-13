// Rally for Relief — home page live bits:
// the next/live tournament ticket and the donation campaign.

import { store } from "./store.js";
import { esc, safeUrl, money, signupsOpen } from "./ui.js";

// --- Next tournament ticket ---------------------------------------------------

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
function countdownHtml(iso) {
  const d = parseDate(iso);
  if (!d) return "";
  const ms = Math.max(0, d - Date.now());
  const days = Math.floor(ms / 86400000);
  const hrs = Math.floor(ms / 3600000) % 24;
  const min = Math.floor(ms / 60000) % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `
    <div class="countdown" aria-label="${days} days, ${hrs} hours and ${min} minutes to go">
      <div><b>${days}</b><small>Days</small></div>
      <div><b>${pad(hrs)}</b><small>Hrs</small></div>
      <div><b>${pad(min)}</b><small>Min</small></div>
    </div>`;
}

function renderTicket(list) {
  clearInterval(timer);
  const t = pick(list);
  if (!t) { box.hidden = true; box.innerHTML = ""; return; }

  const live = t.status === "live";
  const date = parseDate(t.date);
  const gameDay = daysUntil(t.date) === 0;
  const page = `tournaments/?t=${encodeURIComponent(t.id)}`;
  const signup = signupsOpen(t) ? safeUrl(t.signupUrl) : "";

  const stub = live
    ? `<span class="stub-dot" aria-hidden="true"></span><span class="stub-live">LIVE</span><span class="stub-bottom">Right now</span>`
    : date
      ? `<span class="stub-day">${date.getDate()}</span>
         <span class="stub-stack">
           <span class="stub-top">${date.toLocaleDateString(undefined, { month: "short" })}</span>
           <span class="stub-bottom">${date.toLocaleDateString(undefined, { weekday: "long" })}</span>
         </span>`
      : `<span class="stub-live">TBA</span><span class="stub-bottom">Date soon</span>`;

  const buttons = live
    ? `<a class="btn btn-accent" href="${page}">Follow live scores <span aria-hidden="true">→</span></a>`
    : signup
      ? `<a class="btn btn-accent" href="${esc(signup)}" target="_blank" rel="noopener">Sign up your team <span aria-hidden="true">↗</span></a>
         <a class="btn btn-ghost" href="${page}">See the details</a>`
      : `<a class="btn btn-accent" href="${page}">${gameDay ? "See today's games" : "See the details"} <span aria-hidden="true">→</span></a>`;

  box.innerHTML = `
    <div class="container">
      <article class="ticket">
        <div class="ticket-stub">${stub}</div>
        <div class="ticket-body">
          <div>
            <p class="promo-label">${live ? "Happening now" : gameDay ? "It's game day" : signup ? "Sign-ups open" : "Next tournament"}</p>
            <h2 class="promo-title"><a href="${page}">${esc(t.name)}</a></h2>
            <p class="promo-meta">
              ${t.location ? `<span>📍 ${esc(t.location)}</span>` : ""}
              ${live ? `<span class="promo-hot">🏐 Scores updating live</span>` : `<span class="promo-hot">Limited spots</span>`}
            </p>
          </div>
          <div class="ticket-side">
            ${!live && !gameDay ? `<div class="countdown-slot">${countdownHtml(t.date)}</div>` : ""}
            <div class="ticket-actions">${buttons}</div>
          </div>
        </div>
      </article>
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

// --- Donation campaign --------------------------------------------------------

const donateBox = document.getElementById("donate");
const donateLinks = document.querySelectorAll("[data-donate-link]");

function renderDonate(site) {
  const d = (site && site.donate) || {};
  const url = safeUrl(d.url);
  const show = Boolean(d.show && url);
  donateLinks.forEach((a) => { a.hidden = !show; });
  if (!show) { donateBox.hidden = true; donateBox.innerHTML = ""; return; }

  const goal = Number(d.goal) || 0;
  const raised = Number(d.raised) || 0;
  const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const reached = goal > 0 && raised >= goal;

  donateBox.innerHTML = `
    <div class="container">
      <div class="donate-card">
        <div class="donate-copy">
          <p class="eyebrow"><span class="dot" aria-hidden="true"></span> Give back</p>
          <h2 class="section-title">${esc(d.title || "Support our campaign")}</h2>
          ${d.blurb ? `<p class="donate-blurb">${esc(d.blurb)}</p>` : ""}
        </div>
        <div class="donate-side">
          ${goal > 0 ? `
            <div class="donate-progress">
              <p class="donate-raised">${esc(money(raised))}</p>
              <p class="donate-of">${reached ? "raised — goal reached, thank you! 🎉" : `raised of ${esc(money(goal))} goal`}</p>
              <div class="donate-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${raised}" aria-label="Amount raised">
                <span style="width:${pct.toFixed(1)}%"></span>
              </div>
              <p class="donate-pct">${Math.floor(pct)}%</p>
            </div>` : ""}
          <a class="btn btn-accent btn-lg donate-btn" href="${esc(url)}" target="_blank" rel="noopener">Donate now <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </div>`;
  donateBox.hidden = false;
}

// Demo mode only has data in the organiser's own browser, so keep these off
// the public home page until Firebase is connected
if (store.mode === "firebase") {
  store.watchTournaments(renderTicket);
  store.watchSite(renderDonate);
}
