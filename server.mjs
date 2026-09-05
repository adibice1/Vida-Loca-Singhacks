import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";

const SOURCE_TAG = 20260530;
const QUOTE_TTL_MS = 10 * 60 * 1000;
const PACKAGES = [
  { id: "pulse", name: "Signal pulse", count: 1, priceDrops: 1000, description: "One best-fit company with core evidence" },
  { id: "focused", name: "Focused shortlist", count: 3, priceDrops: 2500, description: "Three ranked companies with risk and growth signals" },
  { id: "full", name: "Decision packet", count: 6, priceDrops: 5000, description: "Full matched set with evidence and commercial context" },
];

// Synthetic pitch data: no real-company claim is implied.
const DATA = [
  { company: "Meridian MicroSystems", country: "Singapore", region: "southeast-asia", sector: "semiconductors", risk: 18, growth: 91, ageDays: 8, signal: "New advanced-packaging line scheduled for Q4", evidence: "Capacity filing and verified hiring activity" },
  { company: "Penang Precision Labs", country: "Malaysia", region: "southeast-asia", sector: "semiconductors", risk: 24, growth: 86, ageDays: 12, signal: "Clean-room footprint expanded by 22%", evidence: "Planning permit and supplier shipment records" },
  { company: "Archipelago Circuits", country: "Indonesia", region: "southeast-asia", sector: "semiconductors", risk: 39, growth: 78, ageDays: 21, signal: "Signed two automotive qualification programs", evidence: "Certification registry and trade records" },
  { company: "Saigon Substrate Works", country: "Vietnam", region: "southeast-asia", sector: "semiconductors", risk: 29, growth: 83, ageDays: 17, signal: "High-density substrate pilot reached qualification", evidence: "Patent activity and equipment import records" },
  { company: "Johor Test Systems", country: "Malaysia", region: "southeast-asia", sector: "semiconductors", risk: 22, growth: 80, ageDays: 25, signal: "Added two automotive test cells", evidence: "Industrial permit and recruitment feed" },
  { company: "Batam Advanced Assembly", country: "Indonesia", region: "southeast-asia", sector: "semiconductors", risk: 36, growth: 74, ageDays: 32, signal: "New export-zone facility began trial production", evidence: "Customs records and facility inspection notice" },
  { company: "Mekong Freight Intelligence", country: "Vietnam", region: "southeast-asia", sector: "logistics", risk: 27, growth: 88, ageDays: 9, signal: "Cross-border cold-chain capacity increased", evidence: "Fleet registry and port throughput feed" },
  { company: "Straits Autonomous Logistics", country: "Singapore", region: "southeast-asia", sector: "logistics", risk: 20, growth: 82, ageDays: 15, signal: "Autonomous yard pilot moved into production", evidence: "Tender award and operating licence" },
  { company: "Siam Grid Storage", country: "Thailand", region: "southeast-asia", sector: "renewables", risk: 31, growth: 89, ageDays: 6, signal: "Awarded 180 MWh storage interconnection", evidence: "Grid queue and award notice" },
  { company: "Luzon Solar Components", country: "Philippines", region: "southeast-asia", sector: "renewables", risk: 34, growth: 76, ageDays: 28, signal: "Second module facility entered commissioning", evidence: "Import records and commissioning permit" },
  { company: "Pacific Wafer Services", country: "Japan", region: "asia-pacific", sector: "semiconductors", risk: 14, growth: 73, ageDays: 18, signal: "Specialty-node utilization reached 92%", evidence: "Quarterly filing and equipment orders" },
];

const hash = (value) => createHash("sha256").update(value).digest("hex");
const xrp = (drops) => `${(drops / 1_000_000).toFixed(6)} XRP`;

function fallbackUnderstanding(objective) {
  const text = objective.toLowerCase();
  const sector = text.match(/chip|semiconductor|wafer|packaging/) ? "semiconductors"
    : text.match(/freight|logistic|shipping|supply chain/) ? "logistics"
      : text.match(/solar|renewable|battery|energy/) ? "renewables" : "all";
  const region = text.match(/southeast|singapore|malaysia|vietnam|thailand|philippines|indonesia/) ? "southeast-asia"
    : text.match(/asia|japan|korea/) ? "asia-pacific" : "global";
  return {
    sector,
    region,
    summary: objective,
    constraints: [],
    engine: "deterministic fallback",
  };
}

