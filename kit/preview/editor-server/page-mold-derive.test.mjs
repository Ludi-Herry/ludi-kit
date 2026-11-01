import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registries, literalExport } from './blocks.mjs';
import { deriveRegistries } from '../src/editor/page-mold-derive.mjs';

test('derived registries come from the page map plus manifest regions, one shared derivation', () => {
  const all = registries();
  assert.equal(all.length, 14);
  assert.equal(all.reduce((n, entry) => n + entry.blocks.length, 0), 51);

  // locked / owner 的唯一权威是 patterns.manifest.json：派生结果必须等于 manifest 当前声明。
  const manifest = JSON.parse(readFileSync(new URL('../../patterns.manifest.json', import.meta.url), 'utf8'));
  for (const entry of all) {
    const pattern = manifest.patterns[entry.patternId];
    assert.ok(pattern, `pattern ${entry.patternId} registered`);
    for (const block of entry.blocks) {
      if (block.region === null) continue;
      const skeleton = pattern.regions.find(region => region.id === block.region.id);
      assert.ok(skeleton, `${entry.pageId}.${block.id} region ${block.region.id} exists in ${entry.patternId}.regions`);
      assert.deepEqual(block.region, { id: skeleton.id, locked: skeleton.locked, owner: skeleton.owner });
    }
  }

  // 锁定语义抽样：列表页 filter 恒为 pattern/locked，详情页 hero 恒为 pattern/locked。
  assert.deepEqual(
    all.find(e => e.pageId === 'device-list').blocks.find(b => b.id === 'filter').region,
    { id: 'filter', locked: true, owner: 'pattern' }
  );
  assert.deepEqual(
    all.find(e => e.pageId === 'passport-detail').blocks.find(b => b.id === 'info').region,
    { id: 'hero', locked: true, owner: 'pattern' }
  );
  // 页级槽位随 manifest 走：form sections 为 locked pattern，actions 为 page 槽位。
  assert.deepEqual(
    all.find(e => e.pageId === 'flashing-form').blocks.find(b => b.id === 'form').region,
    { id: 'sections', locked: true, owner: 'pattern' }
  );
  assert.deepEqual(
    all.find(e => e.pageId === 'flashing-form').blocks.find(b => b.id === 'actions').region,
    { id: 'actions', locked: false, owner: 'page' }
  );
});

test('page-blocks.ts keeps PAGE_BLOCK_MAP as pure static data (server never evaluates TS)', () => {
  const source = readFileSync(new URL('../src/editor/page-blocks.ts', import.meta.url), 'utf8');
  const map = literalExport(source, 'PAGE_BLOCK_MAP');
  assert.equal(map.length, 14);
  // 映射里的 region 只是区域 id 字符串或 null，不再携带 locked / owner。
  for (const entry of map) {
    for (const block of entry.blocks) {
      assert.ok(block.region === null || typeof block.region === 'string', `${entry.pageId}.${block.id} region is an id reference`);
    }
  }
});

test('derivation fails closed when the map references unregistered pattern or region', () => {
  const manifest = { patterns: { 'list-page': { regions: [{ id: 'filter', locked: true, owner: 'pattern' }] } } };
  const base = { pageId: 'p', route: '/p', patternId: 'list-page', patternLabel: 'x', pageGoal: 'x', rootSelector: '.x', firstViewport: [], requiredComponents: [], blocks: [] };

  assert.throws(
    () => deriveRegistries([{ ...base, patternId: 'missing-pattern' }], manifest),
    /模式 missing-pattern 不在 patterns\.manifest\.json/
  );
  assert.throws(
    () => deriveRegistries([{ ...base, blocks: [{ id: 'b', region: 'shell', selector: 's', name: 'n', purpose: 'p', layoutTreeItem: 'l', firstViewportItem: null, successCriteria: [], doNotOnDelete: [], source: 's' }] }], manifest),
    /引用的区域 shell 不在 list-page\.regions/
  );
  assert.throws(
    () => deriveRegistries([{ ...base, blocks: [{ id: 'b', region: { id: 'filter' }, selector: 's', name: 'n', purpose: 'p', layoutTreeItem: 'l', firstViewportItem: null, successCriteria: [], doNotOnDelete: [], source: 's' }] }], manifest),
    /region 必须是区域 id 或 null/
  );
  assert.throws(() => deriveRegistries([{ ...base, blocks: 'x' }], manifest), /页面对应关系条目无效/);
  assert.throws(() => deriveRegistries([], {}), /缺少 patterns/);

  // null region 原样通过，不查 manifest。
  const ok = deriveRegistries([{ ...base, blocks: [{ id: 'b', region: null, selector: 's', name: 'n', purpose: 'p', layoutTreeItem: 'l', firstViewportItem: null, successCriteria: [], doNotOnDelete: [], source: 's' }] }], manifest);
  assert.equal(ok[0].blocks[0].region, null);
});
