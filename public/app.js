"use strict";

const state = {
  quote: null,
  selectedOption: null,
  live: false,
  activeStage: null,
};

const panels = ["objectivePanel", "scopePanel", "packetPanel", "settlementPanel", "deliveryPanel"];
const $ = (id) => document.getElementById(id);
const pause = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function announce(message) {
  $("statusRegion").textContent = "";
  window.requestAnimationFrame(() => { $("statusRegion").textContent = message; });
}

function showError(message) {
  $("errorMessage").textContent = message;
  $("errorBanner").hidden = false;
}

function clearError() {
  $("errorBanner").hidden = true;
  $("errorMessage").textContent = "";
}

function prettify(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDrops(drops) {
  return `${Number(drops).toLocaleString("en-US")} drops`;
}

function focusPanel(panel) {
  const heading = panel.querySelector("h3");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
}

function setStep(step) {
  document.querySelectorAll(".progress li").forEach((item) => {
    const itemStep = Number(item.dataset.step);
    item.classList.toggle("is-current", itemStep === step);
    item.classList.toggle("is-complete", itemStep < step);
    if (itemStep === step) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
}

function showPanel(panelId, step, shouldFocus = true) {
  panels.forEach((id) => { $(id).hidden = id !== panelId; });
  setStep(step);
  $("startOverButton").hidden = panelId === "objectivePanel";
  const panel = $(panelId);
  if (shouldFocus) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => focusPanel(panel), reduceMotion ? 0 : 250);
  }
}

function setButtonBusy(button, busy, busyText) {
  const label = button.querySelector("span:first-child");
  if (!button.dataset.label) button.dataset.label = label?.textContent || button.textContent;
  button.disabled = busy;
  button.classList.toggle("is-loading", busy);
  button.setAttribute("aria-busy", String(busy));
  if (label) label.textContent = busy ? busyText : button.dataset.label;
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const bodyText = await response.text();
    let data = {};
    try { data = bodyText ? JSON.parse(bodyText) : {}; }
    catch { throw new Error("The service returned an unreadable response. Please try again."); }

    if (!response.ok) {
      const error = new Error(data.error || `Request failed with HTTP ${response.status}.`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The request took too long. Your inputs are still here—please try again.");
    if (error instanceof TypeError) throw new Error("SignalSlice could not reach the service. Check that the server is running, then try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function setPaymentMode(catalog) {
  state.live = catalog.network !== "simulation";
  const modeBadge = $("modeBadge");
  const notice = $("demoNotice");
  const noticeTitle = notice.querySelector("strong");
  const noticeCopy = notice.querySelector("div span");

  if (state.live) {
    modeBadge.textContent = "XRPL Testnet live";
    modeBadge.classList.add("is-live");
    notice.classList.add("is-live");
    noticeTitle.textContent = "XRPL Testnet mode";
    noticeCopy.textContent = "Purchases can move Testnet XRP and produce a public Testnet transaction. Never use Mainnet credentials for this demo.";
    $("settlementSubtitle").textContent = "Completing an exact x402 payment on XRPL Testnet.";
    $("settlementStageCopy").textContent = "Submitting and validating on Testnet";
    $("settlementFootnote").lastChild.textContent = " This flow uses Testnet XRP only—not assets with real-world value.";
  } else {
    modeBadge.textContent = "Simulation · no real XRP";
  }
}

async function loadCatalog() {
  const connection = $("connectionStatus");
  try {
    const catalog = await requestJson("/api/catalog");
    connection.classList.add("is-online");
    connection.classList.remove("is-offline");
    connection.lastChild.textContent = " Service online";
    setPaymentMode(catalog);
    announce(`${state.live ? "XRPL Testnet" : "Simulation"} mode ready.`);
  } catch (error) {
    connection.classList.add("is-offline");
    connection.classList.remove("is-online");
    connection.lastChild.textContent = " Service offline";
    showError(error.message);
  }
}

function quotePayload(includeScope = false) {
  const payload = {
    objective: $("objective").value.trim(),
    budgetDrops: Number($("budget").value),
  };
  if (includeScope) {
    payload.sector = $("sector").value;
    payload.region = $("region").value;
    payload.freshnessDays = Number($("freshness").value);
  }
  return payload;
}

function prepareScope(quote) {
  const clarifications = new Map((quote.clarifications || []).map((item) => [item.field, item.question]));
  $("sectorQuestion").textContent = clarifications.get("sector") || "Confirm the market inferred from your objective.";
  $("regionQuestion").textContent = clarifications.get("region") || "Confirm the region inferred from your objective.";

  const inferredSector = quote.understanding?.sector;
  const inferredRegion = quote.understanding?.region;
  if (inferredSector && inferredSector !== "all") $("sector").value = inferredSector;
  if (inferredRegion && inferredRegion !== "global") $("region").value = inferredRegion;

  const questionCount = Math.max(clarifications.size, 1);
  $("scopeSummary").textContent = `The agent found ${questionCount === 1 ? "one gap" : `${questionCount} gaps`} it will not guess. Confirm the scope to continue.`;
  showPanel("scopePanel", 2);
  announce(`Clarification needed. ${questionCount} ${questionCount === 1 ? "detail" : "details"} to confirm.`);
}

async function submitQuote(event, includeScope) {
  event.preventDefault();
  clearError();
  const form = includeScope ? $("scopeForm") : $("objectiveForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    announce("Please complete the highlighted fields.");
    return;
  }

  const button = includeScope ? $("scopeSubmit") : $("objectiveSubmit");
  setButtonBusy(button, true, includeScope ? "Building preview…" : "Understanding objective…");
  announce(includeScope ? "Building your free market preview." : "Understanding your objective.");
  try {
    const quote = await requestJson("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(quotePayload(includeScope)),
    });
    if (quote.clarifications?.length) prepareScope(quote);
    else renderQuote(quote);
  } catch (error) {
    showError(error.message);
    announce(`Request failed. ${error.message}`);
  } finally {
    setButtonBusy(button, false, "");
  }
}

function appendDefinitionList(list, values) {
  list.replaceChildren();
  Object.entries(values).forEach(([term, value]) => {
    const group = makeElement("div");
    group.append(makeElement("dt", "", prettify(term)), makeElement("dd", "", prettify(value)));
    list.append(group);
  });
}

function renderPreview(preview) {
  $("matchCount").textContent = Number(preview.matches ?? 0).toLocaleString("en-US");
  $("freshnessValue").textContent = preview.freshestDays == null ? "—" : `${preview.freshestDays}d`;
  $("fieldPills").replaceChildren(...(preview.fields || []).map((field) => makeElement("span", "", prettify(field))));

  const sample = preview.sample || {};
  $("sampleCompany").textContent = sample.company || "REDACTED";
  const safeSample = Object.fromEntries(Object.entries(sample).filter(([key]) => key !== "company"));
  appendDefinitionList($("sampleDetails"), safeSample);
}

function packetCard(option, recommended) {
  const label = makeElement("label", "packet-option");
  label.classList.toggle("is-recommended", recommended);
  label.classList.toggle("is-disabled", !option.withinBudget);

  const radio = makeElement("input");
  radio.type = "radio";
  radio.name = "packet";
  radio.value = option.id;
  radio.disabled = !option.withinBudget;
  radio.setAttribute("aria-label", `${option.name}, ${formatDrops(option.priceDrops)}${recommended ? ", recommended" : ""}${!option.withinBudget ? ", over budget" : ""}`);

  const card = makeElement("span", "packet-card");
  const top = makeElement("span", "packet-card-top");
  top.append(makeElement("span", "packet-id", option.id));
  if (recommended) top.append(makeElement("span", "recommended-pill", "Agent pick"));
  else if (!option.withinBudget) top.append(makeElement("span", "budget-pill", "Over budget"));

  card.append(top);
  card.append(makeElement("h5", "", option.name));
  card.append(makeElement("span", "packet-count", `${option.count} ${option.count === 1 ? "record" : "ranked records"}`));
  card.append(makeElement("p", "packet-description", option.description));

  const price = makeElement("span", "packet-price");
  const priceText = makeElement("span");
  priceText.append(makeElement("strong", "", formatDrops(option.priceDrops)), makeElement("small", "", option.price));
  price.append(priceText, makeElement("span", "radio-dot"));
  card.append(price);
  label.append(radio, card);

  radio.addEventListener("change", () => selectPacket(option));
  return label;
}

function selectPacket(option) {
  state.selectedOption = option;
  document.querySelectorAll(".packet-option").forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("is-selected", input.checked);
  });
  $("selectedSummary").textContent = `${option.name} · ${formatDrops(option.priceDrops)}`;
  $("purchaseButtonText").textContent = `Approve ${formatDrops(option.priceDrops)} & unlock`;
  $("purchaseButton").disabled = false;
  announce(`${option.name} selected for ${formatDrops(option.priceDrops)}.`);
}

function renderQuote(quote) {
  state.quote = quote;
  state.selectedOption = null;
  clearError();

  const understanding = quote.understanding || {};
  $("understandingSummary").textContent = understanding.summary || "Review the free preview, then choose coverage within your mandate.";
  const tags = [understanding.sector, understanding.region, `${$("freshness").value} days`].filter(Boolean);
  $("scopeTags").replaceChildren(...tags.map((tag) => makeElement("span", "", prettify(tag))));
  renderPreview(quote.preview || {});

  const options = Array.isArray(quote.options) ? quote.options : [];
  $("packetOptions").replaceChildren(...options.map((option) => packetCard(option, option.id === quote.recommendedId)));
  $("rationale").textContent = quote.rationale || "Choose the coverage that fits your mandate.";
  $("selectedSummary").textContent = "No affordable packet selected";
  $("purchaseButtonText").textContent = "Approve & unlock";
  $("purchaseButton").disabled = true;

  const recommended = options.find((option) => option.id === quote.recommendedId && option.withinBudget)
    || options.find((option) => option.withinBudget);
  if (recommended) {
    const radio = document.querySelector(`input[name="packet"][value="${CSS.escape(recommended.id)}"]`);
    if (radio) {
      radio.checked = true;
      selectPacket(recommended);
    }
  }

  showPanel("packetPanel", 3);
  announce(`Free preview ready with ${quote.preview?.matches ?? 0} matching companies. ${recommended ? `${recommended.name} is recommended.` : "No packet fits the current budget."}`);
}

function resetStages() {
  state.activeStage = null;
  $("settlementStages").querySelectorAll("li").forEach((item) => {
    item.classList.remove("is-active", "is-complete", "is-error");
    item.querySelector("b").textContent = "Waiting";
  });
}

function setStage(name, status) {
  const stage = $("settlementStages").querySelector(`[data-stage="${name}"]`);
  if (!stage) return;
  stage.classList.remove("is-active", "is-complete", "is-error");
  stage.classList.add(`is-${status}`);
  const statusText = status === "active" ? "In progress" : status === "complete" ? "Complete" : "Failed";
  stage.querySelector("b").textContent = statusText;
  if (status === "active") state.activeStage = name;
  announce(`${stage.querySelector("strong").textContent}: ${statusText}.`);
}

function validExplorerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "testnet.xrpl.org";
  } catch { return false; }
}