async function understandObjective(objective) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return fallbackUnderstanding(objective);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL,
        store: false,
        instructions: "Extract a market-intelligence purchasing request. Do not invent facts. Use 'all' or 'global' when unspecified.",
        input: objective,
        text: { format: { type: "json_schema", name: "market_request", strict: true, schema: {
          type: "object",
          properties: {
            sector: { type: "string", enum: ["semiconductors", "logistics", "renewables", "all"] },
            region: { type: "string", enum: ["southeast-asia", "asia-pacific", "global"] },
            summary: { type: "string" },
            constraints: { type: "array", items: { type: "string" } },
          },
          required: ["sector", "region", "summary", "constraints"],
          additionalProperties: false,
        } } },
      }),
    });
    if (!response.ok) throw new Error(`Responses API returned ${response.status}`);
    const parsed = JSON.parse((await response.json()).output_text);
    return { ...parsed, engine: process.env.OPENAI_MODEL };
  } catch (error) {
    return { ...fallbackUnderstanding(objective), engine: `fallback (${error.message})` };
  }
}

export function makeQuote({ objective, budgetDrops, sector, region, freshnessDays }, understanding = fallbackUnderstanding(objective)) {
  const chosenSector = sector || understanding.sector;
  const chosenRegion = region || understanding.region;
  const clarifications = [];
  if (!sector && chosenSector === "all") clarifications.push({ field: "sector", question: "Which market should I search?" });
  if (!region && chosenRegion === "global") clarifications.push({ field: "region", question: "Which operating region matters?" });
  if (clarifications.length) return { understanding, clarifications };

  const maxAge = Number(freshnessDays || 90);
  const matches = DATA.filter((row) =>
    (chosenSector === "all" || row.sector === chosenSector)
    && (chosenRegion === "global" || row.region === chosenRegion || (chosenRegion === "asia-pacific" && row.region === "southeast-asia"))
    && row.ageDays <= maxAge,
  ).sort((a, b) => (b.growth - b.risk) - (a.growth - a.risk));

  const options = PACKAGES.map((item) => ({
    ...item,
    count: Math.min(item.count, matches.length),
    price: xrp(item.priceDrops),
    withinBudget: item.priceDrops <= budgetDrops,
  })).filter((item) => item.count > 0);
  const affordable = options.filter((item) => item.withinBudget);
  const recommended = affordable.at(-1) || options[0];
  return {
    understanding: { ...understanding, sector: chosenSector, region: chosenRegion },
    clarifications: [],
    options,
    recommendedId: recommended?.id,
    rationale: affordable.length
      ? `Selected ${recommended.name.toLowerCase()} for the strongest coverage inside your ${xrp(budgetDrops)} mandate.`
      : `The smallest packet exceeds your ${xrp(budgetDrops)} mandate. Increase it to ${options[0]?.price || "the quoted minimum"}.`,
    preview: {
      matches: matches.length,
      fields: ["company", "country", "risk", "growth", "signal", "evidence"],
      freshestDays: matches.length ? Math.min(...matches.map((row) => row.ageDays)) : null,
      sample: matches[0] ? { company: "REDACTED", country: matches[0].country, sector: matches[0].sector, signal: "Available after settlement" } : null,
    },
    matches,
  };
}

