# AI Context

## Project

Budget Project is a browser-based budget and transaction app with receipt/message ingestion,
Firestore-backed data, and static hosting constraints.

## Domain Terms

- raw message: original SMS, notification, or email receipt payload before parsing.
- transaction: normalized spending or income record stored for the user.
- receipt pipeline: Gmail/MacroDroid ingestion, parsing, enrichment, and transaction creation.
- selection tab: product/choice UI area used for comparison and decision flows.
- data boundary: modules such as `data.js` or server-side Firebase helpers that own reads/writes.

## Defaults For AI Work

- Preserve raw messages; status changes are safer than deletion.
- Keep secrets out of browser code and localStorage.
- Route Firestore access through the established data boundary.
- Treat UI mockups as references, not implementation proof.
- For UI work, verification must exercise the real app flow.

## Vocabulary To Prefer

- Use "planning session", "execution session", and "review session" for AI work phases.
- Use "slice" for one execution-session unit.
- Use "approved plan" for a plan document the user has accepted.

