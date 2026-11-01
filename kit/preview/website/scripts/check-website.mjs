import { chromium } from 'playwright';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const base = fileURLToPath(new URL('..', import.meta.url));
const kit = fileURLToPath(new URL('../../..', import.meta.url));
const evidenceRoot = path.join(base, 'evidence');
const startedAt = new Date();
const captureId = startedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const evidenceDir = path.join(evidenceRoot, `formal-check-${captureId}`);
const reportPath = path.join(evidenceDir, 'formal-check.json');
const logPath = path.join(evidenceDir, 'run.log');
const siteUrl = 'http://127.0.0.1:5403/';
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

await mkdir(evidenceRoot, { recursive: true });
await mkdir(evidenceDir);
await writeFile(logPath, '', { encoding: 'utf8', flag: 'wx' });

const results = {
  schemaVersion: 'ludi-formal-website-check/v1',
  captureId: path.basename(evidenceDir),
  startedAt: startedAt.toISOString(),
  contract: 'pending',
  technical: 'running',
  visual: 'pending-owner-review',
  checks: [],
  failures: [],
  runtimeErrors: [],
  screenshots: [],
  notes: [
    'Browser evidence records the formal single-page website as rendered; visual acceptance remains pending owner review.',
    'No request URL or method logging, request interception, business write, dependency installation, or full CI was used.'
  ]
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeErrorText(message) {
  return String(message).replace(/https?:\/\/[^\s"'<>]+/gi, '[URL omitted]');
}

function relativeEvidencePath(filePath) {
  return path.relative(base, filePath).split(path.sep).join('/');
}

function pngSize(buffer) {
  assert(buffer.length >= 24 && buffer.subarray(0, 8).equals(pngSignature), 'Screenshot bytes are not a PNG.');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function log(message) {
  const line = `${new Date().toISOString()} ${safeErrorText(message)}\n`;
  await appendFile(logPath, line, { encoding: 'utf8' });
  console.log(safeErrorText(message));
}

async function runCheck(name, action) {
  try {
    const details = await action();
    results.checks.push({ name, passed: true, ...(details === undefined ? {} : { details }) });
    await log(`PASS ${name}`);
    return true;
  } catch (error) {
    const message = safeErrorText(error.message);
    results.checks.push({ name, passed: false, error: message });
    results.failures.push({ check: name, message });
    await log(`FAIL ${name}: ${message}`);
    return false;
  }
}

function trackPage(page) {
  page.on('pageerror', error => {
    results.runtimeErrors.push({ type: 'pageerror', message: safeErrorText(error.message) });
  });
  page.on('console', message => {
    if (message.type() === 'error') {
      results.runtimeErrors.push({ type: 'consoleerror', message: safeErrorText(message.text()) });
    }
  });
}

async function waitForImage(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const width = await locator.evaluate(image => new Promise((resolve, reject) => {
    let timer;
    const fail = message => {
      clearTimeout(timer);
      reject(new Error(message));
    };
    const finish = () => image.naturalWidth > 0
      ? (clearTimeout(timer), resolve(image.naturalWidth))
      : fail(`${label}: image completed without decoded pixels.`);
    if (image.complete) return finish();
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', () => fail(`${label}: image failed to load.`), { once: true });
    timer = setTimeout(() => fail(`${label}: image load timed out.`), 15000);
  }));
  assert(width > 0, `${label}: image has no natural width.`);
  return width;
}

async function saveScreenshot(page, name, expectedViewport = null, screenshotOptions = {}) {
  const bytes = await page.screenshot({ animations: 'disabled', ...screenshotOptions });
  const size = pngSize(bytes);
  if (expectedViewport) {
    assert(size.width === expectedViewport.width && size.height === expectedViewport.height,
      `${name}: unexpected PNG dimensions ${size.width}x${size.height}.`);
  }
  const filePath = path.join(evidenceDir, `${name}.png`);
  await writeFile(filePath, bytes, { flag: 'wx' });
  const record = {
    path: relativeEvidencePath(filePath),
    width: size.width,
    height: size.height,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
  results.screenshots.push(record);
  return record;
}

async function layoutMetrics(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    visualViewportWidth: window.visualViewport?.width ?? null
  }));
}

function assertNoHorizontalOverflow(metrics, label) {
  assert(metrics.documentScrollWidth <= metrics.clientWidth + 1
    && metrics.bodyScrollWidth <= metrics.innerWidth + 1,
  `${label}: horizontal overflow (inner=${metrics.innerWidth}, client=${metrics.clientWidth}, document=${metrics.documentScrollWidth}, body=${metrics.bodyScrollWidth}).`);
}

async function waitForOpen(page, open) {
  await page.waitForFunction(expected => {
    const element = document.querySelector('.video-dialog');
    return Boolean(element?.open) === expected;
  }, open, { timeout: 10000 });
}

async function loadLandingPage(page) {
  await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });
  return {
    title: await page.title(),
    heading: (await page.locator('h1').first().innerText()).trim(),
    viewport: await layoutMetrics(page)
  };
}

