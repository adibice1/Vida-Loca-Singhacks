import test from "node:test";
import assert from "node:assert/strict";
import { makeQuote } from "./server.mjs";

test("agent selects the richest packet inside the budget", () => {
  const quote = makeQuote({
    objective: "Find semiconductor suppliers in Southeast Asia",
    budgetDrops: 3000,
    sector: "semiconductors",
    region: "southeast-asia",
    freshnessDays: 90,
  });
  assert.equal(quote.recommendedId, "focused");
  assert.equal(quote.options.find((option) => option.id === "full").withinBudget, false);
  assert.equal(quote.preview.matches, 6);
});

test("agent asks before guessing an ambiguous scope", () => {
  const quote = makeQuote({ objective: "Find resilient suppliers for our expansion", budgetDrops: 3000 });
  assert.deepEqual(quote.clarifications.map(({ field }) => field), ["sector", "region"]);
});

test("purchase API enforces the quoted budget and delivers an affordable packet", async (t) => {
  const { createApp } = await import("./server.mjs");
  const server = (await createApp()).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const quoteResponse = await fetch(`${baseUrl}/api/quotes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      objective: "Find semiconductor suppliers in Southeast Asia",
      budgetDrops: 3000,
      sector: "semiconductors",
      region: "southeast-asia",
      freshnessDays: 90,
    }),
  });
  const quote = await quoteResponse.json();

  const rejected = await fetch(`${baseUrl}/api/purchases/${quote.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tier: "full" }),
  });
  assert.equal(rejected.status, 409);

  const purchased = await fetch(`${baseUrl}/api/purchases/${quote.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tier: "focused" }),
  });
  const result = await purchased.json();
  assert.equal(purchased.status, 200);
  assert.equal(result.mode, "transparent simulation");
  assert.equal(result.data.records.length, 3);
});
