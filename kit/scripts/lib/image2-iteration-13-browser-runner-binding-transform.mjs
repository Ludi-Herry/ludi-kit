export function materializeIteration13BrowserRunnerRevision02(source, kitRoot) {
  let value = source;
  value = replaceExactly(value,
    'const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
    `const kitRoot = ${JSON.stringify(kitRoot)};`);
  value = replaceExactly(value,
    'const evidencePath = "quality/image2-golden-pages/holdout-restart-4/evaluation/alert-center/evidence/browser-revision-02-revision-01.raw.json";',
    'const evidencePath = "quality/image2-golden-pages/holdout-restart-4/evaluation/alert-center/evidence/browser-revision-02-revision-02.raw.json";');
  value = replaceExactly(value,
    'const screenshotRoot = "quality/image2-golden-pages/holdout-restart-4/evaluation/alert-center/evidence/screenshots/revision-02-revision-01";',
    'const screenshotRoot = "quality/image2-golden-pages/holdout-restart-4/evaluation/alert-center/evidence/screenshots/revision-02-revision-02";');
  value = replaceExactly(value,
    'path: `${screenshotRoot}/iteration-13-revision-01-${viewport.id}.png`',
    'path: `${screenshotRoot}/iteration-13-revision-02-${viewport.id}.png`');
  value = replaceExactly(value,
    'kind: "image2-holdout-iteration-13-browser-revision-02-revision-01-raw-evidence",',
    'kind: "image2-holdout-iteration-13-browser-revision-02-revision-02-raw-evidence",');
  value = replaceExactly(value,
    'evaluatorRevision: "2-revision-01",',
    'evaluatorRevision: "2-revision-02",\n  runnerBindingRevision: { path: "quality/image2-golden-pages/holdout-restart-4/iteration-13-browser-runner-binding-revision-02-2026-08-13.json", revisionId: "image2-holdout-iteration-13-browser-runner-binding-revision-02-2026-08-13" },');
  value = replaceExactly(value,
    '|| value.standaloneEvidence?.path !== evidencePath\n    || value.standaloneEvidence?.maximumRuns !== 1',
    '|| value.standaloneEvidence?.path !== "quality/image2-golden-pages/holdout-restart-4/evaluation/alert-center/evidence/browser-revision-02.raw.json"\n    || value.standaloneEvidence?.maximumRuns !== 1');
  value = replaceExactly(value,
    '|| value.standaloneRunner?.path !== "scripts/run-image2-iteration-13-browser-revision-02-revision-01.mjs"\n    || value.standaloneEvidence?.path !== evidencePath\n    || value.inAppBrowserValidator?.path !== "scripts/validate-image2-iteration-13-in-app-browser-revision-01.mjs"',
    '|| value.standaloneRunner?.path !== "scripts/run-image2-iteration-13-browser-revision-02-revision-01.mjs"\n    || value.standaloneEvidence?.path !== "quality/image2-golden-pages/holdout-restart-4/evaluation/alert-center/evidence/browser-revision-02-revision-01.raw.json"\n    || value.inAppBrowserValidator?.path !== "scripts/validate-image2-iteration-13-in-app-browser-revision-01.mjs"');
  return value;
}

function replaceExactly(source, from, to) {
  const first = source.indexOf(from);
  if (first < 0 || source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`browser runner binding transform expected one match: ${from.slice(0, 80)}`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}