async function revealPageByScrolling(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  let steps = 0;
  while (steps < 80) {
    const state = await page.evaluate(() => ({
      atBottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
      scrollHeight: document.documentElement.scrollHeight
    }));
    if (state.atBottom) break;
    await page.mouse.wheel(0, Math.min(680, state.scrollHeight));
    await page.waitForTimeout(120);
    steps += 1;
  }
  assert(steps < 80, 'Normal page scrolling did not reach the bottom.');
  await page.waitForTimeout(250);
  const reveals = await page.locator('[data-reveal]').evaluateAll(elements => elements.map(element => ({
    kind: element.getAttribute('data-reveal'),
    visible: element.classList.contains('is-visible')
  })));
  assert(reveals.length > 0 && reveals.every(item => item.visible),
    `Normal scrolling left unrevealed sections: ${reveals.filter(item => !item.visible).map(item => item.kind).join(', ')}.`);
  const images = await page.locator('img').evaluateAll(elements => elements.map(image => ({
    alt: image.alt,
    loaded: image.complete && image.naturalWidth > 0,
    naturalWidth: image.naturalWidth
  })));
  assert(images.length > 0 && images.every(image => image.loaded),
    `A rendered image did not load: ${images.filter(image => !image.loaded).map(image => image.alt).join(', ')}.`);
  return { scrollSteps: steps, revealedSections: reveals.length, loadedImages: images.length };
}

async function readRadiusState(page) {
  return page.evaluate(() => ({
    output: document.querySelector('#feel output')?.textContent?.trim(),
    token: getComputedStyle(document.querySelector('.feel-board')).getPropertyValue('--sample-radius').trim(),
    cardRadius: getComputedStyle(document.querySelector('.sample-card')).borderRadius,
    buttonRadius: getComputedStyle(document.querySelector('.sample-button')).borderRadius
  }));
}

