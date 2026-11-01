// 「基础」两个纯只读分组（图标、布局栅格）的右栏内容。
// 数据来自 bootstrap.foundations：服务端从项目源码扫描的 @ant-design/icons 用量、
// 小豆盒壳层宽度（app.tsx Sider width、styles.css .device-ops-page max-width）与 antd 6.5.0 断点。
// 两组都没有可写回的编辑器字段，各自标注原因；不出现可调用的假控件。

import type { FoundationsInfo } from "./api";

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="ludi-kv ludi-kv--readonly">
      <div className="ludi-kv__label">
        <span>{label}</span>
      </div>
      <div className="ludi-kv__control">
        <span className="ludi-kv__value" title={title}>
          {value}
        </span>
      </div>
    </div>
  );
}

// part：summary 只给常用的一眼信息（右栏主区），details 是技术细节（收进「更多设置」）；默认两者都渲染。
export type InfoPart = "summary" | "details" | "all";

export function IconsInfo({ icons, part = "all" }: { icons: FoundationsInfo["icons"] | null | undefined; part?: InfoPart }) {
  if (!icons) return part === "details" ? null : <div className="ludi-muted">接口未提供图标用量数据。</div>;
  const total = icons.files.reduce((sum, file) => sum + file.count, 0);
  return (
    <>
      {part !== "details" ? (
        <section className="ludi-group">
          <h3>图标库（只读）</h3>
          <Row label="使用总数" value={`${total} 处 · ${icons.files.length} 个文件`} />
          <div className="ludi-readonly">{icons.note}</div>
        </section>
      ) : null}
      {part !== "summary" ? (
        <section className="ludi-group">
          <h3>图标库</h3>
          <Row label="库" value={icons.library} />
        </section>
      ) : null}
      {part !== "summary" ? (
      <section className="ludi-group">
        <h3>各文件用量（只读）</h3>
        {icons.files.length === 0 ? <div className="ludi-muted">源码里没有发现图标引用。</div> : null}
        {icons.files.map((file) => (
          <div className="ludi-icon-usage" key={file.file}>
            <div className="ludi-icon-usage__head">
              <span className="ludi-icon-usage__file" title={file.file}>
                {file.file.split("/").pop() ?? file.file}
              </span>
              <code>{file.count} 处</code>
            </div>
            <div className="ludi-icon-usage__icons">{file.icons.join("、") || "—"}</div>
          </div>
        ))}
      </section>
      ) : null}
    </>
  );
}

export function GridInfo({ grid, part = "all" }: { grid: FoundationsInfo["grid"] | null | undefined; part?: InfoPart }) {
  if (!grid) return part === "details" ? null : <div className="ludi-muted">接口未提供栅格数据。</div>;
  return (
    <>
      {part !== "summary" ? (
        <section className="ludi-group">
          <h3>antd 断点（只读）</h3>
          {grid.breakpoints.map((item) => (
            <Row key={item.token} label={item.token} value={`${item.px}px`} />
          ))}
        </section>
      ) : null}
      {part !== "details" ? (
        <section className="ludi-group">
          <h3>小豆盒壳层宽度（只读）</h3>
          <Row label="侧栏宽度" value={grid.siderWidth === null ? "未在源码定位" : `${grid.siderWidth}px`} title={grid.sources[0]} />
          <Row label="内容最大宽度" value={grid.contentMaxWidth === null ? "未在源码定位" : `${grid.contentMaxWidth}px`} title={grid.sources[1]} />
          <div className="ludi-readonly">{grid.note}</div>
        </section>
      ) : null}
    </>
  );
}
