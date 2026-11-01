// 左栏底部「图层」：画布里是选中元素的祖先链 + 当前页可见的标记元素树；矩阵里是「组件 > 结构层」。
// 数据全部来自子页上报（layer-tree / element-detail / part-detail），点击节点只发出选中请求，
// 由子页滚动到可见、高亮并回报详情。只读，不提供任何修改入口。

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Crosshair } from "lucide-react";
import type { ElementDetail, LayerNode, LayerTreePayload, PartDetail } from "./bridge";
import type { Workspace } from "./nav-data";
import { SEMANTIC_STRUCTURE } from "./semantic-structure";
import { baseZhName } from "./element-names";
import { PAGE_REGISTRIES } from "./page-blocks";

// 图层树可见文字：区块用区块表里的中文名，antd 组件用中文名，没有语义的 div / section 叫「容器」；英文标识放在 title 悬停提示里。
const BLOCK_NAME = new Map(PAGE_REGISTRIES.flatMap((registry) => registry.blocks.map((block) => [block.id, block.name] as const)));
const nodeName = (node: { comp: string; b?: string }) => (node.b ? (BLOCK_NAME.get(node.b) ?? baseZhName(node.comp)) : baseZhName(node.comp));

export type LayerPanelProps = {
  workspace: Workspace;
  layers: LayerTreePayload | null;
  detail: ElementDetail | null;
  partDetail: PartDetail | null;
  onSelectNode: (loc: string, nth: number) => void;
  onSelectPart: (key: string, nth: number) => void;
  /** 选中的元素在某个已登记区块里（且不是区块本身）时，提供「选中所在区块」。 */
  blockLink?: { name: string; onClick: () => void } | null;
};

const keyOf = (loc: string, nth: number) => `${loc}#${nth}`;
const isAntd = (comp: string) => /^[A-Z]/.test(comp);

function Empty({ text }: { text: string }) {
  return (
    <div className="ludi-empty">
      <span className="ludi-empty__icon">
        <Crosshair aria-hidden size={16} strokeWidth={1.75} />
      </span>
      <strong>暂无图层</strong>
      <p>{text}</p>
    </div>
  );
}

