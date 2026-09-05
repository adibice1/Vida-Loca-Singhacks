# Remaining Work — Two Independent Codex Instances

The shared backend is complete on `main`. Run the two remaining workflows concurrently in **two separate Codex instances**, each using its own branch or worktree.

The workflows are intentionally segmented:

- **Instance A builds only the frontend.** It uses the existing simulation backend and does not need Instance B to run.
- **Instance B verifies only the live XRPL path and records pitch evidence.** It calls the APIs directly and does not need the frontend.

Both instances must start from the same latest `main` commit. Do not edit files assigned to the other workflow, and do not change the frozen API contract in `PARALLEL_WORKFLOWS.md`.

---

## Workflow A — Frontend Pitch Experience

### Codex instance

- Branch: `codex/frontend`
- Working mode: simulation backend
- Depends on: backend already committed to `main`
- Does not depend on: Workflow B, Testnet wallets, or an LLM key

### Exclusive ownership

Workflow A may edit only:

```text
public/index.html
public/app.js
public/styles.css
```

It must not edit:

```text
server.mjs
test.mjs
package.json
package-lock.json
.env.example
README.md
PARALLEL_WORKFLOWS.md
REMAINING_WORKFLOWS.md
TESTNET_EVIDENCE.md
```

### Starting commands

```bash
git switch main
git pull origin main
git switch -c codex/frontend
npm install
npm test
npm start
```

Open `http://localhost:3000`. The existing server supplies the simulation API and serves `public/` automatically.

### Codex prompt

```text
Complete Workflow A from REMAINING_WORKFLOWS.md.

You exclusively own public/index.html, public/app.js, and public/styles.css.
Do not edit any other file.

Build a polished, responsive, accessible SignalSlice pitch interface against
the frozen API contract in PARALLEL_WORKFLOWS.md and the backend already on main.

The journey must:
1. Accept a market-intelligence objective and XRP-drop budget.
2. Render clarification questions returned by POST /api/quotes.
3. Resubmit the refined sector, region, and freshness scope.
4. Show free match count, freshness, fields, and redacted sample metadata.
5. Render all packet options and mark the backend's recommendation.
6. Disable options outside the signed budget.
7. Call POST /api/purchases/:quoteId for the selected affordable tier.
8. Show policy check, x402 challenge, XRPL settlement, and delivery stages.
9. Render delivered records, source, licence, artifact hash, amount, and explorer link.
10. Clearly and prominently label transparent simulation mode.

Keep wallet seeds and API keys out of browser code, storage, logs, and the DOM.
Use plain HTML, CSS, and JavaScript; add no dependency or build step.
Verify the complete simulation journey manually, run npm test, then commit only public/.
```

### Acceptance checks

- Ambiguous objective: `Find resilient suppliers for our expansion`.
- Budget: `3000` drops.
- Clarification answers: `semiconductors`, `southeast-asia`, `90` days.
- Recommended packet: `focused` at `2500` drops.
- Full packet: visible but disabled as over budget.
- Successful simulated purchase: three delivered records.
- Simulation hash: never linked or described as a real XRPL transaction.
- Layout works on mobile and desktop with keyboard-visible focus and status announcements.
- `npm test` passes.

### Finish

```bash
git add public
git commit -m "feat: add SignalSlice pitch interface"
git push origin codex/frontend
```

---

## Workflow B — XRPL Testnet Verification and Pitch Evidence

### Codex instance

- Branch: `codex/xrpl-verification`
- Working mode: real XRPL Testnet
- Depends on: backend already committed to `main`
- Does not depend on: Workflow A or any frontend file

### Exclusive ownership

Workflow B may edit only:

```text
server.mjs
test.mjs
.env.example
README.md
TESTNET_EVIDENCE.md
```

It may create and use `.env` locally, but `.env` must remain untracked.

It must not edit:

```text
public/index.html
public/app.js
public/styles.css
package.json
package-lock.json
PARALLEL_WORKFLOWS.md
REMAINING_WORKFLOWS.md
```

### Starting commands

```bash
git switch main
git pull origin main
git switch -c codex/xrpl-verification
npm install
npm test
```

### Codex prompt

```text
Complete Workflow B from REMAINING_WORKFLOWS.md.

You own only server.mjs, test.mjs, .env.example, README.md, and
TESTNET_EVIDENCE.md. You may use an untracked .env locally. Never edit public/,
package files, or either workflow document.

Use the installed xrpl-agentic-resources skill and XRPL Agent Wallet/Payment
guidance. Verify the existing x402 flow on XRPL Testnet without waiting for the
frontend.

1. Create or use separate funded Testnet buyer and merchant wallets.
2. Write seeds directly to untracked .env; never print or place them in chat.
3. Configure LIVE_XRPL=true, xrpl:1, and the hosted Testnet facilitator.
4. Start the backend and use direct HTTP calls to create a scoped quote.
5. Confirm a 3000-drop mandate rejects the 5000-drop full packet before payment.
6. Purchase the 2500-drop focused packet through x402.
7. Verify validated settlement, transaction hash, explorer URL, amount, source
   tag 20260530, and delivery of exactly three records.
8. Retry the same completed purchase and verify it does not pay twice.
9. Record only public evidence in TESTNET_EVIDENCE.md: date, network, amount,
   transaction hash, explorer link, delivered packet ID, and artifact hash.
10. If the live path fails because of backend code, apply the smallest fix that
    preserves the frozen API contract and add one regression check.
11. Update README.md only when live setup or verified behavior differs from it.
12. Run npm test and commit only owned files. Never commit .env or wallet seeds.
```

### Acceptance checks

- Both wallets are funded on XRPL Testnet, never Mainnet.
- Invalid or expired quote cannot trigger settlement.
- Over-budget packet returns HTTP `409` before payment.
- Affordable packet completes a real x402 exact payment.
- Transaction result is validated `tesSUCCESS`.
- Transaction uses source tag `20260530`.
- Response contains a real transaction hash and Testnet explorer URL.
- Paid response delivers exactly three records plus provenance, licence, timestamp, and artifact hash.
- Repeating the completed purchase returns the same delivery without a second transaction.
- `TESTNET_EVIDENCE.md` contains no seed, API key, private data, or fabricated result.
- `npm test` passes.

### Finish

```bash
git add server.mjs test.mjs .env.example README.md TESTNET_EVIDENCE.md
git commit -m "test: verify SignalSlice XRPL payment flow"
git push origin codex/xrpl-verification
```

If only `TESTNET_EVIDENCE.md` changed, stage and commit only that file.

---

## Merge and final integration gate

Run this only after both Codex instances finish. It is not part of either parallel workflow.

1. Review and merge `codex/xrpl-verification` into `main`.
2. Review and merge `codex/frontend` into `main`.
3. Pull the merged `main` and run `npm test`.
4. Run the complete browser journey once in simulation mode.
5. Use the local untracked Testnet `.env` and run one browser purchase in live mode.
6. Confirm the UI links to a real validated transaction and shows the delivered packet.
7. Use the journey and evidence as the pitch demonstration.

The branches should merge without file conflicts because their ownership sets do not overlap. A backend response-shape change is not allowed during parallel execution; if one is unavoidable, stop both workflows and update the frozen contract first.
