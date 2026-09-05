# SignalSlice Parallel Build Plan

Goal: deliver a pitch-ready market-intelligence demo where a buyer agent refines a request, selects a data packet within budget, pays through x402 on XRPL, and receives the purchased data.

These workflows are designed to run concurrently in **two separate Codex instances** (two independent Codex tasks or sessions):

- Codex instance A receives **Workflow A — Frontend**.
- Codex instance B receives **Workflow B — Backend and XRPL**.

Start both instances from the same `main` commit. Separate Git branches or Codex worktrees are recommended so each instance can commit independently. If both instances use the same checkout, their filesystem changes are immediately shared, so the ownership boundary below must be followed exactly.

**Do not edit files owned by the other workflow.** The frozen API contract below is the only coordination point required while both Codex instances work.

## Ownership boundary

| Workflow | Exclusive file ownership |
| --- | --- |
| Frontend | `public/index.html`, `public/app.js`, `public/styles.css` |
| Backend | `server.mjs`, `test.mjs`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `README.md` |

If another file appears necessary, stop and assign it to exactly one workflow before editing it. Neither workflow should reformat, rename, delete, or revert files owned by the other.

## Frozen API contract

The frontend builds against this contract without reading or changing backend implementation files.

### `GET /api/catalog`

Returns the service name, payment mode, currency, and available packet definitions.

### `POST /api/quotes`

Request:

```json
{
  "objective": "Find resilient suppliers for our expansion",
  "budgetDrops": 3000,
  "sector": "semiconductors",
  "region": "southeast-asia",
  "freshnessDays": 90
}
```

`sector`, `region`, and `freshnessDays` are optional on the first request. An ambiguous request returns `clarifications`. A complete request returns:

```json
{
  "id": "quote-id",
  "understanding": {
    "sector": "semiconductors",
    "region": "southeast-asia",
    "summary": "...",
    "constraints": [],
    "engine": "..."
  },
  "clarifications": [],
  "options": [
    {
      "id": "focused",
      "name": "Focused shortlist",
      "count": 3,
      "priceDrops": 2500,
      "price": "0.002500 XRP",
      "description": "...",
      "withinBudget": true
    }
  ],
  "recommendedId": "focused",
  "rationale": "...",
  "preview": {
    "matches": 3,
    "fields": ["company", "country", "risk", "growth", "signal", "evidence"],
    "freshestDays": 8,
    "sample": {}
  }
}
```

### `POST /api/purchases/:quoteId`

Request:

```json
{ "tier": "focused" }
```

Success returns payment mode, transaction information, and the unlocked data packet. A packet above the signed budget returns HTTP `409` with `recommendedId`.

```json
{
  "mode": "XRPL Testnet",
  "transaction": "TRANSACTION_HASH",
  "explorerUrl": "https://testnet.xrpl.org/transactions/TRANSACTION_HASH",
  "amount": "0.002500 XRP",
  "data": {
    "packetId": "...",
    "objective": "...",
    "scope": {},
    "generatedAt": "...",
    "source": "...",
    "license": "...",
    "records": [],
    "artifactHash": "..."
  }
}
```

### Errors

All non-success responses use:

```json
{ "error": "Human-readable message" }
```

## Workflow A — Frontend

### Deliverable

A polished, responsive pitch interface that makes the commercial loop obvious without exposing wallet secrets.

### Tasks

1. Create an objective-and-budget entry screen with a strong SignalSlice value proposition.
2. Render clarification questions returned by `/api/quotes`, then resubmit the refined request.
3. Show free preview metadata: match count, freshness, included fields, and a redacted sample.
4. Display all packet options, clearly marking the recommendation and disabling options outside the budget.
5. On purchase, show the agent stages: policy check, x402 challenge, XRPL settlement, and data delivery.
6. Render the delivered records, licence, artifact hash, amount, and transaction explorer link.
7. Label simulation mode prominently; never present a simulated hash as an on-chain transaction.
8. Provide accessible labels, keyboard focus states, status announcements, error states, and mobile layout.

### Frontend acceptance checks

- The full flow works using only the frozen API responses.
- An ambiguous request visibly triggers clarification.
- A 3,000-drop budget recommends the 2,500-drop focused packet and disables the 5,000-drop packet.
- Network and API failures leave the form recoverable.
- No wallet seed or API key appears in browser code, storage, logs, or the DOM.

## Workflow B — Backend and XRPL

### Deliverable

A small Express service with deterministic demo data, optional LLM request parsing, budget controls, x402-protected data routes, real XRPL Testnet settlement, and a transparent simulation fallback.

### Tasks

1. Finalize validation and quote expiry for `/api/quotes`.
2. Keep pricing deterministic: pulse 1,000 drops; focused 2,500 drops; full 5,000 drops.
3. Return clarification questions instead of guessing missing sector or region.
4. Enforce the signed budget again before any payment attempt.
5. Protect each paid packet route with `x402-xrpl` and bind it to the quote.
6. Use XRPL Testnet by default for live mode and apply XRPL AI Starter Kit `SourceTag` `20260530`.
7. Prevent duplicate purchase attempts from causing duplicate payments; repeated completed requests return the same delivery.
8. Keep synthetic data explicitly labelled and return provenance, licence, timestamp, and artifact hash.
9. Cover clarification and budget selection with the smallest runnable Node test.
10. Write `README.md` with simulation setup, live Testnet setup, optional LLM setup, demo script, architecture, security limitations, and production RLUSD direction.

### Backend acceptance checks

- `npm install`, `npm test`, and `npm start` succeed on a clean checkout.
- The app runs without credentials in transparent simulation mode.
- `LIVE_XRPL=true` fails fast when either wallet setting is absent.
- A paid endpoint returns no data before a valid x402 payment in live mode.
- The server never returns or logs wallet seeds or API keys.
- A successful live response includes a real Testnet transaction hash and explorer URL.

## Integration gate

After both workflows finish, run only these shared checks; do not perform cross-workflow cleanup:

1. Backend: `npm test`.
2. Backend: `npm start`.
3. Frontend: complete one ambiguous-request simulation from request through delivery.
4. Full stack: complete one XRPL Testnet purchase and open its explorer link.
5. Compare browser requests and responses with the frozen contract above.

Any contract change must be agreed first, recorded in this file by one designated owner, and then implemented independently in each workflow's owned files.
