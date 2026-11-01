import type { ReactNode } from "react";
import { isValidElement, useId, useState, forwardRef } from "react";
import { Alert, Button, Empty, Input, Select, Skeleton, Statistic, Tag } from "antd";

export const TIANSHU_UNHANDLED_ACTION_EVENT = "tianshu:unhandled-action";

type BaseProps = { className?: string };
type BadgeTone = "primary" | "secondary" | "success" | "warning" | "danger" | "info" | "processing" | "geekblue" | "cyan" | "purple";
type DemoVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type TianshuDataState = "loaded" | "loading" | "empty" | "error" | "stale";

const cx = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(" ");

function readableActionLabel(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (Array.isArray(node)) return node.map(readableActionLabel).filter(Boolean).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return readableActionLabel(node.props.children);
  return "该操作";
}

function reportUnhandledAction(label: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ label: string }>(TIANSHU_UNHANDLED_ACTION_EVENT, { detail: { label } }));
}

function requestedDemoDataState(): TianshuDataState {
  if (typeof window === "undefined") return "loaded";
  const value = new URLSearchParams(window.location.search).get("dataState");
  return value === "loading" || value === "empty" || value === "error" || value === "stale" ? value : "loaded";
}

export function tianshuBadgeColor(tone: BadgeTone) {
  return ({
    primary: "blue",
    secondary: "default",
    success: "success",
    warning: "warning",
    danger: "error",
    info: "blue",
    processing: "processing",
    geekblue: "geekblue",
    cyan: "cyan",
    purple: "purple"
  } as const)[tone];
}

export type TianshuBadgeProps = BaseProps & { children: ReactNode; variant?: BadgeTone; appearance?: "solid" | "soft" | "outline" };
export function TianshuBadge({ children, variant = "secondary", appearance = "soft", className }: TianshuBadgeProps) {
  const tagVariant = appearance === "solid" ? "solid" : appearance === "outline" ? "outlined" : "filled";
  return <Tag className={cx("tianshu-ui-badge", `tianshu-ui-badge--${variant}`, className)} color={tianshuBadgeColor(variant)} variant={tagVariant}>{children}</Tag>;
}

export function TianshuDemoButton({ children, variant = "primary", size = "md", danger, className, ...rest }: BaseProps & { children: ReactNode; variant?: DemoVariant; size?: "sm" | "md" | "lg"; disabled?: boolean; loading?: boolean; danger?: boolean; icon?: ReactNode; title?: string }) {
  return (
    <Button
      {...rest}
      className={cx("tianshu-ui-button", `tianshu-ui-button--${variant}`, className)}
      danger={danger || variant === "danger"}
      size={{ sm: "small", md: "middle", lg: "large" }[size] as "small" | "middle" | "large"}
      type={variant === "ghost" ? "text" : variant === "primary" || variant === "danger" ? "primary" : "default"}
      onClick={() => reportUnhandledAction(readableActionLabel(children))}
    >
      {children}
    </Button>
  );
}

export function TianshuPageLayout({ children, density = "standard", className }: BaseProps & { children: ReactNode; density?: "compact" | "standard" | "loose" }) {
  return <div className={cx("tianshu-ui-page", `tianshu-ui-page--${density}`, className)}>{children}</div>;
}

export function TianshuPageHeader({ title, breadcrumb, description, actions, tabs, className }: BaseProps & { title: ReactNode; breadcrumb?: ReactNode; description?: ReactNode; actions?: ReactNode; tabs?: ReactNode }) {
  return (
    <header className={cx("tianshu-ui-page-header", className)}>
      {breadcrumb ? <div className="tianshu-ui-page-header__breadcrumb">{breadcrumb}</div> : null}
      <div className="tianshu-ui-page-header__main">
        <div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
        {actions ? <div className="tianshu-ui-page-header__actions">{actions}</div> : null}
      </div>
      {tabs ? <div className="tianshu-ui-page-header__tabs">{tabs}</div> : null}
    </header>
  );
}

