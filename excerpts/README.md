# Excerpts

Three files from the private Dime Data lead-engine source at commit 9ed7e4c. Each is one or more
slices of a real file, copied unchanged apart from a header; where code between slices is left out,
the file says so with `[...]`.

| File | Why it's here |
|---|---|
| [`evidence-scoring.js`](evidence-scoring.js) | The enterprise engine's core idea. Every size claim carries the tier of evidence behind it (filed, verified, derived, estimated, none), and FIT is capped by that tier. `estimated` and `none` cap below the gate, so a lead sized only by a model's guess can't reach a rep. Intent needs a pattern: one high-weight event, or two independent signals. |
| [`starter-offers.js`](starter-offers.js) | The local engine's screen. Each observed gap carries a weight; a floor of 30 is set so the thinnest sellable thing clears it and nothing thinner does. The tier is chosen by counting independent gap areas, not by guessing budget, and anything not read off a page scores nothing. |
| [`suppression.js`](suppression.js) | Phone numbers normalised to digits and a suppression index built once per sweep, so a do-not-call number is caught whichever source formatted it. |

These files aren't licensed for reuse. They're here to show how the product is built.
