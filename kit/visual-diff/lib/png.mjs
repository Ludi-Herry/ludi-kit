import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_DECODED_BYTES = 512 * 1024 * 1024;

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function assertPngDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('PNG dimensions must be positive integers');
  }
  if (width > 100_000 || height > 100_000) {
    throw new Error('PNG dimensions exceed the supported limit');
  }
}

export function decodePng(input) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (source.length < PNG_SIGNATURE.length || !source.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Input is not a PNG file');
  }

  let offset = 8;
  let header;
  let palette;
  let transparency;
  let sawEnd = false;
  const idatParts = [];

  while (offset < source.length) {
    if (offset + 12 > source.length) throw new Error('PNG chunk header is truncated');
    const length = source.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > source.length) throw new Error('PNG chunk data is truncated');

    const typeBytes = source.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    const data = source.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = source.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([typeBytes, data]));
    if (actualCrc !== expectedCrc) throw new Error('PNG chunk CRC mismatch for ' + type);

    if (!header && type !== 'IHDR') throw new Error('PNG IHDR must be the first chunk');
    if (type === 'IHDR') {
      if (header || length !== 13) throw new Error('PNG must contain exactly one valid IHDR');
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      assertPngDimensions(width, height);
      header = {
        width,
        height,
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      transparency = Buffer.from(data);
    } else if (type === 'IDAT') {
      idatParts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      if (length !== 0) throw new Error('PNG IEND must be empty');
      sawEnd = true;
      offset = chunkEnd;
      break;
    } else if ((typeBytes[0] & 0x20) === 0) {
      throw new Error('Unsupported critical PNG chunk: ' + type);
    }
    offset = chunkEnd;
  }

  if (!header || !sawEnd || offset !== source.length) throw new Error('PNG is missing a valid terminal IEND');
  if (header.bitDepth !== 8) throw new Error('Only 8-bit PNG files are supported');
  if (header.compression !== 0 || header.filter !== 0) throw new Error('Unsupported PNG compression or filter method');
  if (header.interlace !== 0) throw new Error('Interlaced PNG files are not supported');
  if (![0, 2, 3, 4, 6].includes(header.colorType)) throw new Error('Unsupported PNG color type');
  if (idatParts.length === 0) throw new Error('PNG has no image data');
  if (header.colorType === 3 && (!palette || palette.length === 0 || palette.length % 3 !== 0)) {
    throw new Error('Indexed PNG requires a valid palette');
  }

  const bytesPerPixel = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  const rowBytes = header.width * bytesPerPixel;
  const decodedLength = (rowBytes + 1) * header.height;
  if (!Number.isSafeInteger(decodedLength) || decodedLength > MAX_DECODED_BYTES) {
    throw new Error('Decoded PNG exceeds the supported memory limit');
  }

  let filtered;
  try {
    filtered = inflateSync(Buffer.concat(idatParts), { maxOutputLength: decodedLength + 1 });
  } catch (error) {
    throw new Error('PNG image data could not be inflated: ' + error.message);
  }
  if (filtered.length !== decodedLength) throw new Error('PNG image data has an unexpected length');

  const raw = Buffer.allocUnsafe(rowBytes * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filteredOffset = y * (rowBytes + 1);
    const filterType = filtered[filteredOffset];
    if (filterType > 4) throw new Error('PNG contains an unsupported row filter');
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = filtered[filteredOffset + 1 + x];
      const left = x >= bytesPerPixel ? raw[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? raw[rowOffset - rowBytes + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? raw[rowOffset - rowBytes + x - bytesPerPixel] : 0;
      let reconstructed;
      if (filterType === 0) reconstructed = encoded;
      else if (filterType === 1) reconstructed = encoded + left;
      else if (filterType === 2) reconstructed = encoded + above;
      else if (filterType === 3) reconstructed = encoded + Math.floor((left + above) / 2);
      else reconstructed = encoded + paeth(left, above, upperLeft);
      raw[rowOffset + x] = reconstructed & 0xff;
    }
  }

  const rgba = new Uint8Array(header.width * header.height * 4);
  const transparentGray = transparency?.length >= 2 ? transparency.readUInt16BE(0) : -1;
  const transparentRed = transparency?.length >= 6 ? transparency.readUInt16BE(0) : -1;
  const transparentGreen = transparency?.length >= 6 ? transparency.readUInt16BE(2) : -1;
  const transparentBlue = transparency?.length >= 6 ? transparency.readUInt16BE(4) : -1;

  for (let pixel = 0; pixel < header.width * header.height; pixel += 1) {
    const sourceOffset = pixel * bytesPerPixel;
    const targetOffset = pixel * 4;
    if (header.colorType === 0) {
      const gray = raw[sourceOffset];
      rgba[targetOffset] = gray;
      rgba[targetOffset + 1] = gray;
      rgba[targetOffset + 2] = gray;
      rgba[targetOffset + 3] = gray === transparentGray ? 0 : 255;
    } else if (header.colorType === 2) {
      const red = raw[sourceOffset];
      const green = raw[sourceOffset + 1];
      const blue = raw[sourceOffset + 2];
      rgba[targetOffset] = red;
      rgba[targetOffset + 1] = green;
      rgba[targetOffset + 2] = blue;
      rgba[targetOffset + 3] =
        red === transparentRed && green === transparentGreen && blue === transparentBlue ? 0 : 255;
    } else if (header.colorType === 3) {
      const paletteIndex = raw[sourceOffset];
      const paletteOffset = paletteIndex * 3;
      if (paletteOffset + 2 >= palette.length) throw new Error('PNG palette index is out of range');
      rgba[targetOffset] = palette[paletteOffset];
      rgba[targetOffset + 1] = palette[paletteOffset + 1];
      rgba[targetOffset + 2] = palette[paletteOffset + 2];
      rgba[targetOffset + 3] = transparency?.[paletteIndex] ?? 255;
    } else if (header.colorType === 4) {
      const gray = raw[sourceOffset];
      rgba[targetOffset] = gray;
      rgba[targetOffset + 1] = gray;
      rgba[targetOffset + 2] = gray;
      rgba[targetOffset + 3] = raw[sourceOffset + 1];
    } else {
      rgba[targetOffset] = raw[sourceOffset];
      rgba[targetOffset + 1] = raw[sourceOffset + 1];
      rgba[targetOffset + 2] = raw[sourceOffset + 2];
      rgba[targetOffset + 3] = raw[sourceOffset + 3];
    }
  }

  return { width: header.width, height: header.height, data: rgba };
}

export function encodePng({ width, height, data }) {
  assertPngDimensions(width, height);
  if (!(data instanceof Uint8Array) || data.length !== width * height * 4) {
    throw new Error('RGBA PNG data length does not match its dimensions');
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(scanlines, rowOffset + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND'),
  ]);
}
