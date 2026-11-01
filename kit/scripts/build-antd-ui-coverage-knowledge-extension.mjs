import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Additive extension on top of the Radio coverage pack: frozen CLI references for App, Checkbox,
// Popover, Segmented and Result, plus decision cards for Segmented and Result.
// The base pack and the Radio pack stay byte-identical.
const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeRoot = resolve(kitRoot, "foundations/knowledge/antd-6.5.0");
const baseDecisionCardsFile = resolve(knowledgeRoot, "decision-cards.json");
const radioManifestFile = resolve(knowledgeRoot, "manifest.radio-coverage.json");
const extensionManifestFile = resolve(knowledgeRoot, "manifest.ui-coverage.json");
const decisionCardsRelPath = "decision-cards.ui-coverage.json";
const decisionCardsFile = resolve(knowledgeRoot, decisionCardsRelPath);
const radioDesignPackFile = resolve(kitRoot, "foundations/design-packs/antd-6.5.0-radio-coverage.json");
const designPackFile = resolve(kitRoot, "foundations/design-packs/antd-6.5.0-ui-coverage.json");
const cliEntry = resolve(kitRoot, "node_modules/@ant-design/cli/dist/index.js");
const checkOnly = process.argv.includes("--check");
const components = ["App", "Checkbox", "Popover", "Result", "Segmented"];
const addedDecisionCards = ["Result", "Segmented"];
const antdVersion = "6.5.0";
const cliVersion = "6.5.1";
const reviewedAt = "2026-09-28";
const packId = "antd-6.5.0-ui-coverage";

const newDecisionCards = [
  {
    component: "Segmented",
    displayName: "分段控制器",
    role: "Switch a small display mode or filter of the same content in place.",
    useWhen: [
      "Two to five mutually exclusive options change how one region is viewed or filtered, such as 全部 / 告警 / 离线 or 列表 / 卡片.",
      "The associated region updates in place without changing page identity or route."
    ],
    avoidWhen: [
      "Use Tabs when each option owns a peer content panel or section with its own actions and loading state.",
      "Use Radio for a form field that is submitted with the form.",
      "Use Select when there are many options or the labels are long.",
      "Use Menu for product navigation."
    ],
    defaults: [
      "Keep exactly one option selected; the first option is the default unless a stored preference exists.",
      "Use short parallel labels; add an icon only with a text label or an accessible name.",
      "Use the controlled value and onChange when the choice is synced to the URL or a table query.",
      "Use the medium size, and block width when the control sits alone in a narrow toolbar."
    ],
    states: [
      "selected option is visually distinct without relying on color alone",
      "disabled option explains why in nearby help text",
      "the controlled region shows its own loading state while switching",
      "keep filters and scroll position when the switch does not change the data scope"
    ],
    composition: [
      "Place it directly above or beside the region it controls, usually in the toolbar next to filters.",
      "Keep page-wide actions outside the control and do not mix action buttons into the options."
    ],
    responsive: [
      "Use block width on narrow screens; switch to Select when the labels no longer fit on one line.",
      "Use vertical orientation only in a narrow side region."
    ],
    a11y: [
      "The options behave as a radio group; keep arrow-key navigation and a visible focus ring.",
      "Give icon-only options an accessible name, and set name when several groups share one page."
    ],
    antiPatterns: [
      "Segmented used as page navigation",
      "More than five options or long labels forced into one row",
      "Segmented used for a value submitted with a form",
      "Segmented switching unrelated content sections that need Tabs",
      "No option selected"
    ]
  },
  {
    component: "Result",
    displayName: "结果页",
    role: "Report the outcome of an important operation or a whole page and offer the next action.",
    useWhen: [
      "An important operation or route has finished and the feedback is complex: success, failure, warning, 403, 404, or 500.",
      "The whole page or flow step has nothing else to show except the outcome and what to do next."
    ],
    avoidWhen: [
      "Use Empty when a list, table, or card region simply has no data.",
      "Use Message or Notification for transient feedback that does not replace the page.",
      "Use Alert for an inline banner while the surrounding content stays usable.",
      "Use Skeleton or Spin while loading."
    ],
    defaults: [
      "Set status to match the outcome: success, error, info, warning, 403, 404, or 500.",
      "Title states the outcome; subTitle states the cause when known and the next step.",
      "Put at most one primary and one secondary action in extra, such as 返回列表 and 重试.",
      "Permission 403: explain the access rule and offer a request or return path."
    ],
    states: [
      "show only after the request or route has settled, never during loading",
      "on failure keep entered values reachable through the retry path",
      "on success offer the follow-up action and a way to continue"
    ],
    composition: [
      "Center it in the page content area under the application shell.",
      "Use a custom icon only when the built-in status icon does not convey the outcome."
    ],
    responsive: [
      "Keep icon, title, subTitle, and extra stacked and centered; let actions wrap under narrow width."
    ],
    a11y: [
      "Expose the outcome as text; do not rely on the status icon alone.",
      "Move focus to the title or the primary action after a submit result or route transition."
    ],
    antiPatterns: [
      "Result used for an empty table or filtered-no-result state",
      "Success result without a next action",
      "Generic 出错了 copy with no cause or recovery",
      "Result used for transient confirmation that a Message would cover",
      "Result nested inside a card that still shows other content"
    ]
  }
];