function renderRecord(record, index) {
  const card = makeElement("article", "record-card");
  const top = makeElement("div", "record-topline");
  top.append(makeElement("span", "record-rank", `Match ${String(index + 1).padStart(2, "0")}`));
  top.append(makeElement("span", "", `${record.ageDays ?? "—"}d old`));
  card.append(top, makeElement("h5", "", record.company || "Unnamed company"), makeElement("p", "record-country", record.country || "Region unavailable"));

  const scores = makeElement("div", "score-row");
  [["Growth", record.growth], ["Risk", record.risk]].forEach(([label, value]) => {
    const score = makeElement("div", "score");
    score.append(makeElement("span", "", label));
    const strong = makeElement("strong", "", value ?? "—");
    strong.append(makeElement("small", "", "/100"));
    score.append(strong);
    scores.append(score);
  });
  card.append(scores, makeElement("span", "signal-label", "Signal"), makeElement("p", "signal-copy", record.signal || "No signal supplied."));
  const evidence = makeElement("p", "evidence");
  evidence.append(makeElement("strong", "", "Evidence: "), document.createTextNode(record.evidence || "Not supplied"));
  card.append(evidence);
  return card;
}

function renderDelivery(result) {
  const data = result.data || {};
  const records = Array.isArray(data.records) ? data.records : [];
  const realTransaction = result.mode === "XRPL Testnet" && validExplorerUrl(result.explorerUrl);

  $("deliverySummary").textContent = `${records.length} ${records.length === 1 ? "record is" : "records are"} licensed and ready for internal evaluation.`;
  $("receiptAmount").textContent = result.amount || "—";
  $("receiptPacket").textContent = data.packetId || "—";
  $("receiptTransaction").textContent = result.transaction || "Not provided";
  $("receiptArtifact").textContent = data.artifactHash || "—";
  $("receiptSource").textContent = data.source || "—";
  $("receiptLicense").textContent = data.license || "—";
  $("recordsTitle").textContent = `${records.length} delivered ${records.length === 1 ? "record" : "records"}`;
  $("recordsGrid").replaceChildren(...records.map(renderRecord));

  const generated = data.generatedAt ? new Date(data.generatedAt) : null;
  $("generatedAt").textContent = generated && !Number.isNaN(generated.valueOf())
    ? `Generated ${generated.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
    : "Generation time unavailable";

  $("receiptType").textContent = realTransaction ? "XRPL Testnet receipt" : "Simulation receipt";
  $("verifiedBadge").textContent = realTransaction ? "Testnet validated" : "Simulation verified";
  $("transactionLabel").textContent = realTransaction ? "Transaction hash" : "Simulation hash";
  $("simulationWarning").hidden = realTransaction;
  const explorer = $("explorerLink");
  explorer.hidden = !realTransaction;
  if (realTransaction) explorer.href = result.explorerUrl;
  else explorer.removeAttribute("href");

  showPanel("deliveryPanel", 4);
  announce(`Delivery complete. ${records.length} records unlocked${realTransaction ? " with a validated XRPL Testnet receipt" : " in transparent simulation mode"}.`);
}

async function purchasePacket(event) {
  event.preventDefault();
  clearError();
  const option = state.selectedOption;
  if (!state.quote?.id || !option) {
    showError("Choose an affordable packet before continuing.");
    return;
  }
  if (!option.withinBudget) {
    showError("That packet is outside the signed budget. Choose an affordable option.");
    return;
  }

  const purchaseButton = $("purchaseButton");
  setButtonBusy(purchaseButton, true, "Unlocking…");
  resetStages();
  showPanel("settlementPanel", 4);
  setStage("policy", "active");

  const purchasePromise = requestJson(`/api/purchases/${encodeURIComponent(state.quote.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ tier: option.id }),
  });

  try {
    await pause(180);
    setStage("policy", "complete");
    setStage("challenge", "active");
    await pause(260);
    setStage("challenge", "complete");
    setStage("settlement", "active");
    const result = await purchasePromise;
    setStage("settlement", "complete");
    setStage("delivery", "active");
    await pause(320);
    setStage("delivery", "complete");
    await pause(180);
    renderDelivery(result);
  } catch (error) {
    if (state.activeStage) setStage(state.activeStage, "error");
    showPanel("packetPanel", 3);
    showError(error.message);
    announce(`Purchase did not complete. ${error.message} Your packet selection is unchanged.`);
  } finally {
    setButtonBusy(purchaseButton, false, "");
  }
}

function resetJourney() {
  state.quote = null;
  state.selectedOption = null;
  clearError();
  $("objectiveForm").reset();
  $("scopeForm").reset();
  $("objective").value = "Find resilient suppliers for our expansion";
  $("budget").value = "3000";
  $("freshness").value = "90";
  $("objectiveCount").textContent = `${$("objective").value.length} / 600`;
  $("packetOptions").replaceChildren();
  $("recordsGrid").replaceChildren();
  resetStages();
  showPanel("objectivePanel", 1);
  announce("New request ready.");
}

$("objective").addEventListener("input", (event) => {
  $("objectiveCount").textContent = `${event.target.value.length} / 600`;
});
$("objectiveForm").addEventListener("submit", (event) => submitQuote(event, false));
$("scopeForm").addEventListener("submit", (event) => submitQuote(event, true));
$("packetForm").addEventListener("submit", purchasePacket);
$("backToObjective").addEventListener("click", () => showPanel("objectivePanel", 1));
$("startOverButton").addEventListener("click", resetJourney);
$("newRequestButton").addEventListener("click", resetJourney);
$("dismissError").addEventListener("click", clearError);

$("objectiveCount").textContent = `${$("objective").value.length} / 600`;
loadCatalog();
