// Excerpt from a private codebase: Dime Data lead engines, leadgen-enterprise/intent.js (lines 1-59, 239-247 and 249-291) at 9ed7e4c.
// Shown for reading. Not licensed for reuse; see ../LICENSE.
//
// Three slices of one file; the elided parts are marked [...] and hold the size bands and scoring adders.

// FIT x INTENT scoring, evidence-tiered.
//
// The difference between this and every contact database on the market is one
// idea: a claim is only worth what backs it. A revenue figure lifted off an SEC
// filing and a revenue figure a language model produced when asked to guess are
// not the same fact, and this file refuses to score them the same.
//
// FIT is therefore CAPPED by the best evidence supporting the size claim. A lead
// whose entire profile is model-estimated cannot outrank a filing-backed lead no
// matter how confident the prose sounds. That cap is the anti-hallucination
// guarantee — it makes a high score mean something a rep can rely on.
//
// INTENT requires a PATTERN, not a hit. One weak signal is noise; the gate wants
// either a single high-weight event (a funding raise, an executive hire) or two
// independent signals inside the same window.
const { profile } = require("./verticals");

const GATES = {
  // Deliberately far above the local-business engine's 35/35. This funnel is
  // selective by design — a smaller, righter list is the product.
  fitMin: parseInt(process.env.FIT_MIN || "55", 10),
  // 40 is the hinge the whole intent model turns on, so it is chosen, not guessed:
  // it must sit ABOVE any signal that needs corroboration (an open Form D offering
  // with nothing sold, 30) and AT OR BELOW any signal that alone warrants a call
  // (a closed raise 48, an exec hire 46, a hand-raiser 55). It also lets two
  // genuine mid-strength signals combine — an open offering plus an ops-leadership
  // hire (30+14) is a real pattern and should reach a rep.
  intentMin: parseInt(process.env.INTENT_MIN || "40", 10),
  staleDays: parseInt(process.env.INTENT_STALE_DAYS || "30", 10),
  // Independent signals required when no single high-weight trigger fired.
  minSignals: parseInt(process.env.MIN_INTENT_SIGNALS || "2", 10),
  signalWindowDays: parseInt(process.env.INTENT_WINDOW_DAYS || "90", 10),
};

// ---------- evidence tiers ----------
// The ceiling each tier of evidence may contribute to FIT.
//
// THE LOAD-BEARING INVARIANT: `estimated` and `none` cap BELOW GATES.fitMin, so a
// lead supported only by a model's guess can never reach a rep, no matter how
// confident the guess reads. At least one derived, verified, or filed fact about
// the company's size is required to qualify. This is the difference between this
// engine and a contact database full of plausible-looking unsourced rows — and
// it's asserted in test.js so it can't be tuned away by accident.
const EVIDENCE = {
  filed:     { rank: 4, cap: 100, label: "filed with a government body" },
  verified:  { rank: 3, cap: 88,  label: "verified by direct observation" },
  derived:   { rank: 2, cap: 72,  label: "derived from a verified input" },
  estimated: { rank: 1, cap: 50,  label: "model estimate" },
  none:      { rank: 0, cap: 35,  label: "no supporting evidence" },
};
function tierOfEvidence(t) { return EVIDENCE[t] || EVIDENCE.none; }
function bestTier(...facts) {
  let best = "none";
  for (const f of facts) {
    if (!f || !f.tier) continue;
    if (tierOfEvidence(f.tier).rank > tierOfEvidence(best).rank) best = f.tier;
  }
  return best;
}

// [...] size bands and the body of computeFit, which adds points for size, a named decision
// [...] maker, funding, software stack, reach and locations. Its last lines are the cap:

function computeFit(/* { prof, verticalKey, signals, technographics, locationCount } */) {
  // [...]
  score = Math.max(0, Math.min(100, Math.round(score)));

  // THE CAP. Evidence quality bounds the score, and we say so in the reasons so a
  // rep reading the card knows exactly how much to trust it.
  const capped = Math.min(score, ev.cap);
  if (capped < score) reasons.push(`score capped at ${ev.cap} — best supporting evidence is a ${ev.label}`);

  return { score: capped, uncapped: score, tier, evidence: evTier, evidenceLabel: ev.label, reasons };
}

// [...]

// ---------- INTENT ----------
// A single signal is noise. A pattern of signals in a short window is intent.
//
// "High weight" is DERIVED, not a hand-kept list: a signal is strong enough to
// justify outreach on its own exactly when its weight alone clears the intent
// gate. Signal weights are defined in firmographics.js, so a hardcoded list here
// would silently drift out of sync with them the first time a weight is tuned.
// One rule, one source of truth.
function isHighWeight(sig) { return (sig?.weight || 0) >= GATES.intentMin; }

function computeIntent({ prof, triggers, snapshot } = {}) {
  const fired = [];

  // Filings + hiring signals come pre-weighted from firmographics.
  for (const s of (prof?.signals || [])) fired.push(s);
  for (const t of (triggers || [])) fired.push(t);

  // Weights here follow the same rule: something that alone warrants a call is
  // weighted at or above the gate; something that needs corroboration is not.
  if (snapshot?.seeking_help) fired.push({ key: "hand_raiser", evidence: snapshot.evidence || "publicly seeking automation/AI help", weight: 55 });
  if (snapshot?.rfp) fired.push({ key: "rfp", evidence: snapshot.rfp, weight: 55 });
  if (snapshot?.exec_change) fired.push({ key: "exec_hire", evidence: snapshot.exec_change, weight: 46 });
  if (snapshot?.recent_expansion) fired.push({ key: "expansion", evidence: snapshot.evidence || "recently expanded or opened a location", weight: 12 });

  // Dedupe by key, keeping the strongest instance of each. Without this, three
  // job postings that all match "ops_leadership" would read as a pattern when
  // they're really one signal seen three times.
  const byKey = new Map();
  for (const s of fired) {
    const prev = byKey.get(s.key);
    if (!prev || (s.weight || 0) > (prev.weight || 0)) byKey.set(s.key, s);
  }
  const uniq = [...byKey.values()];

  let score = 0;
  for (const s of uniq) score += (s.weight || 0);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const hasHigh = uniq.some(isHighWeight);
  const pattern = hasHigh || uniq.length >= GATES.minSignals;

  return { score, signals: uniq, hasHighWeight: hasHigh, pattern };
}
