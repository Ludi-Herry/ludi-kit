import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { decodePng, encodePng } from './png.mjs';

export const FIXED_THRESHOLDS = Object.freeze({
  global: Object.freeze({
    minSsim: 0.985,
    maxRms: 0.035,
    pixelDeltaThreshold: 16 / 255,
    maxChangedPixelRatio: 0.025,
  }),
  region: Object.freeze({
    minSsim: 0.99,
    maxRms: 0.025,
    pixelDeltaThreshold: 16 / 255,
    maxChangedPixelRatio: 0.025,
  }),
});

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(label + ' must be a non-empty string');
  return value;
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    fail(label + ' must be an integer greater than or equal to ' + minimum);
  }
  return value;
}

function assertFixedThresholds(actual, expected, label) {
  if (!isPlainObject(actual)) fail(label + ' is required');
  for (const key of ['minSsim', 'maxRms', 'pixelDeltaThreshold', 'maxChangedPixelRatio']) {
    if (typeof actual[key] !== 'number' || !Number.isFinite(actual[key])) {
      fail(label + '.' + key + ' is required and must be a finite number');
    }
    if (actual[key] !== expected[key]) {
      fail(label + '.' + key + ' is fixed at ' + expected[key] + ' and cannot be changed');
    }
  }
}

function parseConfig(configPath) {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    fail('Could not read visual diff config: ' + error.message);
  }
  if (!isPlainObject(config)) fail('Visual diff config must be a JSON object');
  if (config.schemaVersion !== 1) fail('schemaVersion must equal 1');

  requireString(config.baseline, 'baseline');
  requireString(config.candidate, 'candidate');
  if (!isPlainObject(config.output)) fail('output is required');
  requireString(config.output.metrics, 'output.metrics');
  requireString(config.output.heatmap, 'output.heatmap');
  if (config.output.metrics === config.output.heatmap) fail('Metrics and heatmap outputs must be different files');
  assertFixedThresholds(config.thresholds, FIXED_THRESHOLDS.global, 'thresholds');

  if (!Array.isArray(config.regions) || config.regions.length === 0) {
    fail('regions must contain at least one critical region');
  }
  const names = new Set();
  for (const [index, region] of config.regions.entries()) {
    const label = 'regions[' + index + ']';
    if (!isPlainObject(region)) fail(label + ' must be an object');
    requireString(region.name, label + '.name');
    if (names.has(region.name)) fail('Critical region names must be unique');
    names.add(region.name);
    requireInteger(region.x, label + '.x');
    requireInteger(region.y, label + '.y');
    requireInteger(region.width, label + '.width', 1);
    requireInteger(region.height, label + '.height', 1);
    assertFixedThresholds(region.thresholds, FIXED_THRESHOLDS.region, label + '.thresholds');
  }
  return config;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readImage(path, label) {
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    fail(label + ' PNG could not be read: ' + error.message);
  }
  try {
    return { ...decodePng(bytes), bytes, sha256: sha256(bytes) };
  } catch (error) {
    fail(label + ' PNG is invalid or unsupported: ' + error.message);
  }
}

function compositeChannel(channel, alpha) {
  return (channel * alpha + 255 * (255 - alpha)) / (255 * 255);
}

function pixelRgb(image, pixelIndex) {
  const offset = pixelIndex * 4;
  const alpha = image.data[offset + 3];
  return [
    compositeChannel(image.data[offset], alpha),
    compositeChannel(image.data[offset + 1], alpha),
    compositeChannel(image.data[offset + 2], alpha),
  ];
}