async function checkResponsive(browser, width, height, mobile) {
  const name = `${width}x${height}`;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: mobile ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  trackPage(page);
  try {
    let loaded = await runCheck(`${name}: open final landing page`, async () => loadLandingPage(page));
    if (!loaded) return;

    await runCheck(`${name}: actual viewport and horizontal overflow`, async () => {
      const metrics = await layoutMetrics(page);
      assert(metrics.innerWidth === width && metrics.innerHeight === height,
        `${name}: browser reported ${metrics.innerWidth}x${metrics.innerHeight}.`);
      assertNoHorizontalOverflow(metrics, name);
      if (mobile) {
        const inputModes = await page.evaluate(() => ({
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          maxTouchPoints: navigator.maxTouchPoints,
          coarsePointer: matchMedia('(pointer: coarse)').matches
        }));
        assert(inputModes.reducedMotion && inputModes.maxTouchPoints > 0,
          `${name}: touch/reduced-motion emulation is not active (${JSON.stringify(inputModes)}).`);
        return { metrics, inputModes };
      }
      return metrics;
    });

    await runCheck(`${name}: viewport screenshot with decoded product image`, async () => {
      await waitForImage(page.locator('.hero-stage .product-image img'), `${name} screenshot product image`);
      const screenshot = await saveScreenshot(page, `${mobile ? 'mobile' : 'tablet'}-${name}`, { width, height });
      return { screenshot };
    });

    if (mobile) {
      await runCheck(`${name}: product gallery loads all three real page images`, async () => {
        const gallery = page.getByRole('group', { name: '查看真实业务页面' });
        for (const [label, filename] of [
          ['设备管理', 'product-devices.png'],
          ['运营工作台', 'product-dashboard.png'],
          ['固件与推送', 'product-firmware.png']
        ]) {
          const button = gallery.getByRole('button', { name: label, exact: true });
          await button.click();
          assert(await button.getAttribute('aria-pressed') === 'true', `${name}: ${label} is not selected.`);
          const image = page.locator('.hero-stage .product-image img');
          await waitForImage(image, `${name} ${label}`);
          assert((await image.getAttribute('src')).includes(filename), `${name}: ${label} displays the wrong image.`);
        }
        return { states: 3, naturalWidth: await page.locator('.hero-stage .product-image img').evaluate(image => image.naturalWidth) };
      });

      await runCheck(`${name}: editor gallery media decode`, async () => {
        const group = page.getByRole('group', { name: '查看编辑器操作画面' });
        for (const [label, filename] of [
          ['页面画布', 'editor-overview.png'],
          ['设计变量', 'editor-colors.png'],
          ['组件状态', 'editor-components.png']
        ]) {
          const button = group.getByRole('button', { name: label, exact: true });
          await button.click();
          assert(await button.getAttribute('aria-pressed') === 'true', `${name}: ${label} is not selected.`);
          const image = page.locator('.video-poster img');
          await waitForImage(image, `${name} ${label}`);
          assert((await image.getAttribute('src')).includes(filename), `${name}: ${label} displays the wrong image.`);
        }
        return { states: 3 };
      });

      await runCheck(`${name}: rounded-corner control updates specimen styles`, async () => {
        await page.getByRole('button', { name: '圆角 24 像素', exact: true }).click();
        await page.waitForTimeout(500);
        const state = await readRadiusState(page);
        assert(state.output === '24 px' && state.token === '24px'
          && state.cardRadius === '24px' && state.buttonRadius === '24px',
        `${name}: radius did not propagate to the specimen (${JSON.stringify(state)}).`);
        return state;
      });

      await runCheck(`${name}: recording opens and closes`, async () => {
        const opener = page.locator('.demo-aside .text-button');
        await opener.click();
        const dialog = page.locator('.video-dialog');
        await waitForOpen(page, true);
        await page.getByRole('button', { name: '关闭录屏', exact: true }).click();
        await waitForOpen(page, false);
        return { openedAndClosed: true };
      });

      await runCheck(`${name}: horizontal overflow after interactions`, async () => {
        const metrics = await layoutMetrics(page);
        assertNoHorizontalOverflow(metrics, name);
        return metrics;
      });
    } else {
      await runCheck(`${name}: horizontal overflow at tablet width`, async () => {
        const metrics = await layoutMetrics(page);
        assertNoHorizontalOverflow(metrics, name);
        return metrics;
      });
    }
  } finally {
    await context.close();
  }
}