if (!checkOnly) buildExtension();
validateExtension();

function buildExtension() {
  for (const component of components) {
    const queries = {
      info: runQuery("info", [component], { lang: true, required: true }),
      doc: runQuery("doc", [component], { lang: true, required: true }),
      demo: runQuery("demo", [component], { lang: true, required: false }),
      token: runQuery("token", [component], { lang: false, required: false }),
      semantic: runQuery("semantic", [component], { lang: false, required: false })
    };
    const reference = {
      version: "1.0.0",
      component,
      queryComponent: component,
      antdVersion,
      cliVersion,
      reviewedAt,
      queries: Object.fromEntries(
        Object.entries(queries).map(([name, result]) => [name, result.ok ? { status: "ok", data: result.data } : { status: "unsupported", error: result.error }])
      )
    };
    writeText(referenceFileFor(component), JSON.stringify(reference, null, 2));
  }

  const baseCards = readJson(baseDecisionCardsFile);
  const cards = { ...baseCards, reviewedAt, cards: [...baseCards.cards, ...newDecisionCards] };
  writeText(decisionCardsFile, JSON.stringify(cards, null, 2));

  const radioManifest = readJson(radioManifestFile);
  const radioReceipt = fileReceipt(radioManifestFile, "manifest.radio-coverage.json");
  const newAssets = [
    ...components.map((component) => ({
      kind: "component-reference",
      id: component,
      path: `component-reference/${component}.json`,
      sha256: sha256(referenceFileFor(component))
    })),
    { kind: "decision-cards", id: "decision-cards-ui-coverage", path: decisionCardsRelPath, sha256: sha256(decisionCardsFile) }
  ];
  const newPaths = new Set(newAssets.map((asset) => asset.path));
  const assets = [...radioManifest.assets.filter((asset) => !newPaths.has(asset.path)), ...newAssets].sort((left, right) => left.path.localeCompare(right.path));
  const extensionManifest = {
    ...radioManifest,
    reviewedAt,
    extension: {
      kind: "additive-component-reference",
      purpose: "Frozen CLI references for the AntD components used by generated tianshu-device-ops pages (App, Checkbox, Popover, Segmented, Result) plus decision cards for Segmented and Result.",
      baseManifest: radioReceipt,
      addedComponents: components,
      mutatesBaseManifest: false,
      addsDecisionCard: true,
      addedDecisionCards,
      decisionCardsAsset: decisionCardsRelPath,
      decisionCardsReason: "Segmented and Result change page-level judgment (in-place view switching versus Tabs, page outcome versus Empty); App, Checkbox, and Popover are bounded controls and need no card."
    },
    counts: {
      ...radioManifest.counts,
      decisionCards: radioManifest.counts.decisionCards + addedDecisionCards.length,
      componentReferences: radioManifest.counts.componentReferences + components.length,
      assets: assets.length
    },
    assets
  };
  writeText(extensionManifestFile, JSON.stringify(extensionManifest, null, 2));

  const radioPack = readJson(radioDesignPackFile);
  const designPack = {
    ...radioPack,
    id: packId,
    reviewedAt,
    extension: {
      kind: "additive-component-reference",
      purpose: "Generator coverage for App, Checkbox, Popover, Segmented, and Result on top of the Radio coverage pack.",
      baseDesignPack: fileReceipt(radioDesignPackFile, "foundations/design-packs/antd-6.5.0-radio-coverage.json"),
      mutatesBaseDesignPack: false
    },
    knowledge: {
      ...radioPack.knowledge,
      manifest: {
        path: "foundations/knowledge/antd-6.5.0/manifest.ui-coverage.json",
        sha256: sha256(extensionManifestFile)
      }
    }
  };
  writeText(designPackFile, JSON.stringify(designPack, null, 2));
}

