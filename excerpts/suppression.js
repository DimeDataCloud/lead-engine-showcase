// Excerpt from a private codebase: Dime Data lead engines, leadgen-enterprise/compliance.js (lines 28-43 and 104-116) at 9ed7e4c.
// Shown for reading. Not licensed for reuse; see ../LICENSE.
//
// Phone numbers are compared by digits, never as strings: sources format the same number differently,
// and an exact-string blocklist passes a suppressed number the moment it arrives from a new source.

// ---------- phone normalization ----------
// To 10 digits (NANP). Returns null for anything that isn't a plausible US number.
function normPhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  // NANP: area code and exchange both start 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  return d;
}

function fmtPhone(raw) {
  const d = normPhone(raw);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

// [...]

// ---------- the scrub ----------
// blocklist: rows from crm_excluded, fetched ONCE per sweep by the caller.
// Returns a normalized suppression index. Built once, reused for every candidate.
function buildSuppressionIndex(rows) {
  const phones = new Set(), companies = new Set(), websites = new Set();
  for (const r of rows || []) {
    const p = normPhone(r.phone);
    if (p) phones.add(p);
    if (r.company) companies.add(String(r.company).trim().toLowerCase());
    if (r.website) websites.add(String(r.website).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, ""));
  }
  return { phones, companies, websites, size: (rows || []).length };
}
