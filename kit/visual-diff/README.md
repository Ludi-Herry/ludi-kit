# Visual diff runner

这个 Windows 兼容 runner 比较同尺寸 PNG，输出机器可读 metrics JSON 和 RGBA heatmap。实现只使用 Node 内置模块。

## 权威合同

固定阈值由 [`lib/runner.mjs`](./lib/runner.mjs) 的 `FIXED_THRESHOLDS` 维护，完整有效配置见 [`fixtures/pass/config.json`](./fixtures/pass/config.json)。配置缺字段或改变固定阈值时，runner 以配置错误退出。

支持非交错 8-bit PNG：grayscale、RGB、indexed、grayscale-alpha 和 RGBA。比较前会把 alpha 合成到白色背景。

## 运行

从 `kit/` 执行：

```powershell
node visual-diff/fixtures/generate-fixtures.mjs
node scripts/visual-diff.mjs --config visual-diff/fixtures/pass/config.json
node scripts/visual-diff.mjs --config visual-diff/fixtures/fail/config.json
node scripts/visual-diff.mjs --config visual-diff/fixtures/invalid/dimensions.json
```

最后三个命令的预期退出码依次为：

- `0`：有效比较且通过全部阈值。
- `1`：有效比较，但至少一个阈值失败。
- `2`：输入、配置或输出错误。

有效比较把 metrics 和 heatmap 写入配置指定位置。尺寸不一致时不会写比较产物。

## 完整测试

```powershell
npm run test:visual-diff
```

raw diff verdict 必须原样保留。人工或语义判断使用独立字段和证据，不能覆盖机器结果。
