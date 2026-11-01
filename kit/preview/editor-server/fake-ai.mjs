import { readFile } from 'node:fs/promises';

const fixture=process.env.LUDI_AI_FIXTURE;
const delayText=process.env.LUDI_AI_FAKE_DELAY_MS??'0';

if(!fixture) {
  process.stderr.write('fake-ai: LUDI_AI_FIXTURE is required\n');
  process.exitCode=2;
} else if(!/^\d+$/.test(delayText)||!Number.isSafeInteger(Number(delayText))) {
  process.stderr.write('fake-ai: LUDI_AI_FAKE_DELAY_MS must be a non-negative integer\n');
  process.exitCode=2;
} else {
  try {
    for await(const _chunk of process.stdin) { /* Drain the prompt exactly as a real stdin CLI would. */ }
    const delayMs=Number(delayText);
    if(delayMs)await new Promise(resolveDelay=>setTimeout(resolveDelay,delayMs));
    process.stdout.write(await readFile(fixture));
  } catch(error) {
    process.stderr.write(`fake-ai: fixture read failed (${error.code??'UNKNOWN'})\n`);
    process.exitCode=2;
  }
}
