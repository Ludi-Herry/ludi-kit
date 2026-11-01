import type { HTMLAttributes, ReactNode, RefObject, TableHTMLAttributes } from "react";
import type { TableColumnsType as AntTableColumnsType } from "antd";
import { forwardRef, isValidElement, useId, useMemo, useRef, useState } from "react";
import {
  Button as AntButton,
  Card as AntCard,
  ConfigProvider,
  Input as AntInput,
  Modal as AntModal,
  Pagination as AntPagination,
  Segmented as AntSegmented,
  Select as AntSelect,
  Statistic as AntStatistic,
  Steps as AntSteps,
  Table as AntTable,
  Tabs as AntTabs,
  Tag as AntTag
} from "antd";
import zhCN from "antd/locale/zh_CN.js";

import { aiReadableAntdTheme } from "./foundation/index.js";
import { DownOutlined } from "./icons.js";

export type ThemeName = "vivid" | "calm" | "screen";
export const AI_READABLE_UNHANDLED_ACTION_EVENT = "ai-readable:unhandled-action";

const cx = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(" ");

function readableActionLabel(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (Array.isArray(node)) return node.map(readableActionLabel).filter(Boolean).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return readableActionLabel(node.props.children);
  return "该操作";
}

function reportUnhandledAction(label: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ label: string }>(AI_READABLE_UNHANDLED_ACTION_EVENT, { detail: { label } }));
}

type BaseProps = {
  className?: string;
};

export type AIReadableProviderProps = BaseProps & {
  theme?: ThemeName;
  children: ReactNode;
};

export function AIReadableProvider({ theme = "vivid", className, children }: AIReadableProviderProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cx("rd-root", className)} data-theme={theme} ref={rootRef}>
      <ConfigProvider
        button={{ autoInsertSpace: false }}
        getPopupContainer={() => rootRef.current ?? document.body}
        locale={zhCN}
        theme={aiReadableAntdTheme}
      >
        {children}
      </ConfigProvider>
    </div>
  );
}

export type ButtonProps = BaseProps & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  title?: string;
  type?: "button" | "submit" | "reset";
};

const antdButtonTypeByVariant: Record<NonNullable<ButtonProps["variant"]>, "primary" | "default" | "text"> = {
  primary: "primary",
  secondary: "default",
  outline: "default",
  ghost: "text",
  danger: "primary"
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  danger,
  icon,
  className,
  title,
  type = "button",
  onClick
}: ButtonProps) {
  return (
    <AntButton
      className={cx("rd-button", `rd-button--${variant}`, `rd-button--${size}`, className)}
      danger={danger || variant === "danger"}
      disabled={disabled || loading}
      htmlType={type}
      icon={icon}
      loading={loading ? { icon: <span aria-hidden="true" className="rd-spinner" /> } : false}
      aria-busy={loading || undefined}
      onClick={onClick ?? (() => reportUnhandledAction(readableActionLabel(children)))}
      title={title}
      type={antdButtonTypeByVariant[variant]}
    >
      {children}
    </AntButton>
  );
}

export type ConfirmDialogProps = BaseProps & {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  danger?: boolean;
  loading?: boolean;
  focusFallbackRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  danger,
  loading,
  focusFallbackRef,
  className,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const descriptionId = useId();

  return (
    <AntModal
      cancelButtonProps={{
        autoFocus: true,
        className: "rd-button rd-button--outline rd-button--md",
        disabled: loading
      }}
      afterClose={() => {
        const activeElement = document.activeElement;
        if ((!activeElement || activeElement === document.body || !activeElement.isConnected) && focusFallbackRef?.current?.isConnected) {
          focusFallbackRef.current.focus();
        }
      }}
      cancelText={cancelLabel}
      centered
      className="rd-confirm-dialog__dialog"
      classNames={{
        body: "rd-confirm-dialog__body",
        container: "rd-confirm-dialog__container",
        footer: "rd-confirm-dialog__footer",
        header: "rd-confirm-dialog__header",
        mask: "rd-confirm-dialog__mask",
        title: "rd-confirm-dialog__title",
        wrapper: "rd-confirm-dialog__wrapper"
      }}
      closable={false}
      confirmLoading={loading}
      destroyOnHidden
      focusable={{ focusTriggerAfterClose: true, trap: true }}
      keyboard={!loading}
      mask={{ closable: false }}
      okButtonProps={{
        autoFocus: false,
        className: cx("rd-button", danger ? "rd-button--danger" : "rd-button--primary", "rd-button--md"),
        danger
      }}
      okText={confirmLabel}
      open={open}
      panelRef={(node) => node?.setAttribute("aria-describedby", descriptionId)}
      rootClassName={cx("rd-confirm-dialog", className)}
      title={title}
      width={440}
      onCancel={() => {
        if (!loading) onCancel();
      }}
      onOk={() => {
        if (!loading) onConfirm();
      }}
    >
      <div className="rd-confirm-dialog__description" id={descriptionId}>{description}</div>
    </AntModal>
  );
}