export const TianshuDataSection = forwardRef<HTMLElement, BaseProps & { title: ReactNode; description?: ReactNode; toolbar?: ReactNode; loading?: boolean; empty?: ReactNode; state?: TianshuDataState; staleAt?: ReactNode; onRetry?: () => void; variant?: "default" | "dense"; children?: ReactNode }>(
  function TianshuDataSection({ title, description, toolbar, loading, empty, state, staleAt = "最近一次成功同步：10 分钟前", onRetry, variant = "default", className, children }, ref) {
    const [retryResolved, setRetryResolved] = useState(false);
    const requestedState = state ?? (loading ? "loading" : requestedDemoDataState());
    const effectiveState = retryResolved && requestedState === "error" ? "loaded" : requestedState;
    const retry = () => {
      onRetry?.();
      if (!state && !loading && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("dataState");
        window.location.assign(url);
        return;
      }
      setRetryResolved(true);
    };
    const content = effectiveState === "loading"
      ? <Skeleton active paragraph={{ rows: 4 }} title={false} />
      : effectiveState === "empty"
        ? <Empty description={empty ?? "当前条件下暂无数据"} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        : effectiveState === "error"
          ? <Alert action={<Button onClick={retry}>重试</Button>} description="请检查网络连接后重试；本地演示不会写入外部业务系统。" title="数据加载失败" showIcon type="error" />
          : effectiveState === "stale"
            ? <><Alert title={<>数据可能已过期 · {staleAt}</>} showIcon type="warning" />{children ?? empty ?? <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />}</>
            : children ?? empty ?? <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

    return (
      <section aria-busy={effectiveState === "loading"} className={cx("tianshu-ui-data-section", `tianshu-ui-data-section--${variant}`, `tianshu-ui-data-section--${effectiveState}`, className)} ref={ref} tabIndex={-1}>
        <header className="tianshu-ui-data-section__header">
          <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
          {toolbar ? <div className="tianshu-ui-data-section__toolbar">{toolbar}</div> : null}
        </header>
        <div className="tianshu-ui-data-section__state">{content}</div>
      </section>
    );
  }
);

type TianshuFilterField = { name: string; label: string; type?: "text" | "select"; placeholder?: string; options?: Array<{ label: string; value: string }> };

export function TianshuFilterPanel({ fields, advancedContent, variant = "grid", collapsed, defaultValues, className, onSearch, onReset }: BaseProps & { fields: TianshuFilterField[]; advancedContent?: ReactNode; variant?: "inline" | "grid"; collapsed?: boolean; defaultValues?: Record<string, string>; onSearch?: (values: Record<string, string>) => void; onReset?: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(defaultValues ?? {});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const filterId = useId().replace(/:/g, "");
  const advancedId = `tianshu-filter-advanced-${filterId}`;
  const primaryFields = fields.slice(0, 3);
  const advancedFields = fields.slice(3);
  const hasAdvanced = advancedFields.length > 0 || Boolean(advancedContent);
  const renderFields = (items: TianshuFilterField[], offset = 0) => items.map((item, index) => {
    const id = `tianshu-filter-${filterId}-${index + offset}`;
    return (
      <div className="tianshu-ui-filter__field" key={item.name}>
        <label htmlFor={id}>{item.label}</label>
        {item.type === "select"
          ? <Select id={id} options={item.options ?? []} placeholder={item.placeholder ?? `请选择${item.label}`} value={values[item.name] || undefined} onChange={(value) => setValues((current) => ({ ...current, [item.name]: value }))} />
          : <Input id={id} placeholder={item.placeholder ?? `请输入${item.label}`} value={values[item.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [item.name]: event.currentTarget.value }))} />}
      </div>
    );
  });
  if (collapsed) return null;
  return (
    <section className={cx("tianshu-ui-filter", `tianshu-ui-filter--${variant}`, className)}>
      <div className="tianshu-ui-filter__body">
        <div className="tianshu-ui-filter__fields">
          {renderFields(primaryFields)}
        </div>
        {hasAdvanced && advancedOpen ? (
          <div className="tianshu-ui-filter__fields tianshu-ui-filter__fields--advanced" id={advancedId}>
            {renderFields(advancedFields, primaryFields.length)}
            {advancedContent}
          </div>
        ) : null}
      </div>
      <div className="tianshu-ui-filter__actions">
        <Button type="primary" onClick={() => onSearch ? onSearch(values) : reportUnhandledAction("查询")}>查询</Button>
        <Button onClick={() => { setValues({}); onReset ? onReset() : reportUnhandledAction("重置"); }}>重置</Button>
        {hasAdvanced ? <Button aria-controls={advancedId} aria-expanded={advancedOpen} type="text" onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? "收起筛选" : "高级筛选"}</Button> : null}
      </div>
    </section>
  );
}

