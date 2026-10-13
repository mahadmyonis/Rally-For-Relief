// Rally for Relief — small rendering helpers shared by the public page and admin

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const STATUS_LABEL = { upcoming: "Upcoming", live: "Live", finished: "Finished" };

export function statusChip(status) {
  const s = STATUS_LABEL[status] ? status : "upcoming";
  return `<span class="chip chip-${s}">${s === "live" ? '<span class="live-dot" aria-hidden="true"></span>' : ""}${STATUS_LABEL[s]}</span>`;
}

export function query(name) {
  return new URLSearchParams(location.search).get(name);
}

// Only allow normal web links (stops "javascript:" and other odd schemes)
export function safeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

export function money(n) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("en-CA", { maximumFractionDigits: 0 });
}

export function signupsOpen(t) {
  return Boolean(t && t.signupsOpen && safeUrl(t.signupUrl) && t.status !== "finished");
}
