// Excerpt from a private codebase: Dime Data lead engines, leadgen/offers.js (lines 223-449) at 9ed7e4c.
// Shown for reading. Not licensed for reuse; see ../LICENSE.
//
// The Starter screen: weights for each observed gap, the floor, and recommend(), which picks one
// deliverable or a bigger tier by counting independent gap areas. TIERS, OFFERS, TRAITS and the page
// signal regexes it reads are defined above this slice.

// ---------------------------------------------------------------------------------
// Scoring. Every entry is "we observed X, and X maps to something we sell". Absences
// we did not verify score nothing.
//
// The floor (`minScore`, default 30) is set so the thinnest sellable thing clears it
// and nothing thinner does. The binding case is an SEO-audit-only lead — a site that
// works but is not measured: no analytics (14) + no schema (10) + no canonical (4) +
// no social tags (4) = 32. A site missing only the last two scores 8 and is correctly
// thrown away. The self-test pins both sides of that boundary.
const W = {
  noSite: 45, unreachable: 40, unsecure: 20, outdatedEach: 10, outdatedCap: 25,
  noBooking: 22, noAfterHours: 18, noTitle: 12, noDescription: 12,
  noAnalytics: 14, noSchema: 10, noSitemap: 6, noH1: 6, noOg: 4, noCanonical: 4,
  // A shop with no way to buy is a real, sellable gap and its own service line.
  noEcommerce: 20,
};
const MIN_SCORE = 30;

const HARD_SITE_PROBLEMS = new Set(["No website", "Unreachable website"]);

// The gap AREAS a piece of evidence belongs to. Tier is chosen by counting distinct
// areas, so this mapping is what decides Starter vs Growth — one focused deliverable
// versus several things that have to be wired together.
const AREA_OF = {
  no_site: "site", unreachable: "site", unsecure: "site", outdated: "site",
  no_booking: "booking",
  no_after_hours: "calls",
  no_ecommerce: "commerce",
  no_title: "seo", no_description: "seo", no_analytics: "seo", no_schema: "seo",
  no_h1: "seo", no_og: "seo", no_canonical: "seo", no_sitemap: "seo",
};

/**
 * The recommendation.
 *
 * @param {object} business { name, category }
 * @param {object} check    checkSite() result — { problems, issues, reachable, website }
 * @param {object} signals  siteSignals() output, or { read:false }
 * @param {object} opts     { hasSitemap: boolean|null, minScore: number }
 * @returns {object} the label a rep opens the card to
 */