export async function createApp() {
  const app = express();
  const quotes = new Map();
  const purchases = new Map();
  const pending = new Set();
  const paymentGates = new Map();
  const live = process.env.LIVE_XRPL === "true";
  let fetchPaid;
  let decodePaymentResponseHeader;

  if (live) {
    if (!process.env.XRPL_PAY_TO || !process.env.XRPL_BUYER_SEED) throw new Error("LIVE_XRPL=true requires XRPL_PAY_TO and XRPL_BUYER_SEED");
    const [{ requirePayment }, x402, { Wallet }] = await Promise.all([
      import("x402-xrpl/express"), import("x402-xrpl"), import("xrpl"),
    ]);
    decodePaymentResponseHeader = x402.decodePaymentResponseHeader;
    fetchPaid = x402.x402Fetch({ wallet: Wallet.fromSeed(process.env.XRPL_BUYER_SEED), network: process.env.XRPL_NETWORK || "xrpl:1" });
    for (const packet of PACKAGES) {
      paymentGates.set(packet.id, requirePayment({
        path: `/api/paid/${packet.id}`,
        price: String(packet.priceDrops),
        payToAddress: process.env.XRPL_PAY_TO,
        network: process.env.XRPL_NETWORK || "xrpl:1",
        facilitatorUrl: process.env.XRPL_FACILITATOR_URL || "https://xrpl-facilitator-testnet.t54.ai",
        asset: "XRP",
        resource: `signalslice:${packet.id}`,
        description: packet.description,
        extra: { sourceTag: SOURCE_TAG },
      }));
    }
  }

  app.use(express.json({ limit: "16kb" }));
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "public")));

  app.get("/api/catalog", (_req, res) => res.json({
    name: "SignalSlice Market Intelligence",
    network: live ? (process.env.XRPL_NETWORK || "xrpl:1") : "simulation",
    currency: live ? "Testnet XRP" : "simulated Testnet XRP",
    products: PACKAGES.map(({ id, name, priceDrops, description }) => ({ id, name, priceDrops, price: xrp(priceDrops), description })),
  }));

  app.post("/api/quotes", async (req, res) => {
    const objective = String(req.body.objective || "").trim();
    const budgetDrops = Number(req.body.budgetDrops);
    if (objective.length < 12 || objective.length > 600) return res.status(400).json({ error: "Objective must be 12–600 characters." });
    if (!Number.isInteger(budgetDrops) || budgetDrops < 500 || budgetDrops > 100_000) return res.status(400).json({ error: "Budget must be 500–100,000 drops." });
    if (req.body.sector && !["semiconductors", "logistics", "renewables", "all"].includes(req.body.sector)) return res.status(400).json({ error: "Unknown sector." });
    if (req.body.region && !["southeast-asia", "asia-pacific", "global"].includes(req.body.region)) return res.status(400).json({ error: "Unknown region." });
    if (req.body.freshnessDays && ![30, 90, 180].includes(Number(req.body.freshnessDays))) return res.status(400).json({ error: "Freshness must be 30, 90, or 180 days." });
    const understanding = await understandObjective(objective);
    const quote = makeQuote({ ...req.body, objective, budgetDrops }, understanding);
    if (quote.clarifications.length) return res.json(quote);
    const id = randomUUID();
    const stored = { ...quote, id, objective, budgetDrops, createdAt: Date.now() };
    quotes.set(id, stored);
    const { matches, ...safeQuote } = stored;
    res.json(safeQuote);
  });

  const validateQuote = (req, res, next) => {
    const quote = quotes.get(String(req.query.quote || ""));
    const option = quote?.options.find((item) => item.id === req.params.tier);
    if (!quote || Date.now() - quote.createdAt > QUOTE_TTL_MS) return res.status(410).json({ error: "Quote missing or expired." });
    if (!option) return res.status(400).json({ error: "Packet is not available for this quote." });
    req.quote = quote;
    req.option = option;
    next();
  };

  const requireLivePayment = (req, res, next) => live ? paymentGates.get(req.params.tier)(req, res, next) : next();

  app.get("/api/paid/:tier", validateQuote, requireLivePayment, (req, res) => {
    const records = req.quote.matches.slice(0, req.option.count);
    const packet = {
      packetId: `${req.quote.id}:${req.option.id}`,
      objective: req.quote.objective,
      scope: { sector: req.quote.understanding.sector, region: req.quote.understanding.region },
      generatedAt: new Date().toISOString(),
      source: "Vida Loca proprietary feed - synthetic demo dataset",
      license: "Single-company internal evaluation; no redistribution",
      records,
    };
    res.json({ ...packet, artifactHash: hash(JSON.stringify(packet)) });
  });

  app.post("/api/purchases/:quoteId", async (req, res) => {
    const quote = quotes.get(req.params.quoteId);
    const tier = String(req.body.tier || "");
    const option = quote?.options.find((item) => item.id === tier);
    if (!quote || Date.now() - quote.createdAt > QUOTE_TTL_MS) return res.status(410).json({ error: "Quote missing or expired." });
    if (!option) return res.status(400).json({ error: "Unknown packet." });
    if (!option.withinBudget) return res.status(409).json({ error: "This packet exceeds the agent's signed budget mandate.", recommendedId: quote.recommendedId });
    const key = `${quote.id}:${tier}`;
    if (purchases.has(key)) return res.json(purchases.get(key));
    if (pending.has(key)) return res.status(409).json({ error: "This purchase is already settling." });
    pending.add(key);
    try {
      let data;
      let transaction;
      const resourceUrl = `http://127.0.0.1:${req.socket.localPort}/api/paid/${tier}?quote=${quote.id}`;
      if (live) {
        const response = await fetchPaid(resourceUrl, { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`Paid resource returned HTTP ${response.status}: ${await response.text()}`);
        data = await response.json();
        const encoded = response.headers.get("payment-response");
        transaction = encoded ? decodePaymentResponseHeader(encoded).transaction : null;
      } else {
        data = await new Promise((resolve) => setTimeout(async () => {
          const response = await fetch(resourceUrl);
          resolve(response.json());
        }, 650));
        transaction = hash(`simulation:${key}`).toUpperCase();
      }
      const result = {
        mode: live ? "XRPL Testnet" : "transparent simulation",
        transaction,
        explorerUrl: live && transaction ? `https://testnet.xrpl.org/transactions/${transaction}` : null,
        amount: option.price,
        data,
      };
      purchases.set(key, result);
      res.json(result);
    } catch (error) {
      res.status(502).json({ error: error.message });
    } finally {
      pending.delete(key);
    }
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, liveXrpl: live }));
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  const app = await createApp();
  app.listen(port, () => console.log(`SignalSlice listening at http://localhost:${port}`));
}