export type ImportFlowStatus = "ready" | "processing" | "success" | "error";

export type ImportFlowProps = BaseProps & {
  status: ImportFlowStatus;
  accept?: string;
  fileName?: string;
  fileLabel?: ReactNode;
  helpText?: ReactNode;
  validationError?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
  onFileSelect?: (file: File | null) => void;
};

export function ImportFlow({
  status,
  accept,
  fileName,
  fileLabel = "导入文件",
  helpText,
  validationError,
  title,
  description,
  details,
  actions,
  className,
  onFileSelect
}: ImportFlowProps) {
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const busy = status === "processing";
  const stateTitle = title ?? {
    ready: "选择导入文件",
    processing: "正在处理导入",
    success: "导入成功",
    error: "导入失败"
  }[status];
  const describedBy = [helpText ? helpId : null, validationError ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <section
      aria-busy={busy || undefined}
      aria-labelledby={`${inputId}-title`}
      className={cx("rd-import-flow", `rd-import-flow--${status}`, className)}
      data-status={status}
    >
      <div className="rd-import-flow__heading">
        <span aria-hidden="true" className="rd-import-flow__state-mark" />
        <div>
          <h1 id={`${inputId}-title`}>{stateTitle}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {status === "ready" || status === "processing" ? (
        <div className="rd-import-flow__picker">
          <label className="rd-import-flow__file" htmlFor={inputId}>
            <span className="rd-import-flow__file-label">{fileLabel}</span>
            <input
              accept={accept}
              aria-describedby={describedBy}
              aria-invalid={validationError ? true : undefined}
              disabled={busy}
              id={inputId}
              type="file"
              onChange={(event) => onFileSelect?.(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <div aria-live="polite" className="rd-import-flow__selection">
            {fileName ? `已选择：${fileName}` : "尚未选择文件"}
          </div>
          {helpText ? <p className="rd-import-flow__help" id={helpId}>{helpText}</p> : null}
          {validationError ? <p className="rd-import-flow__error" id={errorId} role="alert">{validationError}</p> : null}
          {busy ? <p className="rd-import-flow__processing" role="status">正在校验并导入，请保持页面打开…</p> : null}
        </div>
      ) : (
        <div className="rd-import-flow__result" role={status === "error" ? "alert" : "status"}>
          {fileName ? <p>文件：{fileName}</p> : null}
          {details ? <div className="rd-import-flow__details">{details}</div> : null}
        </div>
      )}
      {actions ? <div aria-label="导入流程操作" className="rd-import-flow__actions">{actions}</div> : null}
    </section>
  );
}

export type InputProps = BaseProps & {
  id?: string;
  label?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  status?: "default" | "error";
  prefix?: ReactNode;
  suffix?: ReactNode;
  onChange?: (value: string) => void;
};

export function Input({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  value,
  defaultValue,
  placeholder,
  disabled,
  status = "default",
  prefix,
  suffix,
  className,
  onChange
}: InputProps) {
  const generatedId = useId();
  const controlId = id ?? (label ? `rd-input-${generatedId.replace(/:/g, "")}` : undefined);
  const control = (
    <span className={cx("rd-field", status === "error" && "rd-field--error", className)}>
      {prefix ? <span className="rd-field__affix">{prefix}</span> : null}
      <AntInput
        aria-describedby={ariaDescribedBy}
        aria-invalid={status === "error" || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className="rd-input"
        defaultValue={defaultValue}
        disabled={disabled}
        id={controlId}
        placeholder={placeholder}
        status={status === "error" ? "error" : undefined}
        value={value}
        variant="borderless"
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
      {suffix ? <span className="rd-field__affix">{suffix}</span> : null}
    </span>
  );
  return renderLabeledControl(label, controlId, control);
}

export type TextareaProps = BaseProps & {
  id?: string;
  label?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  status?: "default" | "error";
  onChange?: (value: string) => void;
};

export function Textarea({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  value,
  defaultValue,
  placeholder,
  disabled,
  rows = 4,
  status = "default",
  className,
  onChange
}: TextareaProps) {
  const generatedId = useId();
  const controlId = id ?? (label ? `rd-textarea-${generatedId.replace(/:/g, "")}` : undefined);
  const control = (
    <AntInput.TextArea
      aria-describedby={ariaDescribedBy}
      aria-invalid={status === "error" || undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cx("rd-textarea", status === "error" && "rd-textarea--error", className)}
      defaultValue={defaultValue}
      disabled={disabled}
      id={controlId}
      placeholder={placeholder}
      rows={rows}
      status={status === "error" ? "error" : undefined}
      value={value}
      variant="borderless"
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  );
  return renderLabeledControl(label, controlId, control);
}

export type SelectOption = {
  label: string;
  value: string;
};

export type SelectProps = BaseProps & {
  id?: string;
  label?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  status?: "default" | "error";
  options: SelectOption[];
  onChange?: (value: string) => void;
};

export function Select({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  value,
  defaultValue,
  placeholder,
  disabled,
  status = "default",
  options,
  className,
  onChange
}: SelectProps) {
  const generatedId = useId();
  const controlId = id ?? (label ? `rd-select-${generatedId.replace(/:/g, "")}` : undefined);
  const control = (
    <AntSelect<string>
      aria-describedby={ariaDescribedBy}
      aria-invalid={status === "error" || undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cx("rd-select", className)}
      classNames={{ popup: { root: "rd-select__popup" } }}
      defaultValue={defaultValue}
      disabled={disabled}
      getPopupContainer={(triggerNode) => triggerNode.closest(".rd-root") ?? triggerNode.parentElement ?? document.body}
      options={options}
      placeholder={placeholder}
      id={controlId}
      status={status === "error" ? "error" : undefined}
      suffixIcon={<DownOutlined aria-hidden="true" aria-label={undefined} className="rd-select__arrow" />}
      value={value}
      variant="borderless"
      onChange={(nextValue) => onChange?.(nextValue)}
    />
  );
  return renderLabeledControl(label, controlId, control);
}

export type CardProps = BaseProps & {
  title?: ReactNode;
  extra?: ReactNode;
  footer?: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  bordered?: boolean;
  variant?: "default" | "ghost";
  children: ReactNode;
};

export function Card({
  title,
  extra,
  footer,
  padding = "md",
  bordered = true,
  variant = "default",
  className,
  children
}: CardProps) {
  return (
    <AntCard
      actions={footer ? [footer] : undefined}
      className={cx(
        "rd-card",
        `rd-card--${padding}`,
        `rd-card--${variant}`,
        !bordered && "rd-card--borderless",
        className
      )}
      classNames={{
        actions: "rd-card__footer",
        body: "rd-card__body",
        extra: "rd-card__extra",
        header: "rd-card__header"
      }}
      extra={extra}
      title={title ? <h2>{title}</h2> : undefined}
      variant={bordered ? "outlined" : "borderless"}
    >
      {children}
    </AntCard>
  );
}

export type BadgeProps = BaseProps & {
  children: ReactNode;
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "processing"
    | "geekblue"
    | "cyan"
    | "purple";
  appearance?: "solid" | "soft" | "outline";
};

const badgeColorByVariant: Record<NonNullable<BadgeProps["variant"]>, string> = {
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
};

const badgeAppearanceByAppearance: Record<NonNullable<BadgeProps["appearance"]>, "filled" | "solid" | "outlined"> = {
  solid: "solid",
  soft: "filled",
  outline: "outlined"
};

export function Badge({ children, variant = "secondary", appearance = "soft", className }: BadgeProps) {
  return (
    <AntTag
      className={cx("rd-badge", `rd-badge--${variant}`, `rd-badge--${appearance}`, className)}
      color={badgeColorByVariant[variant]}
      variant={badgeAppearanceByAppearance[appearance]}
    >
      {children}
    </AntTag>
  );
}

export type TabsItem = {
  key: string;
  label: ReactNode;
  content: ReactNode;
};

export type TabsProps = BaseProps & {
  items: TabsItem[];
  defaultActiveKey?: string;
  activeKey?: string;
  variant?: "line" | "card";
  onChange?: (key: string) => void;
};

export function Tabs({ items, defaultActiveKey, activeKey, variant = "line", className, onChange }: TabsProps) {
  const firstKey = items[0]?.key ?? "";
  const [internalKey, setInternalKey] = useState(defaultActiveKey ?? firstKey);
  const currentKey = activeKey ?? internalKey;
  const resolvedKey = items.some((item) => item.key === currentKey) ? currentKey : firstKey;

  return (
    <AntTabs
      activeKey={resolvedKey}
      className={cx("rd-tabs", `rd-tabs--${variant}`, className)}
      classNames={{ header: "rd-tabs__list", item: "rd-tabs__tab" }}
      items={items.map((item) => ({
        children: item.content,
        className: "rd-tabs__panel",
        key: item.key,
        label: <span className={item.key === resolvedKey ? "rd-tabs__tab--active" : undefined}>{item.label}</span>
      }))}
      type={variant}
      onChange={(nextKey) => {
        setInternalKey(nextKey);
        onChange?.(nextKey);
      }}
    />
  );
}

export type SideNavItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  href?: string;
};

export type SideNavProps = BaseProps & {
  items: SideNavItem[];
  activeKey?: string;
  ariaLabel?: string;
  onSelect?: (key: string) => void;
};

export function SideNav({ items, activeKey, ariaLabel = "主导航", className, onSelect }: SideNavProps) {
  return (
    <nav className={cx("rd-sidenav", className)} aria-label={ariaLabel}>
      {items.map((item) => (
        <a
          aria-current={item.key === activeKey ? "page" : undefined}
          className={cx("rd-sidenav__item", item.key === activeKey && "rd-sidenav__item--active")}
          href={item.href ?? "#"}
          key={item.key}
          onClick={(event) => {
            if (!item.href) event.preventDefault();
            onSelect?.(item.key);
          }}
        >
          {item.icon ? <span className="rd-sidenav__icon">{item.icon}</span> : null}
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

export type ThemeToggleProps = BaseProps & {
  value?: Exclude<ThemeName, "screen">;
  onChange?: (theme: Exclude<ThemeName, "screen">) => void;
};

export function ThemeToggle({ value = "vivid", className, onChange }: ThemeToggleProps) {
  const labelByTheme = { vivid: "鲜明", calm: "沉静" } as const;
  return (
    <AntSegmented<Exclude<ThemeName, "screen">>
      aria-label="主题"
      className={cx("rd-theme-toggle", className)}
      classNames={{ item: "rd-theme-toggle__item", label: "rd-theme-toggle__label" }}
      options={(["vivid", "calm"] as const).map((theme) => ({
        label: (
          <span className={theme === value ? "rd-theme-toggle__item--active" : undefined}>
            {labelByTheme[theme]}
          </span>
        ),
        value: theme
      }))}
      value={value}
      onChange={(next) => onChange?.(next)}
    />
  );
}

export type AppShellProps = BaseProps & {
  nav?: ReactNode;
  header?: ReactNode;
  collapsed?: boolean;
  onCollapse?: () => void;
  children: ReactNode;
};

export function AppShell({ nav, header, collapsed, onCollapse, className, children }: AppShellProps) {
  return (
    <div className={cx("rd-app-shell", collapsed && "rd-app-shell--collapsed", className)}>
      {nav ? <aside className="rd-app-shell__nav">{nav}</aside> : null}
      <div className="rd-app-shell__main">
        {header ? (
          <header className="rd-app-shell__header">
            {onCollapse ? (
              <Button variant="ghost" size="sm" onClick={onCollapse}>
                菜单
              </Button>
            ) : null}
            {header}
          </header>
        ) : null}
        <main className="rd-app-shell__content">{children}</main>
      </div>
    </div>
  );
}

export type PageLayoutProps = BaseProps & {
  children: ReactNode;
  density?: "compact" | "standard" | "loose";
};

export function PageLayout({ children, density = "standard", className }: PageLayoutProps) {
  return <div className={cx("rd-page", `rd-page--${density}`, className)}>{children}</div>;
}

export type ForbiddenStateProps = BaseProps & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function ForbiddenState({
  title = "无权访问此页面",
  description = "当前账号缺少访问此页面所需的权限。请联系管理员申请权限，或返回可访问的页面。",
  actions,
  className
}: ForbiddenStateProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className={cx("rd-forbidden-state", className)}>
      <div aria-hidden="true" className="rd-forbidden-state__code">403</div>
      <h1 id={titleId}>{title}</h1>
      <p>{description}</p>
      {actions ? <div aria-label="无权限页面操作" className="rd-forbidden-state__actions">{actions}</div> : null}
    </section>
  );
}

export type PageHeaderProps = BaseProps & {
  title: ReactNode;
  breadcrumb?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
};

export function PageHeader({ title, breadcrumb, description, actions, tabs, className }: PageHeaderProps) {
  return (
    <header className={cx("rd-page-header", className)}>
      {breadcrumb ? <div className="rd-page-header__breadcrumb">{breadcrumb}</div> : null}
      <div className="rd-page-header__main">
        <div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="rd-page-header__actions">{actions}</div> : null}
      </div>
      {tabs ? <div className="rd-page-header__tabs">{tabs}</div> : null}
    </header>
  );
}

export type FilterField = {
  name: string;
  label: string;
  type?: "text" | "select";
  placeholder?: string;
  options?: SelectOption[];
};

export type FilterPanelProps = BaseProps & {
  fields: FilterField[];
  variant?: "inline" | "grid";
  collapsed?: boolean;
  defaultValues?: Record<string, string>;
  resetVisibility?: "always" | "auto";
  onSearch?: (values: Record<string, string>) => void;
  onReset?: () => void;
};

export function FilterPanel({
  fields,
  variant = "grid",
  collapsed,
  defaultValues,
  resetVisibility = "always",
  className,
  onSearch,
  onReset
}: FilterPanelProps) {
  const [values, setValues] = useState<Record<string, string>>(defaultValues ?? {});
  const filterId = useId().replace(/:/g, "");
  // rules/interaction-decisions.md §2：筛选项超过 3 个才提供「重置」
  const showReset = resetVisibility === "always" || fields.length > 3;
  if (collapsed) return null;

  return (
    <section className={cx("rd-filter", `rd-filter--${variant}`, className)}>
      <div className="rd-filter__fields">
        {fields.map((field, index) => {
          const controlId = `rd-filter-${filterId}-${index}`;
          return (
            <div className="rd-filter__field" key={field.name}>
              <label htmlFor={controlId}>{field.label}</label>
              {field.type === "select" ? (
                <Select
                  id={controlId}
                  options={field.options ?? []}
                  placeholder={field.placeholder ?? `请选择${field.label}`}
                  value={values[field.name] || undefined}
                  onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                />
              ) : (
                <Input
                  id={controlId}
                  placeholder={field.placeholder ?? `请输入${field.label}`}
                  value={values[field.name] ?? ""}
                  onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="rd-filter__actions">
        <Button variant="primary" onClick={() => onSearch ? onSearch(values) : reportUnhandledAction("查询")}>
          查询
        </Button>
        {showReset ? (
          <Button
            variant="outline"
            onClick={() => {
              setValues({});
              if (onReset) onReset();
              else reportUnhandledAction("重置");
            }}
          >
            重置
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export type DataSectionProps = BaseProps & {
  title: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  loading?: boolean;
  empty?: ReactNode;
  variant?: "default" | "dense";
  children?: ReactNode;
};

export const DataSection = forwardRef<HTMLElement, DataSectionProps>(function DataSection(
  { title, description, toolbar, loading, empty, variant = "default", className, children },
  ref
) {
  return (
    <section className={cx("rd-data-section", `rd-data-section--${variant}`, className)} ref={ref} tabIndex={-1}>
      <header className="rd-data-section__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {toolbar ? <div className="rd-data-section__toolbar">{toolbar}</div> : null}
      </header>
      {loading ? <div className="rd-empty">数据加载中…</div> : children ?? empty ?? <div className="rd-empty">暂无数据</div>}
    </section>
  );
});

export type BulkActionBarProps = BaseProps & {
  selectedCount: number;
  children: ReactNode;
  onClearSelection?: () => void;
};

export function BulkActionBar({ selectedCount, className, children, onClearSelection }: BulkActionBarProps) {
  const normalizedSelectedCount = Math.trunc(selectedCount);
  const safeSelectedCount = Number.isSafeInteger(normalizedSelectedCount) ? Math.max(0, normalizedSelectedCount) : 0;
  if (safeSelectedCount === 0) return null;

  return (
    <section aria-label="批量操作" className={cx("rd-bulk-action-bar", className)}>
      <div className="rd-bulk-action-bar__summary">
        <span aria-live="polite" role="status">已选择 <strong>{safeSelectedCount}</strong> 项</span>
        {onClearSelection ? (
          <Button size="sm" variant="ghost" onClick={onClearSelection}>取消选择</Button>
        ) : null}
      </div>
      <div aria-label="已选条目操作" className="rd-bulk-action-bar__actions" role="group">{children}</div>
    </section>
  );
}

export type MetricCardProps = BaseProps & {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  trend?: "up" | "down" | "flat";
  icon?: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  variant?: "default" | "compact";
};

export function MetricCard({ label, value, delta, trend = "flat", icon, unit, hint, variant = "default", className }: MetricCardProps) {
  return (
    <section className={cx("rd-metric", `rd-metric--${variant}`, className)}>
      <AntStatistic
        classNames={{ content: "rd-metric__value", title: "rd-metric__label" }}
        title={
          <>
            {icon}
            <span>{label}</span>
          </>
        }
        valueRender={() => (
          <>
            <strong>{value}</strong>
            {unit ? <span>{unit}</span> : null}
          </>
        )}
      />
      {delta || hint ? (
        <div className={cx("rd-metric__meta", `rd-metric__meta--${trend}`)}>
          {delta}
          {hint ? <span>{hint}</span> : null}
        </div>
      ) : null}
    </section>
  );
}

export type DetailHeaderProps = BaseProps & {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  avatar?: ReactNode;
};

export function DetailHeader({ title, subtitle, status, meta, actions, avatar, className }: DetailHeaderProps) {
  return (
    <section className={cx("rd-detail-header", className)}>
      {avatar ? <div className="rd-detail-header__avatar">{avatar}</div> : null}
      <div className="rd-detail-header__body">
        <div className="rd-detail-header__title">
          <h1>{title}</h1>
          {status}
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
        {meta ? <div className="rd-detail-header__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="rd-detail-header__actions">{actions}</div> : null}
    </section>
  );
}

export type DescriptionGridItem = {
  label: ReactNode;
  value: ReactNode;
};

export type DescriptionGridProps = BaseProps & {
  items: DescriptionGridItem[];
  columns?: 2 | 3 | 4;
};

export function DescriptionGrid({ items, columns = 3, className }: DescriptionGridProps) {
  return (
    <dl className={cx("rd-description-grid", `rd-description-grid--${columns}`, className)}>
      {items.map((item, index) => (
        <div className="rd-description-grid__item" key={index}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type FormSectionProps = BaseProps & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function FormSection({ title, description, actions, className, children }: FormSectionProps) {
  return (
    <section className={cx("rd-form-section", className)}>
      <header className="rd-form-section__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </header>
      <div className="rd-form-section__body">{children}</div>
    </section>
  );
}

export type TableColumn<T extends Record<string, unknown> = Record<string, unknown>> = {
  key: keyof T | string;
  title: ReactNode;
  render?: (record: T) => ReactNode;
};

export type TableProps<T extends Record<string, unknown> = Record<string, unknown>> = BaseProps & {
  columns: Array<TableColumn<T>>;
  dataSource: T[];
  rowKey?: keyof T | ((record: T, index: number) => string);
  empty?: ReactNode;
  density?: "default" | "compact";
};

export function Table<T extends Record<string, unknown>>({ columns, dataSource, rowKey, empty = "暂无数据", density = "default", className }: TableProps<T>) {
  const tableColumns = useMemo(() => toAntTableColumns(columns), [columns]);
  const indexedRows = useMemo(() => createIndexedRows(dataSource, rowKey), [dataSource, rowKey]);

  return (
    <div className={cx("rd-table-wrap", density === "compact" && "rd-table-wrap--compact", className)}>
      <AntTable<IndexedRow<T>>
        className="rd-table-root"
        columns={tableColumns}
        components={antdTableComponents}
        dataSource={indexedRows}
        locale={{ emptyText: <div className="rd-empty">{empty}</div> }}
        pagination={false}
        rowKey="key"
        size={density === "compact" ? "small" : undefined}
      />
    </div>
  );
}

export type DataGridColumn<T extends Record<string, unknown> = Record<string, unknown>> = TableColumn<T> & {
  sortable?: boolean;
};

export type DataGridProps<T extends Record<string, unknown> = Record<string, unknown>> = BaseProps & {
  columns: Array<DataGridColumn<T>>;
  dataSource: T[];
  rowKey?: keyof T | ((record: T, index: number) => string);
  pagination?: ReactNode;
  rowSelection?: boolean;
  selectedRowKeys?: string[];
  loading?: boolean;
  density?: "default" | "compact";
  sortable?: boolean;
  rowClassName?: (record: T, index: number) => string;
  onRow?: (record: T, index: number) => HTMLAttributes<HTMLTableRowElement>;
  onSelectionChange?: (selectedRowKeys: string[]) => void;
  onChange?: () => void;
};

export function DataGrid<T extends Record<string, unknown>>({
  columns,
  dataSource,
  rowKey,
  pagination,
  rowSelection,
  selectedRowKeys,
  loading,
  density = "default",
  sortable,
  rowClassName,
  onRow,
  onSelectionChange,
  onChange,
  className
}: DataGridProps<T>) {
  const gridColumns = useMemo(() => toAntTableColumns(columns, sortable), [columns, sortable]);
  const indexedRows = useMemo(() => createIndexedRows(dataSource, rowKey), [dataSource, rowKey]);

  return (
    <div className={cx("rd-data-grid", density === "compact" && "rd-data-grid--compact", className)} aria-busy={loading || undefined}>
      <div className="rd-table-wrap">
        <AntTable<IndexedRow<T>>
          className="rd-table-root"
          columns={gridColumns}
          components={antdTableComponents}
          dataSource={indexedRows}
          loading={loading ? { description: "数据加载中…", spinning: true } : false}
          locale={{ emptyText: loading ? null : <div className="rd-empty">暂无数据</div> }}
          pagination={false}
          rowClassName={rowClassName ? (row, index) => rowClassName(row.record, index) : undefined}
          rowKey="key"
          size={density === "compact" ? "small" : undefined}
          rowSelection={
            rowSelection
              ? {
                  getCheckboxProps: (row) => ({ "aria-label": `选择第 ${row.index + 1} 行` }),
                  getTitleCheckboxProps: () => ({ "aria-label": "全选" }),
                  selectedRowKeys,
                  onChange: (keys) => onSelectionChange?.(keys.map(String))
                }
              : undefined
          }
          showSorterTooltip={false}
          onRow={onRow ? (row, index) => onRow(row.record, index ?? row.index) : undefined}
          onChange={() => onChange?.()}
        />
      </div>
      {pagination ? <div className="rd-data-grid__pagination">{pagination}</div> : null}
    </div>
  );
}

export type PaginationProps = BaseProps & {
  page?: number;
  pageSize?: number;
  total?: number;
  disabled?: boolean;
  onPageChange?: (page: number) => void;
};

export function Pagination({
  page,
  pageSize = 20,
  total = 0,
  disabled,
  className,
  onPageChange
}: PaginationProps) {
  const [internalPage, setInternalPage] = useState(page ?? 1);
  const safeTotal = Math.max(0, Math.trunc(total));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const requestedPage = page ?? internalPage;
  const currentPage = Math.min(Math.max(1, Math.trunc(requestedPage)), pageCount);
  const start = safeTotal === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const end = safeTotal === 0 ? 0 : Math.min(safeTotal, currentPage * safePageSize);
  const rangeLabel = safeTotal === 0 ? "共 0 条" : `第 ${start}-${end} 条 · 共 ${safeTotal} 条`;

  const goToPage = (nextPage: number) => {
    if (page === undefined) setInternalPage(nextPage);
    onPageChange?.(nextPage);
  };

  return (
    <nav className={cx("rd-pagination", className)} aria-label="分页">
      <span className="rd-pagination__summary">
        <span>{rangeLabel}</span>
        <span className="rd-pagination__page">
          第 {currentPage} / {pageCount} 页
        </span>
      </span>
      {disabled ? (
        <div className="rd-pagination__actions" aria-disabled="true">
          <Button disabled size="sm" variant="outline">上一页</Button>
          <Button disabled size="sm" variant="outline">下一页</Button>
        </div>
      ) : (
        <AntPagination
          className="rd-pagination__actions"
          current={currentPage}
          nextIcon={<button className="rd-pagination__action" tabIndex={-1} type="button">下一页</button>}
          pageSize={safePageSize}
          prevIcon={<button className="rd-pagination__action" tabIndex={-1} type="button">上一页</button>}
          responsive={false}
          showSizeChanger={false}
          showTitle={false}
          total={safeTotal}
          onChange={goToPage}
        />
      )}
    </nav>
  );
}

export type StepperItem = {
  key: string;
  title: ReactNode;
  description?: ReactNode;
};

export type StepperProps = BaseProps & {
  items: StepperItem[];
  currentKey?: string;
};

export function Stepper({ items, currentKey, className }: StepperProps) {
  const currentIndex = Math.max(0, items.findIndex((item) => item.key === currentKey));
  return (
    <div className={cx("rd-stepper", className)}>
      <AntSteps
        aria-hidden="true"
        className="rd-stepper__visual"
        classNames={{
          itemContent: "rd-stepper__content",
          itemIcon: "rd-stepper__index",
          itemRail: "rd-stepper__rail",
          itemTitle: "rd-stepper__title"
        }}
        current={currentIndex}
        responsive={false}
        items={items.map((item, index) => ({
          className: cx(
            "rd-stepper__item",
            index < currentIndex && "rd-stepper__item--done",
            index === currentIndex && "rd-stepper__item--active"
          ),
          content: item.description ? <small>{item.description}</small> : undefined,
          icon: index + 1,
          key: item.key,
          title: <strong>{item.title}</strong>
        }))}
      />
      <ol aria-label="流程步骤" className="rd-sr-only">
        {items.map((item, index) => (
          <li aria-current={index === currentIndex ? "step" : undefined} key={item.key}>
            <span>{index < currentIndex ? "已完成：" : index === currentIndex ? "当前步骤：" : "未开始："}</span>
            {item.title}
            {item.description ? <span>，{item.description}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function getRowKey<T extends Record<string, unknown>>(
  record: T,
  index: number,
  rowKey?: keyof T | ((record: T, index: number) => string)
) {
  if (typeof rowKey === "function") return rowKey(record, index);
  if (rowKey) return String(record[rowKey]);
  return String(index);
}

type IndexedRow<T extends Record<string, unknown>> = {
  record: T;
  index: number;
  key: string;
};

function createIndexedRows<T extends Record<string, unknown>>(
  dataSource: T[],
  rowKey?: keyof T | ((record: T, index: number) => string)
) {
  const usedKeys = new Set<string>();
  return dataSource.map((record, index) => {
    const baseKey = getRowKey(record, index, rowKey);
    let key = baseKey;
    let duplicate = 1;
    while (usedKeys.has(key)) {
      key = `${baseKey}__rd_duplicate_${index}_${duplicate}`;
      duplicate += 1;
    }
    usedKeys.add(key);
    return { record, index, key };
  });
}

function toAntTableColumns<T extends Record<string, unknown>>(
  columns: Array<DataGridColumn<T>>,
  sortable = false
): AntTableColumnsType<IndexedRow<T>> {
  return columns.map((column) => ({
    key: String(column.key),
    sorter: sortable || column.sortable
      ? (left, right) => compareTableValues(left.record[column.key], right.record[column.key])
      : undefined,
    title: column.title,
    render: (_value, row) => column.render ? column.render(row.record) : String(row.record[column.key] ?? "")
  }));
}

function renderLabeledControl(label: ReactNode | undefined, controlId: string | undefined, control: ReactNode) {
  if (!label) return control;
  return (
    <div className="rd-form-field">
      <label className="rd-form-field__label" htmlFor={controlId}>{label}</label>
      {control}
    </div>
  );
}

function compareTableValues(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

const AIReadableTableElement = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  function AIReadableTableElement({ className, ...props }, ref) {
    return <table {...props} className={cx("rd-table", className)} ref={ref} />;
  }
);

const antdTableComponents = { table: AIReadableTableElement };
