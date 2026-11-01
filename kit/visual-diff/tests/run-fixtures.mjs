import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const visualDiffDirectory = resolve(testDirectory, '..');
const kitDirectory = resolve(visualDiffDirectory, '..');
const runner = resolve(kitDirectory, 'scripts', 'visual-diff.mjs');
const generator = resolve(visualDiffDirectory, 'fixtures', 'generate-fixtures.mjs');

function runNode(arguments_) {
  return spawnSync(process.execPath, arguments_, {
    cwd: kitDirectory,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const generated = runNode([generator]);
assert(generated.status === 0, 'Fixture generator failed:\n' + generated.stderr);

const cases = [
  ['pass', resolve(visualDiffDirectory, 'fixtures', 'pass', 'config.json'), 0],
  ['intentional threshold failure', resolve(visualDiffDirectory, 'fixtures', 'fail', 'config.json'), 1],
  ['dimension mismatch', resolve(visualDiffDirectory, 'fixtures', 'invalid', 'dimensions.json'), 2],
  ['invalid region', resolve(visualDiffDirectory, 'fixtures', 'invalid', 'region.json'), 2],
  ['missing threshold', resolve(visualDiffDirectory, 'fixtures', 'invalid', 'missing-threshold.json'), 2],
  ['changed fixed threshold', resolve(visualDiffDirectory, 'fixtures', 'invalid', 'changed-threshold.json'), 2],
  ['missing input', resolve(visualDiffDirectory, 'fixtures', 'invalid', 'missing-file.json'), 2],
  ['unsupported format', resolve(visualDiffDirectory, 'fixtures', 'invalid', 'format.json'), 2],
];

for (const [name, config, expectedExitCode] of cases) {
  const result = runNode([runner, '--config', config]);
  assert(
    result.status === expectedExitCode,
    name +
      ' returned ' +
      result.status +
      ', expected ' +
      expectedExitCode +
      '\nstdout:\n' +
      result.stdout +
      '\nstderr:\n' +
      result.stderr,
  );
  process.stdout.write(name + ': exit ' + result.status + '\n');
}

const passMetrics = JSON.parse(
  readFileSync(resolve(visualDiffDirectory, 'artifacts', 'pass', 'metrics.json'), 'utf8'),
);
const failMetrics = JSON.parse(
  readFileSync(resolve(visualDiffDirectory, 'artifacts', 'fail', 'metrics.json'), 'utf8'),
);
const passHeatmap = readFileSync(resolve(visualDiffDirectory, 'artifacts', 'pass', 'heatmap.png'));
const failHeatmap = readFileSync(resolve(visualDiffDirectory, 'artifacts', 'fail', 'heatmap.png'));
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

assert(passMetrics.result === 'pass', 'Pass metrics must record result=pass');
assert(failMetrics.result === 'fail', 'Fail metrics must record result=fail');
assert(passHeatmap.subarray(0, 8).equals(signature), 'Pass heatmap must be a PNG');
assert(failHeatmap.subarray(0, 8).equals(signature), 'Fail heatmap must be a PNG');

process.stdout.write(
  'pass metrics: RMS=' +
    passMetrics.global.rms +
    ', SSIM=' +
    passMetrics.global.ssim +
    ', changed=' +
    passMetrics.global.changedPixelRatio +
    '\n',
);
process.stdout.write(
  'fail metrics: RMS=' +
    failMetrics.global.rms +
    ', SSIM=' +
    failMetrics.global.ssim +
    ', changed=' +
    failMetrics.global.changedPixelRatio +
    '\n',
);
process.stdout.write('Visual diff fixture contract passed.\n');