function collectScopeMetrics(baseline, candidate, scope, thresholds) {
  const pixelCount = scope.width * scope.height;
  let squaredError = 0;
  let changedPixels = 0;
  let sumBaselineLuma = 0;
  let sumCandidateLuma = 0;
  const baselineLuma = new Float64Array(pixelCount);
  const candidateLuma = new Float64Array(pixelCount);
  let scopePixel = 0;

  for (let y = scope.y; y < scope.y + scope.height; y += 1) {
    for (let x = scope.x; x < scope.x + scope.width; x += 1) {
      const pixelIndex = y * baseline.width + x;
      const left = pixelRgb(baseline, pixelIndex);
      const right = pixelRgb(candidate, pixelIndex);
      let maxDelta = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = left[channel] - right[channel];
        squaredError += delta * delta;
        maxDelta = Math.max(maxDelta, Math.abs(delta));
      }
      if (maxDelta > thresholds.pixelDeltaThreshold) changedPixels += 1;
      const leftLuma = 0.2126 * left[0] + 0.7152 * left[1] + 0.0722 * left[2];
      const rightLuma = 0.2126 * right[0] + 0.7152 * right[1] + 0.0722 * right[2];
      baselineLuma[scopePixel] = leftLuma;
      candidateLuma[scopePixel] = rightLuma;
      sumBaselineLuma += leftLuma;
      sumCandidateLuma += rightLuma;
      scopePixel += 1;
    }
  }

  const rms = Math.sqrt(squaredError / (pixelCount * 3));
  const meanBaseline = sumBaselineLuma / pixelCount;
  const meanCandidate = sumCandidateLuma / pixelCount;
  let baselineVariance = 0;
  let candidateVariance = 0;
  let covariance = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const baselineCentered = baselineLuma[index] - meanBaseline;
    const candidateCentered = candidateLuma[index] - meanCandidate;
    baselineVariance += baselineCentered * baselineCentered;
    candidateVariance += candidateCentered * candidateCentered;
    covariance += baselineCentered * candidateCentered;
  }
  baselineVariance /= pixelCount;
  candidateVariance /= pixelCount;
  covariance /= pixelCount;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const ssim =
    ((2 * meanBaseline * meanCandidate + c1) * (2 * covariance + c2)) /
    ((meanBaseline ** 2 + meanCandidate ** 2 + c1) * (baselineVariance + candidateVariance + c2));
  const changedPixelRatio = changedPixels / pixelCount;

  const failures = [];
  if (rms > thresholds.maxRms) failures.push('normalized RMS ' + rms + ' exceeds ' + thresholds.maxRms);
  if (ssim < thresholds.minSsim) failures.push('SSIM ' + ssim + ' is below ' + thresholds.minSsim);
  if (changedPixelRatio > thresholds.maxChangedPixelRatio) {
    failures.push(
      'changed pixel ratio ' + changedPixelRatio + ' exceeds ' + thresholds.maxChangedPixelRatio,
    );
  }
  return { rms, ssim, changedPixels, pixelCount, changedPixelRatio, failures };
}

function roundMetric(value) {
  return Number(value.toFixed(12));
}

function serializeScope(metrics, thresholds) {
  return {
    rms: roundMetric(metrics.rms),
    ssim: roundMetric(metrics.ssim),
    changedPixels: metrics.changedPixels,
    pixelCount: metrics.pixelCount,
    changedPixelRatio: roundMetric(metrics.changedPixelRatio),
    thresholds: {
      minSsim: thresholds.minSsim,
      maxRms: thresholds.maxRms,
      pixelDeltaThreshold: thresholds.pixelDeltaThreshold,
      maxChangedPixelRatio: thresholds.maxChangedPixelRatio,
    },
    pass: metrics.failures.length === 0,
    failures: metrics.failures,
  };
}

function makeHeatmap(baseline, candidate) {
  const data = new Uint8Array(baseline.width * baseline.height * 4);
  for (let pixel = 0; pixel < baseline.width * baseline.height; pixel += 1) {
    const left = pixelRgb(baseline, pixel);
    const right = pixelRgb(candidate, pixel);
    const maximum = Math.max(
      Math.abs(left[0] - right[0]),
      Math.abs(left[1] - right[1]),
      Math.abs(left[2] - right[2]),
    );
    const intensity = Math.min(1, maximum * 4);
    const offset = pixel * 4;
    data[offset] = Math.round(28 + 227 * intensity);
    data[offset + 1] = Math.round(32 * (1 - intensity));
    data[offset + 2] = Math.round(38 * (1 - intensity));
    data[offset + 3] = 255;
  }
  return encodePng({ width: baseline.width, height: baseline.height, data });
}

