import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../lib/png.mjs';

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const imageDirectory = resolve(fixtureDirectory, 'images');
mkdirSync(imageDirectory, { recursive: true });

function createImage(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 244;
    data[offset + 1] = 247;
    data[offset + 2] = 250;
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

function fill(image, x, y, width, height, color) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = (row * image.width + column) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = color[3] ?? 255;
    }
  }
}

function makeBaseline(width = 80, height = 60) {
  const image = createImage(width, height);
  fill(image, 0, 0, width, 8, [25, 38, 61]);
  fill(image, 8, 12, Math.min(64, width - 8), Math.min(36, height - 12), [255, 255, 255]);
  fill(image, 16, 18, Math.min(48, width - 16), 5, [208, 216, 227]);
  fill(image, 16, 28, Math.min(32, width - 16), 4, [226, 231, 238]);
  fill(image, 16, 37, Math.min(24, width - 16), 7, [35, 104, 190]);
  return image;
}

function cloneImage(image) {
  return { width: image.width, height: image.height, data: new Uint8Array(image.data) };
}

function write(name, image) {
  writeFileSync(resolve(imageDirectory, name), encodePng(image));
}

const baseline = makeBaseline();
const passing = cloneImage(baseline);
fill(passing, 18, 29, 4, 3, [224, 229, 236]);
const failing = cloneImage(baseline);
fill(failing, 16, 18, 48, 26, [235, 92, 70]);
const mismatch = makeBaseline(81, 60);

write('baseline.png', baseline);
write('pass-candidate.png', passing);
write('fail-candidate.png', failing);
write('mismatch-candidate.png', mismatch);

process.stdout.write('Generated deterministic visual diff PNG fixtures in ' + imageDirectory + '\n');