function PageLayers({
  layers,
  detail,
  onSelectNode,
  blockLink
}: {
  layers: Extract<LayerTreePayload, { kind: "page" }>;
  detail: ElementDetail | null;
  onSelectNode: LayerPanelProps["onSelectNode"];
  blockLink?: LayerPanelProps["blockLink"];
}) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement | null>(null);

  const children = useMemo(() => {
    const map = new Map<number, LayerNode[]>();
    for (const node of layers.nodes) {
      const list = map.get(node.p) ?? [];
      list.push(node);
      map.set(node.p, list);
    }
    return map;
  }, [layers]);

  const selectedKey = detail ? keyOf(detail.selfLoc, detail.nth) : null;
  const blockByKey = useMemo(() => new Map(layers.nodes.filter((node) => node.b).map((node) => [keyOf(node.loc, node.nth), node.b as string])), [layers]);
  const crumbName = (item: { loc: string; comp: string; nth: number }) => nodeName({ comp: item.comp, b: blockByKey.get(keyOf(item.loc, item.nth)) });

  // 选中后展开它的全部祖先，并把选中行滚进可见范围。
  useEffect(() => {
    if (!detail) return;
    const keys = detail.ancestors.map((ancestor) => keyOf(ancestor.loc, ancestor.nth));
    setOpened((current) => new Set([...current, ...keys]));
    setCollapsed((current) => new Set([...current].filter((key) => !keys.includes(key))));
  }, [detail]);

  useEffect(() => {
    box.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [detail, layers, opened]);

  const isOpen = (node: LayerNode, depth: number) => {
    const key = keyOf(node.loc, node.nth);
    return opened.has(key) || (depth < 2 && !collapsed.has(key));
  };
  const toggle = (node: LayerNode, depth: number) => {
    const key = keyOf(node.loc, node.nth);
    const open = isOpen(node, depth);
    setOpened((current) => {
      const next = new Set(current);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
    setCollapsed((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const render = (parent: number, depth: number): ReactNode =>
    (children.get(parent) ?? []).map((node) => {
      const kids = children.get(node.i) ?? [];
      const open = kids.length > 0 && isOpen(node, depth);
      const key = keyOf(node.loc, node.nth);
      return (
        <div key={node.i}>
          <div
            className="ludi-layer"
            data-antd={isAntd(node.comp)}
            data-selected={key === selectedKey}
            role="treeitem"
            aria-expanded={kids.length > 0 ? open : undefined}
            aria-selected={key === selectedKey}
            style={{ paddingLeft: 6 + depth * 12 }}
          >
            <button
              aria-label={open ? "折叠" : "展开"}
              className="ludi-layer__caret"
              disabled={kids.length === 0}
              onClick={() => toggle(node, depth)}
              type="button"
            >
              {kids.length === 0 ? null : open ? (
                <ChevronDown aria-hidden size={12} strokeWidth={2} />
              ) : (
                <ChevronRight aria-hidden size={12} strokeWidth={2} />
              )}
            </button>
            <button className="ludi-layer__name" onClick={() => onSelectNode(node.loc, node.nth)} title={`${node.comp} · ${node.loc}`} type="button">
              <span>{nodeName(node)}</span>
              {node.t ? <em>{node.t}</em> : null}
            </button>
          </div>
          {open ? render(node.i, depth + 1) : null}
        </div>
      );
    });

  return (
    <div className="ludi-layers__body" ref={box}>
      {detail ? (
        <div className="ludi-layers__path" aria-label="祖先链">
          {[...detail.ancestors, { loc: detail.selfLoc, comp: detail.comp, nth: detail.nth }].map((item, index, all) => {
            const self = index === all.length - 1;
            return (
              <button
                className="ludi-layers__crumb"
                data-self={self}
                disabled={self}
                key={`${item.loc}-${index}`}
                onClick={() => onSelectNode(item.loc, item.nth)}
                title={`${item.comp} · ${item.loc}`}
                type="button"
              >
                {crumbName(item)}
              </button>
            );
          })}
        </div>
      ) : null}
      {blockLink ? (
        <button className="ludi-layers__block" onClick={blockLink.onClick} type="button">
          选中所在区块：{blockLink.name}
        </button>
      ) : null}
      {layers.nodes.length === 0 ? (
        <div className="ludi-muted">当前页没有可见的标记元素。</div>
      ) : (
        <div role="tree" aria-label="页面图层">
          {render(-1, 0)}
        </div>
      )}
      {layers.truncated ? (
        <div className="ludi-muted ludi-layers__note">
          已截断，只显示前 {layers.nodes.length} 个节点（可见标记元素共 {layers.total} 个）。
        </div>
      ) : null}
    </div>
  );
}

function MatrixLayers({
  layers,
  partDetail,
  onSelectPart
}: {
  layers: Extract<LayerTreePayload, { kind: "matrix" }>;
  partDetail: PartDetail | null;
  onSelectPart: LayerPanelProps["onSelectPart"];
}) {
  const meta = SEMANTIC_STRUCTURE[layers.component];
  const selected = partDetail && partDetail.component === layers.component ? partDetail.key : null;
  return (
    <div className="ludi-layers__body">
      <div role="tree" aria-label="组件结构层">
        <div className="ludi-layer" data-antd="true" data-selected={selected === "root"} role="treeitem" style={{ paddingLeft: 6 }}>
          <span className="ludi-layer__caret">
            <ChevronDown aria-hidden size={12} strokeWidth={2} />
          </span>
          <button className="ludi-layer__name" onClick={() => onSelectPart("root", 0)} title={layers.component} type="button">
            <span>{baseZhName(layers.component)}</span>
            <em>×{layers.rootCount}</em>
          </button>
        </div>
        {layers.parts
          .filter((part) => part.key !== "root")
          .map((part) => (
            <div
              className="ludi-layer"
              data-selected={selected === part.key}
              key={part.key}
              role="treeitem"
              style={{ paddingLeft: 6 + 12 }}
            >
              <span className="ludi-layer__caret" />
              <button
                className="ludi-layer__name"
                onClick={() => onSelectPart(part.key, 0)}
                title={`${part.key} · ${meta?.parts.find((item) => item.key === part.key)?.descriptionZh ?? ""}`}
                type="button"
              >
                <span>{meta?.parts.find((item) => item.key === part.key)?.descriptionZh.split("，")[0] ?? "内部区域"}</span>
                <em>×{part.count}</em>
              </button>
            </div>
          ))}
      </div>
      {meta && !meta.available ? (
        <div className="ludi-muted ludi-layers__note">{baseZhName(layers.component)}暂时只能选中组件整体。</div>
      ) : null}
    </div>
  );
}

export function LayerPanel(props: LayerPanelProps) {
  const { workspace, layers, detail, partDetail } = props;
  let body: ReactNode;
  if (workspace.kind === "canvas") {
    body =
      layers?.kind === "page" ? (
        <PageLayers blockLink={props.blockLink} detail={detail} layers={layers} onSelectNode={props.onSelectNode} />
      ) : (
        <Empty text="画布加载后显示当前页的元素树。" />
      );
  } else if (workspace.kind === "component") {
    body =
      layers?.kind === "matrix" && layers.component === workspace.name ? (
        <MatrixLayers layers={layers} onSelectPart={props.onSelectPart} partDetail={partDetail} />
      ) : (
        <Empty text="矩阵加载后显示组件的结构层。" />
      );
  } else {
    body = <Empty text="在画布或组件矩阵里点选后显示图层。" />;
  }
  return (
    <div className="ludi-layers">
      <h2>{workspace.kind === "component" ? "结构层" : "图层"}</h2>
      {body}
    </div>
  );
}
