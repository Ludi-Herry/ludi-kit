#!/usr/bin/env node

import { runVisualDiff } from '../visual-diff/lib/runner.mjs';

function usage() {
  return [
    'Usage: node scripts/visual-diff.mjs --config <config.json>',
    '',
    'Exit codes:',
    '  0  all fixed visual thresholds passed',
    '  1  valid comparison exceeded a threshold',
    '  2  invalid arguments, config, image, region, dimensions, or output',
  ].join('\n');
}

function parseArguments(args) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return { help: true };
  if (args.length !== 2 || args[0] !== '--config' || !args[1]) {
    throw new Error('Exactly one --config argument is required');
  }
  return { config: args[1] };
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage() + '\n');
  } else {
    const result = runVisualDiff(options.config);
    process.stdout.write(
      'visual-diff: ' +
        (result.pass ? 'PASS' : 'FAIL') +
        '\nmetrics: ' +
        result.metricsPath +
        '\nheatmap: ' +
        result.heatmapPath +
        '\n',
    );
    if (!result.pass) {
      for (const failure of result.metrics.failures) process.stderr.write('- ' + failure + '\n');
      process.exitCode = 1;
    }
  }
} catch (error) {
  process.stderr.write('visual-diff: ERROR\n' + error.message + '\n');
  process.stderr.write(usage() + '\n');
  process.exitCode = 2;
}