function recommend(business, check, signals, opts = {}) {
  const minScore = opts.minScore == null ? MIN_SCORE : opts.minScore;
  const sig = signals && signals.read ? signals : { read: false };
  const problems = new Set(check.problems || []);
  const issues = check.issues || [];
  const trait = traitOf(business.category, business.name);

  const evidence = [];
  const add = (key, points, text) => evidence.push({ key, points, text });

  const noSite = problems.has("No website");
  const unreachable = problems.has("Unreachable website");
  const unsecure = problems.has("Unsecure website");
  const outdatedIssues = issues.filter((i) => /copyright|viewport|construction|meta description|minimal content|diy website builder/i.test(i));

  if (noSite) add("no_site", W.noSite, issues[0] || "No website found");
  else if (unreachable) add("unreachable", W.unreachable, "Website does not load");
  if (unsecure) add("unsecure", W.unsecure, issues.find((i) => /https|ssl|secure/i.test(i)) || "No working HTTPS");
  if (outdatedIssues.length) add("outdated", Math.min(W.outdatedCap, outdatedIssues.length * W.outdatedEach), outdatedIssues.slice(0, 2).join("; "));

  const siteWorks = !noSite && !unreachable;
  // `absent` is deliberately strict: only an explicit `false` counts. `null` (past the
  // truncation cut) and `undefined` (never checked) both mean "we do not know", and we
  // do not sell against something we do not know.
  const absent = (v) => v === false;
  if (siteWorks && sig.read) {
    if (absent(sig.booking) && BOOKS_APPOINTMENTS.has(trait)) {
      add("no_booking", W.noBooking, trait === "reservation"
        ? "No online reservations or ordering on their homepage — every table goes through the phone"
        : "No online booking on their homepage — every appointment goes through the phone");
    }
    if (absent(sig.chat) && absent(sig.contactForm) && PHONE_RUN.has(trait)) {
      add("no_after_hours", W.noAfterHours, "Phone is the only way in — no chat, no contact form, nothing catches a missed call");
    }
    if (absent(sig.ecommerce) && SELLS_GOODS.has(trait)) {
      add("no_ecommerce", W.noEcommerce, trait === "reservation"
        ? "Nothing on the site takes an order or a payment — every sale happens in person"
        : "No storefront on the site — nothing can be bought online");
    }
    if (absent(sig.title)) add("no_title", W.noTitle, "No page title — nothing for search results to show");
    if (absent(sig.description)) add("no_description", W.noDescription, "No meta description");
    if (absent(sig.analytics)) add("no_analytics", W.noAnalytics, "No analytics or tracking installed — no idea what the site is doing");
    if (absent(sig.schema)) add("no_schema", W.noSchema, "No structured data (LocalBusiness schema) — invisible to rich results");
    if (absent(sig.h1)) add("no_h1", W.noH1, "No H1 heading");
    if (absent(sig.ogTags)) add("no_og", W.noOg, "No social share tags");
    if (absent(sig.canonical)) add("no_canonical", W.noCanonical, "No canonical URL");
    if (opts.hasSitemap === false) add("no_sitemap", W.noSitemap, "No sitemap.xml");
  }

  const score = Math.min(100, evidence.reduce((s, e) => s + e.points, 0));
  const has = (k) => evidence.some((e) => e.key === k);
  const why = (k) => (evidence.find((e) => e.key === k) || {}).text || "";
  const seoGaps = evidence.filter((e) => AREA_OF[e.key] === "seo");
  const areas = new Set(evidence.map((e) => AREA_OF[e.key]).filter(Boolean));

  // ---- scale ---------------------------------------------------------------------
  // Only ever read from a page. These do not score points — they are not gaps, they
  // are facts about how big the engagement is — but they decide which tier is honest.
  const present = (v) => v === true;
  const scale = [];
  if (present(sig.reseller)) scale.push("They sell through dealers/franchisees or advertise white-label — platform scale, not a single site");
  if (present(sig.multiLocation)) scale.push("More than one location on the site");
  if (present(sig.portal)) scale.push("They already run a customer/patient portal — there is an app here, not just a site");
  if (present(sig.careers)) scale.push("Actively hiring — internal process worth automating");

  // ---- tier ----------------------------------------------------------------------
  // The site's own copy is the rule. Starter is "one focused deliverable — not a
  // bundle." Growth is those things "wired together." Agency is white-label /
  // dedicated-team scale. So: count independent gap areas, and let scale override.
  let tier = "starter";
  let tierWhy = "";
  // Agency is white-label / dedicated-team scale. Reseller language proves it outright.
  // Multiple locations only reach it when the work is already broad — a two-location
  // boutique missing analytics and a cart is a Growth build, not a $5,000 platform.
  if (present(sig.reseller) || (present(sig.multiLocation) && areas.size >= 3)) {
    tier = "agency";
    tierWhy = present(sig.reseller)
      ? "They resell through others, so the build is a platform with white-label on it, not a website."
      : `Multiple locations and ${areas.size} separate gaps — one site does not cover it.`;
  } else if (areas.size >= 3 || (areas.size >= 2 && (present(sig.portal) || present(sig.multiLocation)))) {
    tier = "growth";
    tierWhy = `${areas.size} separate gaps (${[...areas].join(", ")}) — Starter is one deliverable, so this is a Growth build.`;
  }

  // ---- pick the offer ------------------------------------------------------------
  // Sell the biggest real gap, never a bigger one than the evidence supports. A
  // working site is never pitched a rebuild.
  let offer, reason, addon = null;

  if (!evidence.length) {
    offer = null;
    reason = sig.read
      ? "Site is current, secure, tracked, sells and takes bookings — nothing we sell fixes anything we can verify."
      : "Could not read the site — no verified gap.";
  } else if (tier === "agency") {
    offer = "agency-platform";
    reason = `${tierWhy} ${evidence.slice(0, 2).map((e) => e.text).join("; ")}.`;
  } else if (tier === "growth") {
    offer = "growth-platform";
    reason = `${tierWhy} ${evidence.slice(0, 3).map((e) => e.text).join("; ")}.`;
  } else if (!siteWorks) {
    // They have nowhere to send anyone. The only question is what ships with the site.
    if (BOOKS_APPOINTMENTS.has(trait)) {
      offer = "website-booking";
      reason = `${why("no_site") || why("unreachable")} — and ${trait === "reservation" ? "reservations" : "appointments"} are the business, so the site ships with booking wired in.`;
    } else {
      offer = "website-addon";
      addon = PHONE_RUN.has(trait) ? "Call answering" : SELLS_GOODS.has(trait) ? "Online storefront" : "Analytics + tracking";
      reason = `${why("no_site") || why("unreachable")} — a custom site plus one add-on is the smallest real build.`;
    }
  } else if (unsecure || has("outdated")) {
    if (BOOKS_APPOINTMENTS.has(trait) && absent(sig.booking)) {
      offer = "website-booking";
      reason = `${why("unsecure") || why("outdated")} — and there is no online booking, so the rebuild ships with it.`;
    } else {
      offer = "website-addon";
      addon = has("no_ecommerce") ? "Online storefront" : seoGaps.length ? "SEO + analytics" : "Automation of their choice";
      reason = `${why("unsecure") || why("outdated")} — the site needs rebuilding, plus one add-on.`;
    }
  } else if (has("no_after_hours") && !has("no_booking")) {
    offer = "ai-receptionist";
    reason = `${why("no_after_hours")} — the site is workable, so the gap is call coverage, not a rebuild.`;
  } else if (has("no_booking") && PHONE_RUN.has(trait) && has("no_after_hours")) {
    offer = "ai-receptionist";
    reason = `${why("no_booking")} ${why("no_after_hours")} — the receptionist covers both without touching the site.`;
  } else if (has("no_ecommerce") && !seoGaps.length && !has("no_booking")) {
    // The site is otherwise sound; what is missing is the ability to sell.
    offer = "website-addon";
    addon = "Online storefront";
    reason = `${why("no_ecommerce")} — the site works, so this is an add-on, not a rebuild.`;
  } else if (seoGaps.length || has("no_booking") || has("no_ecommerce")) {
    offer = "seo-audit";
    addon = has("no_booking") ? "Booking automation" : has("no_ecommerce") ? "Online storefront" : null;
    reason = seoGaps.length
      ? `Site works, but ${seoGaps.slice(0, 3).map((e) => e.text.toLowerCase()).join("; ")}.`
      : why("no_booking") || why("no_ecommerce");
  } else {
    offer = null;
    reason = "Nothing we sell fixes anything we could verify.";
  }

  // ---- service line --------------------------------------------------------------
  // What SHAPE the project is, in the language of /appointment/. Independent of tier.
  let serviceLine = null;
  if (offer) {
    if (has("no_ecommerce") || (present(sig.ecommerce) && (unsecure || has("outdated")))) serviceLine = "ecommerce";
    else if (present(sig.portal)) serviceLine = "product-ui";
    else if (!siteWorks || unsecure || has("outdated")) serviceLine = "brand-site";
    else serviceLine = "design-care";
  }

  // Alternates: every OTHER offer we have real evidence for, so a rep who gets a
  // "not interested" on the headline pitch has somewhere honest to go. Carried as
  // {id,label} pairs so the CRM can render them without knowing the catalogue.
  const alternates = [];
  if (offer) {
    const alt = (id) => { if (id !== offer && !alternates.some((a) => a.id === id)) alternates.push({ id, label: OFFERS[id].label }); };
    if (has("no_after_hours")) alt("ai-receptionist");
    if (seoGaps.length >= 2) alt("seo-audit");
    if (has("no_booking") && siteWorks) alt("website-booking");
    if (has("no_ecommerce")) alt("website-addon");
    // A Starter lead with three areas of evidence is worth showing Growth against.
    if (tier === "starter" && areas.size >= 2) alt("growth-platform");
  }

  const qualified = !!offer && score >= minScore;
  return {
    qualified, score, minScore, trait,
    // Tier + price, so the card shows what it costs without the CRM knowing pricing.
    tier, tier_label: TIERS[tier].label, price: TIERS[tier].price, tier_why: tierWhy || null,
    // `option` is the pre-2026-08-01 field name; kept so stored leads and the CRM
    // keep working. `offer` is the same value under the name the catalogue uses now.
    offer, option: offer,
    label: offer ? OFFERS[offer].label : null,
    short: offer ? OFFERS[offer].short : null,
    blurb: offer ? OFFERS[offer].blurb : null,
    service_line: serviceLine,
    service_line_label: serviceLine ? SERVICE_LINES[serviceLine].label : null,
    service_line_from: serviceLine ? SERVICE_LINES[serviceLine].from : null,
    why: reason, addon, alternates,
    gap_areas: [...areas],
    scale,
    evidence: evidence.map((e) => e.text),
    signals: sig.read ? sig : null,
  };
}