export function TianshuBulkActionBar({ selectedCount, children, onClearSelection, className }: BaseProps & { selectedCount: number; children: ReactNode; onClearSelection?: () => void }) {
  if (selectedCount <= 0) return null;
  return <section aria-label="批量操作" className={cx("tianshu-ui-bulk-action-bar", className)}><div className="tianshu-ui-bulk-action-bar__summary"><span aria-live="polite" role="status">已选择 <strong>{selectedCount}</strong> 项</span>{onClearSelection ? <Button size="small" type="text" onClick={onClearSelection}>取消选择</Button> : null}</div><div aria-label="已选条目操作" className="tianshu-ui-bulk-action-bar__actions" role="group">{children}</div></section>;
}

export function TianshuMetricCard({ label, value, delta, trend = "flat", icon, unit, hint, variant = "default", className }: BaseProps & { label: ReactNode; value: ReactNode; delta?: ReactNode; trend?: "up" | "down" | "flat"; icon?: ReactNode; unit?: ReactNode; hint?: ReactNode; variant?: "default" | "compact" }) {
  const dataState = requestedDemoDataState();
  const metricContent = dataState === "loading"
    ? <Skeleton active paragraph={false} />
    : dataState === "empty"
      ? <Statistic title={<>{icon}<span>{label}</span></>} value="—" />
      : dataState === "error"
        ? <Alert title={<>{label} · 加载失败</>} showIcon type="error" />
        : <><Statistic title={<>{icon}<span>{label}</span></>} valueRender={() => <><strong>{value}</strong>{unit ? <span>{unit}</span> : null}</>} />{delta || hint || dataState === "stale" ? <div className={cx("tianshu-ui-metric__meta", `tianshu-ui-metric__meta--${trend}`)}>{delta}{hint ? <span>{hint}</span> : null}{dataState === "stale" ? <span>数据可能已过期</span> : null}</div> : null}</>;
  return <section aria-busy={dataState === "loading"} className={cx("tianshu-ui-metric", `tianshu-ui-metric--${variant}`, `tianshu-ui-metric--${dataState}`, className)}>{metricContent}</section>;
}

export function TianshuFormSection({ title, description, actions, className, children }: BaseProps & { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return <section className={cx("tianshu-ui-form-section", className)}><header className="tianshu-ui-form-section__header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{actions ? <div>{actions}</div> : null}</header><div className="tianshu-ui-form-section__body">{children}</div></section>;
}

export function TianshuForbiddenState({ title = "无权访问此页面", description = "当前账号缺少访问此页面所需的权限。请联系管理员申请权限，或返回可访问的页面。", actions, className }: BaseProps & { title?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <section className={cx("tianshu-ui-forbidden", className)}><div aria-hidden="true" className="tianshu-ui-forbidden__code">403</div><h1>{title}</h1><p>{description}</p>{actions ? <div className="tianshu-ui-forbidden__actions">{actions}</div> : null}</section>;
}