function validateExtension() {
  for (const file of [...components.map(referenceFileFor), decisionCardsFile, extensionManifestFile, designPackFile]) {
    if (!existsSync(file)) throw new Error(`UI coverage knowledge extension is missing ${relative(kitRoot, file)}; run without --check to build it`);
  }
  for (const component of components) {
    const reference = readJson(referenceFileFor(component));
    if (reference.component !== component || reference.queryComponent !== component || reference.antdVersion !== antdVersion || reference.cliVersion !== cliVersion) {
      throw new Error(`${component} component reference metadata is invalid`);
    }
    for (const query of ["info", "doc"]) {
      if (reference.queries?.[query]?.status !== "ok") throw new Error(`${component} ${query} query is not frozen successfully`);
    }
  }

  const radioManifest = readJson(radioManifestFile);
  const manifest = readJson(extensionManifestFile);
  const actualBase = fileReceipt(radioManifestFile, "manifest.radio-coverage.json");
  if (JSON.stringify(manifest.extension?.baseManifest) !== JSON.stringify(actualBase)) throw new Error("UI coverage base manifest receipt drifted");
  if (manifest.id !== radioManifest.id || manifest.foundation?.id !== "antd" || manifest.foundation?.version !== antdVersion) {
    throw new Error("UI coverage manifest foundation identity is invalid");
  }
  const extension = manifest.extension;
  if (extension?.mutatesBaseManifest !== false || JSON.stringify(extension.addedComponents) !== JSON.stringify(components)) {
    throw new Error("UI coverage extension boundary is invalid");
  }
  if (extension.addsDecisionCard !== true || JSON.stringify(extension.addedDecisionCards) !== JSON.stringify(addedDecisionCards) || extension.decisionCardsAsset !== decisionCardsRelPath) {
    throw new Error("UI coverage decision-card extension is invalid");
  }
  const expectedAssets = radioManifest.assets.length + components.length + 1;
  if (manifest.counts?.componentReferences !== radioManifest.counts.componentReferences + components.length ||
    manifest.counts?.decisionCards !== radioManifest.counts.decisionCards + addedDecisionCards.length ||
    manifest.counts?.assets !== expectedAssets || manifest.assets?.length !== expectedAssets) {
    throw new Error("UI coverage counts are invalid");
  }
  for (const baseAsset of radioManifest.assets) {
    const extensionAsset = manifest.assets.find((asset) => asset.path === baseAsset.path);
    if (JSON.stringify(extensionAsset) !== JSON.stringify(baseAsset)) throw new Error(`UI coverage extension changed base asset ${baseAsset.path}`);
  }
  for (const component of components) {
    const matches = manifest.assets.filter((asset) => asset.kind === "component-reference" && asset.id === component);
    if (matches.length !== 1 || matches[0].path !== `component-reference/${component}.json` || matches[0].sha256 !== sha256(referenceFileFor(component))) {
      throw new Error(`UI coverage component reference receipt for ${component} is invalid`);
    }
  }
  const cardAsset = manifest.assets.find((asset) => asset.path === decisionCardsRelPath);
  if (cardAsset?.kind !== "decision-cards" || cardAsset.sha256 !== sha256(decisionCardsFile)) throw new Error("UI coverage decision-card receipt is invalid");
  const baseCards = readJson(baseDecisionCardsFile).cards;
  const cards = readJson(decisionCardsFile).cards;
  if (cards.length !== baseCards.length + addedDecisionCards.length) throw new Error("UI coverage decision-card count is invalid");
  baseCards.forEach((card, index) => {
    if (JSON.stringify(cards[index]) !== JSON.stringify(card)) throw new Error(`UI coverage changed base decision card ${card.component}`);
  });
  if (JSON.stringify(cards.slice(baseCards.length).map((card) => card.component)) !== JSON.stringify(newDecisionCards.map((card) => card.component))) {
    throw new Error("UI coverage added decision cards are invalid");
  }

  const radioPack = readJson(radioDesignPackFile);
  const designPack = readJson(designPackFile);
  if (designPack.id !== packId || designPack.foundationId !== "antd" || designPack.extension?.mutatesBaseDesignPack !== false) {
    throw new Error("UI coverage design pack identity is invalid");
  }
  const actualPackBase = fileReceipt(radioDesignPackFile, "foundations/design-packs/antd-6.5.0-radio-coverage.json");
  if (JSON.stringify(designPack.extension.baseDesignPack) !== JSON.stringify(actualPackBase)) throw new Error("UI coverage base design pack receipt drifted");
  const manifestReceipt = designPack.knowledge?.manifest;
  if (manifestReceipt?.path !== "foundations/knowledge/antd-6.5.0/manifest.ui-coverage.json" || manifestReceipt.sha256 !== sha256(extensionManifestFile)) {
    throw new Error("UI coverage design pack manifest receipt is invalid");
  }
  if (JSON.stringify({ ...designPack.knowledge, manifest: null }) !== JSON.stringify({ ...radioPack.knowledge, manifest: null })) {
    throw new Error("UI coverage design pack changed knowledge fields other than the manifest pointer");
  }
  console.log(
    `validated AntD UI coverage knowledge extension: base=${actualBase.sha256}; manifest=${relative(kitRoot, extensionManifestFile)}; designPack=${sha256(designPackFile)}`
  );
}

function referenceFileFor(component) {
  return resolve(knowledgeRoot, `component-reference/${component}.json`);
}

function runQuery(command, args, options) {
  const commandArgs = [cliEntry, command, ...args, "--version", antdVersion, "--format", "json"];
  if (options.lang) commandArgs.push("--lang", "zh");
  const result = spawnSync(process.execPath, commandArgs, { cwd: kitRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const error = (stderr || stdout || `exit ${result.status}`).trim();
    if (options.required) throw new Error(`${command} ${args.join(" ")} failed: ${error}`);
    return { ok: false, error };
  }
  const start = stdout.indexOf("{");
  if (start < 0) {
    if (options.required) throw new Error(`${command} ${args.join(" ")} returned no JSON`);
    return { ok: false, error: "CLI returned no JSON" };
  }
  try {
    return { ok: true, data: JSON.parse(stdout.slice(start)) };
  } catch (error) {
    if (options.required) throw new Error(`${command} ${args.join(" ")} returned invalid JSON: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function fileReceipt(file, path) {
  const value = readFileSync(file);
  return { path, bytes: value.length, sha256: createHash("sha256").update(value).digest("hex") };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeText(file, value) {
  writeFileSync(file, `${value}\n`, "utf8");
}