async function main() {
  let browser;
  try {
    const preflightPassed = await runCheck('Ajv contract, design-pack SHA-256, and import boundary', async () => {
      const context = JSON.parse(await readFile(path.join(base, 'business-context.json'), 'utf8'));
      const taskContract = JSON.parse(await readFile(path.join(base, 'task-contract.json'), 'utf8'));
      const schema = JSON.parse(await readFile(path.join(kit, 'schema', 'project-context.schema.json'), 'utf8'));
      const validate = new Ajv({ strict: false }).compile(schema);
      assert(validate(context), JSON.stringify(validate.errors));
      assert(taskContract.phase === 'formal-product-stage', 'Task contract is not in the formal product stage.');
      assert(taskContract.visualAcceptance === 'pending-owner-review', 'Visual acceptance contract changed unexpectedly.');
      const packBytes = await readFile(path.join(kit, context.frontendFoundation.designPack.path));
      const packHash = createHash('sha256').update(packBytes).digest('hex');
      assert(packHash === context.frontendFoundation.designPack.sha256, 'Design pack hash drift.');
      const source = await readFile(path.join(base, 'src', 'main.jsx'), 'utf8');
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        assert(context.frontendFoundation.imports.allowedPackages.includes(match[1]), `Undeclared import ${match[1]}.`);
      }
      results.contract = 'passed';
      return { projectId: context.projectId, phase: taskContract.phase, designPackSha256: packHash, importBoundary: 'passed' };
    });
    if (!preflightPassed) {
      results.contract = 'failed';
      throw new Error('Contract preflight failed; browser checks were not started.');
    }

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await desktop.newPage();
    trackPage(page);

    const pageReady = await runCheck('open formal single-page landing page', async () => loadLandingPage(page));
    if (!pageReady) throw new Error('Formal landing page did not render; remaining browser checks were stopped.');

    await runCheck('1280x900 desktop viewport and initial real product image', async () => {
      const metrics = await layoutMetrics(page);
      assert(metrics.innerWidth === 1280 && metrics.innerHeight === 900, `Browser reported ${metrics.innerWidth}x${metrics.innerHeight}.`);
      assertNoHorizontalOverflow(metrics, '1280x900');
      const image = page.locator('.hero-stage .product-image img');
      await waitForImage(image, 'initial product page');
      assert((await image.getAttribute('src')).includes('product-devices.png'), 'Initial product view is not the devices page.');
      await saveScreenshot(page, 'desktop-1280x900', { width: 1280, height: 900 });
      return metrics;
    });

    await runCheck('1440x1000 desktop screenshot', async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.waitForTimeout(180);
      const metrics = await layoutMetrics(page);
      assert(metrics.innerWidth === 1440 && metrics.innerHeight === 1000, `Browser reported ${metrics.innerWidth}x${metrics.innerHeight}.`);
      assertNoHorizontalOverflow(metrics, '1440x1000');
      await saveScreenshot(page, 'desktop-1440x1000', { width: 1440, height: 1000 });
      await page.setViewportSize({ width: 1280, height: 900 });
      return metrics;
    });

    await runCheck('three business-page screenshots switch and decode', async () => {
      const gallery = page.getByRole('group', { name: '查看真实业务页面' });
      const states = [];
      for (const [label, filename] of [
        ['设备管理', 'product-devices.png'],
        ['运营工作台', 'product-dashboard.png'],
        ['固件与推送', 'product-firmware.png']
      ]) {
        const button = gallery.getByRole('button', { name: label, exact: true });
        await button.click();
        assert(await button.getAttribute('aria-pressed') === 'true', `${label}: selection state did not update.`);
        const image = page.locator('.hero-stage .product-image img');
        const naturalWidth = await waitForImage(image, label);
        const src = await image.getAttribute('src');
        assert(src.includes(filename), `${label}: selected image source is incorrect.`);
        states.push({ label, source: filename, naturalWidth });
      }
      return { states };
    });

    await runCheck('four design questions and before/after rule illustration', async () => {
      const questions = page.locator('.principle-list > button');
      assert(await questions.count() === 4, 'Expected exactly four design questions.');
      const proofs = new Set();
      for (let index = 0; index < 4; index += 1) {
        const question = questions.nth(index);
        await question.click();
        await page.waitForFunction(expected => {
          const items = document.querySelectorAll('.principle-list > button');
          return items.length === 4 && items[expected]?.getAttribute('aria-pressed') === 'true';
        }, index, { timeout: 5000 });
        const proof = (await page.locator('.principle-proof').innerText()).trim();
        assert(proof.length > 0, `Question ${index + 1} has no visible explanation.`);
        proofs.add(proof);
        if (index === 1) {
          const group = page.getByRole('group', { name: '切换布局规则示意' });
          const before = group.getByRole('button', { name: '规则前', exact: true });
          const after = group.getByRole('button', { name: '规则后', exact: true });
          const illustration = page.locator('.rule-preview');
          await before.click();
          await page.waitForTimeout(750);
          const beforeState = await illustration.evaluate(element => ({
            className: element.className,
            transform: getComputedStyle(element.querySelector('.row-0')).transform,
            pressed: element.parentElement.querySelector('[aria-label="切换布局规则示意"] button[aria-pressed="true"]')?.innerText
          }));
          assert(beforeState.className.includes('loose') && beforeState.transform !== 'none'
            && await before.getAttribute('aria-pressed') === 'true',
          `Before-rule illustration did not change (${JSON.stringify(beforeState)}).`);
          await after.click();
          await page.waitForTimeout(750);
          const afterState = await illustration.evaluate(element => ({
            className: element.className,
            transform: getComputedStyle(element.querySelector('.row-0')).transform
          }));
          assert(afterState.className.includes('ordered') && afterState.transform === 'none'
            && await after.getAttribute('aria-pressed') === 'true',
          `After-rule illustration did not change (${JSON.stringify(afterState)}).`);
        }
      }
      assert(proofs.size === 4, 'The four questions did not produce four distinct visible proof states.');
      return { questionStates: proofs.size, beforeAndAfterRuleStates: 2 };
    });

    await runCheck('four component foundations and four adaptation layers', async () => {
      const bases = ['AntD', 'shadcn', 'CloudAI', 'HiUI'];
      const layers = ['视觉', '控件', '结构', '逻辑'];
      const baseGroup = page.getByRole('group', { name: '切换组件底座示意' });
      const layerGroup = page.getByRole('group', { name: '查看适配层' });
      for (const foundation of bases) {
        const button = baseGroup.getByRole('button', { name: foundation, exact: true });
        await button.click();
        const label = (await page.locator('.adapter-detail .mono-label').innerText()).trim();
        assert(await button.getAttribute('aria-pressed') === 'true' && label.includes(`${foundation} /`),
          `${foundation}: base selection did not update the displayed adaptation method.`);
      }
      const layerDetails = new Set();
      for (const layer of layers) {
        const button = layerGroup.getByRole('button', { name: layer, exact: true });
        await button.click();
        const label = (await page.locator('.adapter-detail .mono-label').innerText()).trim();
        const detail = (await page.locator('.adapter-detail h4').innerText()).trim();
        assert(await button.getAttribute('aria-pressed') === 'true' && label.includes(`${layer}适配`) && detail.length > 0,
          `${layer}: adaptation layer did not update the displayed method.`);
        layerDetails.add(detail);
      }
      assert(layerDetails.size === 4, 'The four adaptation layers do not show four distinct details.');
      return { foundations: bases, layers };
    });

    await runCheck('four workflow steps update their active detail', async () => {
      const group = page.getByRole('group', { name: '查看生成与交付步骤' });
      const buttons = group.getByRole('button');
      assert(await buttons.count() === 4, 'Expected exactly four workflow steps.');
      for (let index = 0; index < 4; index += 1) {
        const button = buttons.nth(index);
        await button.click();
        const step = (await page.locator('.workflow-detail-copy .eyebrow').innerText()).trim();
        const rows = await page.locator('.workflow-sheet .sheet-row').count();
        assert(await button.getAttribute('aria-pressed') === 'true' && step === `STEP 0${index + 1}` && rows === 3,
          `Workflow step ${index + 1} did not update its actual detail.`);
      }
      return { steps: 4, detailRowsPerStep: 3 };
    });

    await runCheck('three editor screenshots switch and decode', async () => {
      const group = page.getByRole('group', { name: '查看编辑器操作画面' });
      const states = [];
      for (const [label, filename] of [
        ['页面画布', 'editor-overview.png'],
        ['设计变量', 'editor-colors.png'],
        ['组件状态', 'editor-components.png']
      ]) {
        const button = group.getByRole('button', { name: label, exact: true });
        await button.click();
        assert(await button.getAttribute('aria-pressed') === 'true', `${label}: selection state did not update.`);
        const image = page.locator('.video-poster img');
        const naturalWidth = await waitForImage(image, label);
        const src = await image.getAttribute('src');
        assert(src.includes(filename), `${label}: selected image source is incorrect.`);
        states.push({ label, source: filename, naturalWidth });
      }
      return { states };
    });

    await runCheck('rounded-corner control updates desktop specimen styles', async () => {
      await page.getByRole('button', { name: '圆角 24 像素', exact: true }).click();
      await page.waitForTimeout(500);
      const radius24 = await readRadiusState(page);
      assert(radius24.output === '24 px' && radius24.token === '24px'
        && radius24.cardRadius === '24px' && radius24.buttonRadius === '24px',
      `Radius value did not propagate to panel and button (${JSON.stringify(radius24)}).`);
      return { radius24 };
    });

    await runCheck('outline style reaches its final computed surface color', async () => {
      const styles = page.getByRole('group', { name: '切换示意按钮样式' });
      const outline = styles.getByRole('button', { name: '描边', exact: true });
      await outline.click();
      try {
        await page.waitForFunction(() => {
          const button = document.querySelector('.sample-button');
          const card = document.querySelector('.sample-card');
          return Boolean(button && card
            && getComputedStyle(button).backgroundColor === getComputedStyle(card).backgroundColor);
        }, undefined, { timeout: 2000 });
      } catch {
        const finalState = await page.locator('.sample-button').evaluate(button => {
          const card = document.querySelector('.sample-card');
          const buttonStyle = getComputedStyle(button);
          const cardStyle = getComputedStyle(card);
          return {
            className: button.className,
            background: buttonStyle.backgroundColor,
            surface: cardStyle.backgroundColor,
            transitionProperty: buttonStyle.transitionProperty,
            transitionDuration: buttonStyle.transitionDuration
          };
        });
        throw new Error(`Outline transition did not reach the surface color within 2000ms (${JSON.stringify(finalState)}).`);
      }
      const outlineState = await page.locator('.sample-button').evaluate(button => ({
        className: button.className,
        background: getComputedStyle(button).backgroundColor,
        surface: getComputedStyle(document.querySelector('.sample-card')).backgroundColor
      }));
      assert(await outline.getAttribute('aria-pressed') === 'true'
        && outlineState.className.includes('style-1')
        && outlineState.background === outlineState.surface,
      `Outline style did not apply to the specimen (${JSON.stringify(outlineState)}).`);
      return outlineState;
    });

    await runCheck('switch, confirmation, and reset interactions', async () => {
      const switchButton = page.getByRole('switch', { name: '切换示意通知' });
      await switchButton.click();
      assert(await switchButton.getAttribute('aria-checked') === 'false'
        && (await page.locator('.sample-switch-row').innerText()).includes('通知已关闭'),
      'Switch action did not update the announced state.');

      await page.getByRole('button', { name: '确认设计', exact: true }).click();
      assert(await page.getByRole('button', { name: '已确认', exact: true }).isVisible()
        && (await page.locator('.specimen-caption').innerText()).includes('轻轻回弹'),
      'Confirmation did not update its visible feedback.');

      await page.getByRole('button', { name: '恢复默认', exact: true }).click();
      await page.waitForTimeout(500);
      const reset = await readRadiusState(page);
      assert(reset.output === '12 px' && reset.token === '12px' && reset.cardRadius === '12px' && reset.buttonRadius === '12px'
        && await page.getByRole('switch', { name: '切换示意通知' }).getAttribute('aria-checked') === 'true'
        && await page.locator('.sample-button').getAttribute('class').then(value => value.includes('style-0'))
        && await page.getByRole('button', { name: '已确认', exact: true }).count() === 0,
      `Reset did not restore the specimen defaults (${JSON.stringify(reset)}).`);
      return { switch: 'off then reset to on', confirmation: 'shown then reset', reset };
    });

    await runCheck('recording metadata, real playback, close button, Escape, and focus return', async () => {
      const opener = page.locator('.demo-aside .text-button');
      await opener.click();
      const dialog = page.locator('.video-dialog');
      await waitForOpen(page, true);
      const video = page.locator('.video-dialog video');
      const metadata = await video.evaluate(element => new Promise((resolve, reject) => {
        const finish = () => Number.isFinite(element.duration)
          ? resolve({ duration: element.duration, readyState: element.readyState })
          : reject(new Error('Recording metadata has no finite duration.'));
        if (element.readyState >= 1) return finish();
        element.addEventListener('loadedmetadata', finish, { once: true });
        element.addEventListener('error', () => reject(new Error('Recording failed to load metadata.')), { once: true });
        setTimeout(() => reject(new Error('Recording metadata timed out.')), 12000);
      }));
      assert(Math.abs(metadata.duration - 23.8) <= 0.15,
        `Recording duration was ${metadata.duration}, expected 23.8 seconds.`);
      const playStarted = await video.evaluate(async element => {
        try {
          await element.play();
          return true;
        } catch {
          return false;
        }
      });
      if (!playStarted) {
        await video.evaluate(element => element.focus());
        await page.keyboard.press('Space');
      }
      await page.waitForFunction(() => {
        const element = document.querySelector('.video-dialog video');
        return Boolean(element && element.currentTime > 0.1 && !element.paused);
      }, undefined, { timeout: 8000 });
      const playedAt = await video.evaluate(element => element.currentTime);
      assert(playedAt > 0.1, `Recording did not advance beyond 0.1 seconds (${playedAt}).`);
      await page.getByRole('button', { name: '关闭录屏', exact: true }).click();
      await waitForOpen(page, false);
      const closeRestoredFocus = await opener.evaluate(element => document.activeElement === element);
      assert(closeRestoredFocus, 'Closing the recording did not return focus to its opener.');

      await opener.click();
      await waitForOpen(page, true);
      await page.keyboard.press('Escape');
      await waitForOpen(page, false);
      const escapeRestoredFocus = await opener.evaluate(element => document.activeElement === element);
      assert(escapeRestoredFocus, 'Escape did not close the recording and return focus to its opener.');
      return { metadata, playedAtSeconds: playedAt, closeRestoredFocus, escapeRestoredFocus };
    });

    await runCheck('theme toggle changes and restores computed theme tokens', async () => {
      const toggle = page.locator('.theme-toggle');
      const initial = await page.evaluate(() => ({
        appearance: document.documentElement.dataset.appearance,
        surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
      }));
      await toggle.click();
      const dark = await page.evaluate(() => ({
        appearance: document.documentElement.dataset.appearance,
        surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
      }));
      assert(dark.appearance === 'dark' && dark.surface !== initial.surface,
        `Theme toggle did not change computed tokens (${JSON.stringify({ initial, dark })}).`);
      await toggle.click();
      const restored = await page.evaluate(() => ({
        appearance: document.documentElement.dataset.appearance,
        surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
      }));
      assert(restored.appearance === initial.appearance && restored.surface === initial.surface,
        `Theme toggle did not restore its initial state (${JSON.stringify({ initial, restored })}).`);
      return { initial, dark, restored };
    });

    await runCheck('restore default gallery states, reveal sections by scrolling, and save full-page screenshot', async () => {
      const productGroup = page.getByRole('group', { name: '查看真实业务页面' });
      await productGroup.getByRole('button', { name: '设备管理', exact: true }).click();
      const principle = page.locator('.principle-list > button').first();
      await principle.click();
      await page.getByRole('group', { name: '切换组件底座示意' }).getByRole('button', { name: 'AntD', exact: true }).click();
      await page.getByRole('group', { name: '查看适配层' }).getByRole('button', { name: '视觉', exact: true }).click();
      await page.getByRole('group', { name: '查看生成与交付步骤' }).getByRole('button').first().click();
      await page.getByRole('group', { name: '查看编辑器操作画面' }).getByRole('button', { name: '页面画布', exact: true }).click();
      const theme = await page.evaluate(() => document.documentElement.dataset.appearance);
      assert(theme === 'light', `Expected default light theme before full-page capture, got ${theme}.`);
      await page.setViewportSize({ width: 1280, height: 900 });
      const revealDetails = await revealPageByScrolling(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(180);
      const metrics = await layoutMetrics(page);
      assert(metrics.innerWidth === 1280 && metrics.innerHeight === 900, `Full-page capture viewport is ${metrics.innerWidth}x${metrics.innerHeight}.`);
      const screenshot = await saveScreenshot(page, 'desktop-1280x900-full-page', null, { fullPage: true });
      assert(screenshot.width === 1280 && screenshot.height > 900,
        `Full-page screenshot was not taller than the viewport (${screenshot.width}x${screenshot.height}).`);
      return { revealDetails, screenshot };
    });

    await desktop.close();
    await checkResponsive(browser, 390, 844, true);
    await checkResponsive(browser, 320, 800, true);
    await checkResponsive(browser, 768, 1024, false);

    await runCheck('aggregate browser pageerror and consoleerror', async () => {
      assert(results.runtimeErrors.length === 0,
        `Browser emitted ${results.runtimeErrors.length} runtime error(s): ${JSON.stringify(results.runtimeErrors)}.`);
      return { pageErrors: 0, consoleErrors: 0 };
    });
  } catch (error) {
    results.failure = safeErrorText(error.message);
    await log(`STOP ${results.failure}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    results.technical = results.failures.length === 0 && results.runtimeErrors.length === 0 && !results.failure
      ? 'passed'
      : 'failed';
    results.completedAt = new Date().toISOString();
    await writeFile(reportPath, JSON.stringify(results, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    const summary = {
      technical: results.technical,
      contract: results.contract,
      visual: results.visual,
      passedChecks: results.checks.filter(check => check.passed).length,
      failedChecks: results.checks.filter(check => !check.passed).map(check => ({ name: check.name, error: check.error })),
      runtimeErrors: results.runtimeErrors,
      screenshots: results.screenshots,
      evidence: relativeEvidencePath(evidenceDir)
    };
    console.log(JSON.stringify(summary, null, 2));
    if (results.technical === 'failed') process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`Formal website check failed: ${safeErrorText(error.message)}`);
  process.exitCode = 1;
});