function writeArtifact(path, data, label) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  } catch (error) {
    fail('Could not write ' + label + ': ' + error.message);
  }
}

export function runVisualDiff(configFile) {
  const configPath = resolve(configFile);
  const configDirectory = dirname(configPath);
  const config = parseConfig(configPath);
  const baselinePath = resolve(configDirectory, config.baseline);
  const candidatePath = resolve(configDirectory, config.candidate);
  const metricsPath = resolve(configDirectory, config.output.metrics);
  const heatmapPath = resolve(configDirectory, config.output.heatmap);
  if (baselinePath === candidatePath) fail('baseline and candidate must be different files');
  if ([baselinePath, candidatePath].includes(metricsPath) || [baselinePath, candidatePath].includes(heatmapPath)) {
    fail('Output files must not overwrite input images');
  }

  const baseline = readImage(baselinePath, 'Baseline');
  const candidate = readImage(candidatePath, 'Candidate');
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    fail(
      'Image dimensions differ: baseline is ' +
        baseline.width +
        'x' +
        baseline.height +
        ', candidate is ' +
        candidate.width +
        'x' +
        candidate.height,
    );
  }

  for (const region of config.regions) {
    if (region.x + region.width > baseline.width || region.y + region.height > baseline.height) {
      fail('Critical region "' + region.name + '" is outside the image bounds');
    }
  }

  const globalMetrics = collectScopeMetrics(
    baseline,
    candidate,
    { x: 0, y: 0, width: baseline.width, height: baseline.height },
    FIXED_THRESHOLDS.global,
  );
  const regionMetrics = config.regions.map((region) => {
    const measured = collectScopeMetrics(baseline, candidate, region, FIXED_THRESHOLDS.region);
    return {
      name: region.name,
      bounds: { x: region.x, y: region.y, width: region.width, height: region.height },
      ...serializeScope(measured, FIXED_THRESHOLDS.region),
    };
  });
  const failures = globalMetrics.failures.map((message) => 'global: ' + message);
  for (const region of regionMetrics) {
    failures.push(...region.failures.map((message) => 'region "' + region.name + '": ' + message));
  }

  const heatmap = makeHeatmap(baseline, candidate);
  writeArtifact(heatmapPath, heatmap, 'heatmap PNG');
  const metrics = {
    schemaVersion: 1,
    result: failures.length === 0 ? 'pass' : 'fail',
    images: {
      baseline: config.baseline,
      candidate: config.candidate,
      width: baseline.width,
      height: baseline.height,
      baselineSha256: baseline.sha256,
      candidateSha256: candidate.sha256,
    },
    formula: {
      colorComparison: 'sRGB channels composited over white and normalized to [0,1]',
      rms: 'sqrt(sum((baselineRGB-candidateRGB)^2)/(pixelCount*3))',
      ssim:
        'global luminance SSIM using BT.709 coefficients, population variance/covariance, K1=0.01, K2=0.03, L=1',
      changedPixel:
        'max absolute composited RGB channel delta strictly greater than pixelDeltaThreshold',
    },
    global: serializeScope(globalMetrics, FIXED_THRESHOLDS.global),
    regions: regionMetrics,
    failures,
    artifacts: {
      metrics: config.output.metrics,
      heatmap: config.output.heatmap,
      heatmapSha256: sha256(heatmap),
    },
  };
  writeArtifact(metricsPath, JSON.stringify(metrics, null, 2) + '\n', 'metrics JSON');
  return { pass: failures.length === 0, metrics, metricsPath, heatmapPath };
}
