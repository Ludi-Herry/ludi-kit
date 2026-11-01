// 页面区块登记派生逻辑，集中在这一个文件（编辑器壳与 editor-server 共用，避免两边各写一份转换）。
// 输入：页面对应关系（page-blocks.ts 的 PAGE_BLOCK_MAP 静态数据）+ kit/patterns.manifest.json；
// 输出：生效区块登记（PAGE_REGISTRIES 形状）。
// 唯一权威规则：区块 region 的 id 由页面对应关系给出；locked / owner 只取自 patterns.manifest.json，
// 两份数据不回抄。派生时 fail-closed：映射引用的 pattern 或 region 不在 manifest 中直接抛错。
export function deriveRegistries(blockMap, patternsManifest) {
  if (!Array.isArray(blockMap)) throw new Error('页面对应关系必须是数组');
  const patterns = patternsManifest?.patterns;
  if (!patterns || typeof patterns !== 'object') throw new Error('patterns.manifest.json 缺少 patterns');
  return blockMap.map((entry) => {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.blocks)) throw new Error(`页面对应关系条目无效：${entry?.pageId ?? '?'}`);
    const pattern = patterns[entry.patternId];
    if (!pattern) throw new Error(`页面 ${entry.pageId} 引用的模式 ${entry.patternId} 不在 patterns.manifest.json 中`);
    const regions = Array.isArray(pattern.regions) ? pattern.regions : [];
    const blocks = entry.blocks.map((block) => {
      if (!block || typeof block !== 'object') throw new Error(`页面 ${entry.pageId} 的区块登记无效`);
      if (block.region === null) return { ...block, region: null };
      if (typeof block.region !== 'string') throw new Error(`页面 ${entry.pageId} 区块 ${block.id} 的 region 必须是区域 id 或 null`);
      const skeleton = regions.find((region) => region.id === block.region);
      if (!skeleton) throw new Error(`页面 ${entry.pageId} 区块 ${block.id} 引用的区域 ${block.region} 不在 ${entry.patternId}.regions 中`);
      return { ...block, region: { id: skeleton.id, locked: skeleton.locked, owner: skeleton.owner } };
    });
    return { ...entry, blocks };
  });
}
