import type { ReactNode } from "react";
import type { UploadFile as AntUploadFile, UploadProps as AntUploadProps } from "antd";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Checkbox as AntCheckbox,
  Drawer as AntDrawer,
  Radio as AntRadio,
  Switch as AntSwitch,
  TreeSelect as AntTreeSelect,
  Upload as AntUpload
} from "antd";

import { CloseOutlined, DownOutlined, UploadOutlined } from "./icons.js";

export type InteractionBaseProps = {
  className?: string;
};

export type InteractionStatus = "default" | "error";

export type InteractionFieldProps = InteractionBaseProps & {
  id?: string;
  label?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
  required?: boolean;
  status?: InteractionStatus;
};

const cx = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(" ");

function cleanReactId(id: string) {
  return id.replace(/:/g, "");
}

type FieldFrameProps = InteractionBaseProps & {
  children: ReactNode;
  controlId?: string;
  groupLabel?: boolean;
  label?: ReactNode;
  labelId?: string;
  required?: boolean;
  status?: InteractionStatus;
};

function FieldFrame({
  children,
  className,
  controlId,
  groupLabel,
  label,
  labelId,
  required,
  status = "default"
}: FieldFrameProps) {
  return (
    <div
      className={cx(
        "rd-interaction-field",
        status === "error" && "rd-interaction-field--error",
        className
      )}
    >
      {label ? (
        groupLabel ? (
          <span className="rd-interaction-field__label" id={labelId}>
            {label}
            {required ? <span aria-hidden="true" className="rd-interaction-field__required">*</span> : null}
          </span>
        ) : (
          <label className="rd-interaction-field__label" htmlFor={controlId} id={labelId}>
            {label}
            {required ? <span aria-hidden="true" className="rd-interaction-field__required">*</span> : null}
          </label>
        )
      ) : null}
      {children}
    </div>
  );
}

export type DrawerProps = InteractionBaseProps & {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  extra?: ReactNode;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  closeOnBackdrop?: boolean;
  unmountOnClose?: boolean;
  onClose: () => void;
};

const drawerSize: Record<NonNullable<DrawerProps["size"]>, string> = {
  sm: "min(480px, 100vw)",
  md: "min(640px, 100vw)",
  lg: "min(800px, 100vw)"
};

export function Drawer({
  children,
  className,
  closeOnBackdrop = false,
  extra,
  footer,
  loading,
  onClose,
  open,
  size = "md",
  title,
  unmountOnClose = false
}: DrawerProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | false>(false);
  const setAnchor = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const nextContainer = node?.closest(".rd-root") as HTMLElement | null | undefined;
    setPortalContainer((current) => current === nextContainer ? current : nextContainer ?? false);
  }, []);

  return (
    <div className="rd-drawer-anchor" ref={setAnchor}>
      <AntDrawer
        classNames={{
          root: "rd-drawer",
          mask: "rd-drawer__mask",
          wrapper: "rd-drawer__wrapper",
          section: "rd-drawer__panel",
          header: "rd-drawer__header",
          title: "rd-drawer__title",
          extra: "rd-drawer__extra",
          body: "rd-drawer__body",
          footer: "rd-drawer__footer",
          close: "rd-drawer__close"
        }}
        closable={{ "aria-label": "关闭", placement: "end" }}
        closeIcon={<CloseOutlined aria-hidden="true" aria-label={undefined} />}
        destroyOnHidden={unmountOnClose}
        extra={extra}
        focusable={{ focusTriggerAfterClose: true, trap: true }}
        footer={footer}
        getContainer={portalContainer}
        keyboard
        loading={loading}
        mask={{ enabled: true, closable: closeOnBackdrop }}
        open={open}
        placement="right"
        rootClassName={cx("rd-drawer", className)}
        size={drawerSize[size]}
        title={title}
        onClose={onClose}
      >
        {children}
      </AntDrawer>
    </div>
  );
}

export type DateMode = "date" | "datetime" | "time";
export type DateRangeValue = readonly [string, string];

type DateFieldProps = InteractionFieldProps & {
  mode?: DateMode;
  min?: string;
  max?: string;
  minuteStep?: number;
  clearable?: boolean;
  readOnly?: boolean;
  disabledDate?: (value: string) => boolean;
};

export type DatePickerProps = DateFieldProps & {
  value?: string | null;
  defaultValue?: string | null;
  placeholder?: string;
  onChange?: (value: string | null) => void;
};

export type DateRangePreset = {
  label: ReactNode;
  value: DateRangeValue;
};

export type RangePickerProps = DateFieldProps & {
  value?: DateRangeValue | null;
  defaultValue?: DateRangeValue | null;
  placeholders?: DateRangeValue;
  presets?: DateRangePreset[];
  onChange?: (value: DateRangeValue | null) => void;
};

const nativeInputTypeByMode: Record<DateMode, "date" | "datetime-local" | "time"> = {
  date: "date",
  datetime: "datetime-local",
  time: "time"
};

function isSerializedDateValue(value: string, mode: DateMode) {
  if (mode === "time") {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
  }

  const match = mode === "date"
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour = "00", minute = "00"] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
    && date.getUTCHours() === Number(hour)
    && date.getUTCMinutes() === Number(minute);
}

function normalizeDateValue(value: string | null | undefined, mode: DateMode) {
  return value && isSerializedDateValue(value, mode) ? value : "";
}

function nativeStep(mode: DateMode, minuteStep: number | undefined) {
  if (mode === "date") return undefined;
  return Math.min(59, Math.max(1, Math.trunc(minuteStep ?? 1))) * 60;
}

export function DatePicker({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  value,
  defaultValue,
  placeholder,
  mode = "date",
  min,
  max,
  minuteStep,
  clearable = true,
  readOnly,
  disabledDate,
  disabled,
  required,
  status = "default",
  className,
  onChange
}: DatePickerProps) {
  const generatedId = cleanReactId(useId());
  const controlId = id ?? `rd-date-picker-${generatedId}`;
  const labelId = label ? `${controlId}-label` : undefined;
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => normalizeDateValue(defaultValue, mode));
  const currentValue = controlled ? normalizeDateValue(value, mode) : internalValue;

  useEffect(() => {
    if (!controlled) setInternalValue(normalizeDateValue(defaultValue, mode));
  }, [controlled, defaultValue, mode]);

  const handleChange = (nextValue: string) => {
    if (!nextValue) {
      if (!clearable) return;
      if (!controlled) setInternalValue("");
      onChange?.(null);
      return;
    }
    if (!isSerializedDateValue(nextValue, mode) || disabledDate?.(nextValue)) return;
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  return (
    <FieldFrame
      className={className}
      controlId={controlId}
      label={label}
      labelId={labelId}
      required={required}
      status={status}
    >
      <div className="rd-date-picker">
        <input
          aria-describedby={ariaDescribedBy}
          aria-invalid={status === "error" || undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy ?? labelId}
          aria-required={required || undefined}
          className="rd-date-picker__input"
          disabled={disabled}
          id={controlId}
          max={normalizeDateValue(max, mode) || undefined}
          min={normalizeDateValue(min, mode) || undefined}
          placeholder={placeholder}
          readOnly={readOnly}
          required={required}
          step={nativeStep(mode, minuteStep)}
          type={nativeInputTypeByMode[mode]}
          value={currentValue}
          onChange={(event) => handleChange(event.currentTarget.value)}
        />
      </div>
    </FieldFrame>
  );
}

export function RangePicker({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  value,
  defaultValue,
  placeholders,
  presets,
  mode = "date",
  min,
  max,
  minuteStep,
  clearable = true,
  readOnly,
  disabledDate,
  disabled,
  required,
  status = "default",
  className,
  onChange
}: RangePickerProps) {
  const generatedId = cleanReactId(useId());
  const controlId = id ?? `rd-range-picker-${generatedId}`;
  const startId = `${controlId}-start`;
  const endId = `${controlId}-end`;
  const labelId = label ? `${controlId}-label` : undefined;
  const mergedPlaceholders: [string, string] = placeholders
    ? [placeholders[0], placeholders[1]]
    : [`${typeof label === "string" ? label : "日期"}开始`, `${typeof label === "string" ? label : "日期"}结束`];
  const controlled = value !== undefined;
  const normalizedControlled: [string, string] = value
    ? [normalizeDateValue(value[0], mode), normalizeDateValue(value[1], mode)]
    : ["", ""];
  const normalizedDefault: [string, string] = defaultValue
    ? [normalizeDateValue(defaultValue[0], mode), normalizeDateValue(defaultValue[1], mode)]
    : ["", ""];
  const [internalRange, setInternalRange] = useState<[string, string]>(normalizedDefault);
  const [draft, setDraft] = useState<[string, string]>(() => controlled ? normalizedControlled : normalizedDefault);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const nextRange: [string, string] = controlled ? normalizedControlled : normalizedDefault;
    if (!controlled) setInternalRange(nextRange);
    setDraft(nextRange);
    setEditing(false);
  }, [controlled, mode, normalizedControlled[0], normalizedControlled[1], normalizedDefault[0], normalizedDefault[1]]);

  const committedRange: [string, string] = controlled ? normalizedControlled : internalRange;
  const currentRange: [string, string] = editing ? draft : committedRange;
  const normalizedMin = normalizeDateValue(min, mode);
  const normalizedMax = normalizeDateValue(max, mode);
  const isCommittableRange = ([start, end]: [string, string]) => {
    if (!start && !end) return clearable;
    if (!start || !end) return false;
    if (!isSerializedDateValue(start, mode) || !isSerializedDateValue(end, mode)) return false;
    if (disabledDate?.(start) || disabledDate?.(end)) return false;
    if (normalizedMin && (start < normalizedMin || end < normalizedMin)) return false;
    if (normalizedMax && (start > normalizedMax || end > normalizedMax)) return false;
    return start <= end;
  };
  const commitRange = (nextRange: [string, string]) => {
    const [start, end] = nextRange;
    if (!isCommittableRange(nextRange)) return false;

    setDraft(nextRange);
    if (!controlled) setInternalRange(nextRange);
    setEditing(false);
    if (!start && !end) {
      onChange?.(null);
      return true;
    }
    onChange?.([start, end]);
    return true;
  };
  const updateDraft = (nextRange: [string, string]) => {
    setDraft(nextRange);
    setEditing(true);
  };
  const finishEditing = (nextRange: [string, string] = draft) => {
    const changed = nextRange[0] !== committedRange[0] || nextRange[1] !== committedRange[1];
    if (!editing && !changed) return;
    if (commitRange(nextRange)) return;
    setDraft(committedRange);
    setEditing(false);
  };

  return (
    <FieldFrame
      className={className}
      groupLabel
      label={label}
      labelId={labelId}
      required={required}
      status={status}
    >
      <div
        className="rd-range-picker__boundary"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          const inputs = event.currentTarget.querySelectorAll<HTMLInputElement>(".rd-range-picker__input");
          finishEditing([inputs[0]?.value ?? "", inputs[1]?.value ?? ""]);
        }}
      >
        <div
          aria-describedby={ariaDescribedBy}
          aria-invalid={status === "error" || undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy ?? labelId}
          aria-required={required || undefined}
          className="rd-range-picker"
          role="group"
        >
          <input
            aria-label={mergedPlaceholders[0]}
            className="rd-range-picker__input"
            disabled={disabled}
            id={startId}
            max={normalizedMax || undefined}
            min={normalizedMin || undefined}
            placeholder={mergedPlaceholders[0]}
            readOnly={readOnly}
            required={required}
            step={nativeStep(mode, minuteStep)}
            type={nativeInputTypeByMode[mode]}
            value={currentRange[0]}
            onChange={(event) => {
              if (!clearable && !event.currentTarget.value) return;
              updateDraft([event.currentTarget.value, currentRange[1]]);
            }}
          />
          <span aria-hidden="true" className="rd-range-picker__separator">—</span>
          <input
            aria-label={mergedPlaceholders[1]}
            className="rd-range-picker__input"
            disabled={disabled}
            id={endId}
            max={normalizedMax || undefined}
            min={normalizedMin || undefined}
            placeholder={mergedPlaceholders[1]}
            readOnly={readOnly}
            required={required}
            step={nativeStep(mode, minuteStep)}
            type={nativeInputTypeByMode[mode]}
            value={currentRange[1]}
            onChange={(event) => {
              if (!clearable && !event.currentTarget.value) return;
              updateDraft([currentRange[0], event.currentTarget.value]);
            }}
          />
        </div>
        {presets?.length ? (
          <div aria-label="常用日期范围" className="rd-range-picker__presets" role="group">
            {presets.map((preset, index) => (
              <button
                className="rd-range-picker__preset"
                disabled={disabled}
                key={index}
                type="button"
                onClick={() => commitRange([
                  normalizeDateValue(preset.value[0], mode),
                  normalizeDateValue(preset.value[1], mode)
                ])}
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FieldFrame>
  );
}

export type ChoiceOption = {
  label: ReactNode;
  value: string;
  disabled?: boolean;
};

export type RadioGroupProps = InteractionFieldProps & {
  name?: string;
  options: ChoiceOption[];
  value?: string;
  defaultValue?: string;
  layout?: "horizontal" | "vertical";
  onChange?: (value: string) => void;
};

export function RadioGroup({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  name,
  options,
  value,
  defaultValue,
  layout = "horizontal",
  disabled,
  required,
  status = "default",
  className,
  onChange
}: RadioGroupProps) {
  const generatedId = cleanReactId(useId());
  const controlId = id ?? `rd-radio-group-${generatedId}`;
  const labelId = label ? `${controlId}-label` : undefined;

  return (
    <FieldFrame
      className={className}
      groupLabel
      label={label}
      labelId={labelId}
      required={required}
      status={status}
    >
      <AntRadio.Group
        aria-describedby={ariaDescribedBy}
        aria-invalid={status === "error" || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? labelId}
        aria-required={required || undefined}
        className={cx("rd-radio-group", `rd-radio-group--${layout}`)}
        defaultValue={defaultValue}
        disabled={disabled}
        id={controlId}
        name={name}
        value={value}
        onChange={(event) => onChange?.(String(event.target.value))}
      >
        {options.map((option) => (
          <AntRadio
            classNames={{
              root: "rd-radio-group__option",
              icon: "rd-radio-group__icon",
              label: "rd-radio-group__label"
            }}
            disabled={option.disabled}
            key={option.value}
            required={required}
            value={option.value}
          >
            {option.label}
          </AntRadio>
        ))}
      </AntRadio.Group>
    </FieldFrame>
  );
}

export type CheckboxGroupProps = InteractionFieldProps & {
  name?: string;
  options: ChoiceOption[];
  value?: string[];
  defaultValue?: string[];
  layout?: "horizontal" | "vertical" | "grid";
  onChange?: (value: string[]) => void;
};

export function CheckboxGroup({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  name,
  options,
  value,
  defaultValue,
  layout = "horizontal",
  disabled,
  required,
  status = "default",
  className,
  onChange
}: CheckboxGroupProps) {
  const generatedId = cleanReactId(useId());
  const controlId = id ?? `rd-checkbox-group-${generatedId}`;
  const labelId = label ? `${controlId}-label` : undefined;

  return (
    <FieldFrame
      className={className}
      groupLabel
      label={label}
      labelId={labelId}
      required={required}
      status={status}
    >
      <AntCheckbox.Group
        aria-describedby={ariaDescribedBy}
        aria-invalid={status === "error" || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? labelId}
        aria-required={required || undefined}
        className={cx("rd-checkbox-group", `rd-checkbox-group--${layout}`)}
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        value={value}
        onChange={(nextValue) => onChange?.(nextValue.map(String))}
      >
        {options.map((option) => (
          <AntCheckbox
            classNames={{
              root: "rd-checkbox-group__option",
              icon: "rd-checkbox-group__icon",
              label: "rd-checkbox-group__label"
            }}
            disabled={option.disabled}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </AntCheckbox>
        ))}
      </AntCheckbox.Group>
    </FieldFrame>
  );
}

export type SwitchProps = InteractionBaseProps & {
  id?: string;
  label?: ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange?: (checked: boolean) => void;
};

export function Switch({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  checked,
  defaultChecked,
  disabled,
  loading,
  className,
  onChange
}: SwitchProps) {
  const generatedId = cleanReactId(useId());
  const controlId = id ?? `rd-switch-${generatedId}`;

  return (
    <div className={cx("rd-switch-field", className)}>
      <AntSwitch
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        checked={checked}
        className="rd-switch"
        classNames={{
          root: "rd-switch__root",
          content: "rd-switch__content",
          indicator: "rd-switch__indicator"
        }}
        defaultChecked={defaultChecked}
        disabled={disabled}
        id={controlId}
        loading={loading}
        onChange={(nextChecked) => onChange?.(nextChecked)}
      />
      {label ? <label className="rd-switch-field__label" htmlFor={controlId}>{label}</label> : null}
    </div>
  );
}

export type UploadStatus = "pending" | "uploading" | "success" | "error";

export type UploadItem = {
  id: string;
  name: string;
  status: UploadStatus;
  percent?: number;
  url?: string;
  error?: string;
};

export type UploadRejectReason = "type" | "size" | "count";

export type UploadProps = InteractionFieldProps & {
  variant?: "button" | "drag";
  accept?: string[];
  multiple?: boolean;
  maxCount?: number;
  maxSizeBytes?: number;
  items?: UploadItem[];
  triggerLabel?: ReactNode;
  onFilesSelected?: (files: File[]) => void;
  onRemove?: (item: UploadItem) => void;
  onReject?: (file: File, reason: UploadRejectReason) => void;
};

function uploadStatusToAntd(status: UploadStatus): AntUploadFile["status"] {
  if (status === "success") return "done";
  if (status === "pending") return undefined;
  return status;
}

function matchesAcceptedType(file: File, accept: string[] | undefined) {
  if (!accept?.length) return true;
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.toLowerCase();
  return accept.some((rule) => {
    const normalized = rule.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith(".")) return lowerName.endsWith(normalized);
    if (normalized.endsWith("/*")) return lowerType.startsWith(normalized.slice(0, -1));
    return lowerType === normalized;
  });
}

export function Upload({
  id,
  label,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  variant = "button",
  accept,
  multiple,
  maxCount,
  maxSizeBytes,
  items = [],
  triggerLabel = "选择文件",
  disabled,
  required,
  status = "default",
  className,
  onFilesSelected,
  onRemove,
  onReject
}: UploadProps) {
  const generatedId = cleanReactId(useId());
  const controlId = id ?? `rd-upload-${generatedId}`;
  const labelId = label ? `${controlId}-label` : undefined;
  const files = useMemo<AntUploadFile[]>(() => items.map((item) => ({
    uid: item.id,
    name: item.name,
    percent: item.percent,
    status: uploadStatusToAntd(item.status),
    url: item.url
  })), [items]);

  const handleBeforeUpload: NonNullable<AntUploadProps["beforeUpload"]> = (file, selectedFiles) => {
    if (file.uid !== selectedFiles[0]?.uid) return false;

    const acceptedFiles: File[] = [];
    for (const selectedFile of selectedFiles) {
      if (!matchesAcceptedType(selectedFile, accept)) {
        onReject?.(selectedFile, "type");
        continue;
      }
      if (maxSizeBytes !== undefined && selectedFile.size > maxSizeBytes) {
        onReject?.(selectedFile, "size");
        continue;
      }
      if (maxCount !== undefined && items.length + acceptedFiles.length >= maxCount) {
        onReject?.(selectedFile, "count");
        continue;
      }
      acceptedFiles.push(selectedFile);
    }
    if (acceptedFiles.length) onFilesSelected?.(acceptedFiles);
    return false;
  };

  const uploadProps: AntUploadProps = {
    accept: accept?.join(","),
    beforeUpload: handleBeforeUpload,
    classNames: {
      root: "rd-upload",
      trigger: "rd-upload__trigger",
      list: "rd-upload__list",
      item: "rd-upload__item"
    },
    disabled,
    fileList: files,
    id: controlId,
    itemRender: (originNode, file) => {
      const item = items.find((candidate) => candidate.id === file.uid);
      return (
        <div className="rd-upload__item-content">
          {originNode}
          {item?.error ? <span className="rd-upload__error" role="alert">{item.error}</span> : null}
        </div>
      );
    },
    multiple,
    onRemove: (file) => {
      const item = items.find((candidate) => candidate.id === file.uid);
      if (item) onRemove?.(item);
      return false;
    },
    showUploadList: true,
    supportServerRender: true
  };
  const trigger = (
    <button
      aria-label={ariaLabel}
      className="rd-upload__button"
      disabled={disabled}
      type="button"
    >
      <UploadOutlined aria-hidden="true" aria-label={undefined} className="rd-upload__button-icon" />
      <span>{triggerLabel}</span>
    </button>
  );

  return (
    <FieldFrame
      className={className}
      groupLabel
      label={label}
      labelId={labelId}
      required={required}
      status={status}
    >
      <div
        aria-describedby={ariaDescribedBy}
        aria-invalid={status === "error" || undefined}
        aria-labelledby={ariaLabelledBy ?? labelId}
        aria-required={required || undefined}
        className={cx("rd-upload-field", variant === "drag" && "rd-upload-field--drag")}
        role="group"
      >
        {variant === "drag" ? (
          <AntUpload.Dragger {...uploadProps}>{trigger}</AntUpload.Dragger>
        ) : (
          <AntUpload {...uploadProps}>{trigger}</AntUpload>
        )}
      </div>
    </FieldFrame>
  );
}

export type TreeOption = {
  label: ReactNode;
  value: string;
  children?: TreeOption[];
  disabled?: boolean;
  selectable?: boolean;
};

type TreeSelectBaseProps = InteractionFieldProps & {
  options: TreeOption[];
  placeholder?: string;
  searchable?: boolean;
  clearable?: boolean;
  loading?: boolean;
};

export type TreeSelectSingleProps = TreeSelectBaseProps & {
  selectionMode?: "single";
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
};

export type TreeSelectMultipleProps = TreeSelectBaseProps & {
  selectionMode: "multiple" | "checkbox";
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
};

export type TreeSelectProps = TreeSelectSingleProps | TreeSelectMultipleProps;

export function TreeSelect(props: TreeSelectProps) {
  const {
    id,
    label,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    options,
    placeholder,
    searchable = false,
    clearable = true,
    loading,
    disabled,
    required,
    status = "default",
    className
  } = props;
  const generatedId = cleanReactId(useId());
  const controlId = id ?? `rd-tree-select-${generatedId}`;
  const labelId = label ? `${controlId}-label` : undefined;
  const selectionMode = props.selectionMode ?? "single";
  const acceptsMany = selectionMode !== "single";

  const handleChange = (nextValue: string | string[] | null) => {
    if (acceptsMany) {
      const multipleProps = props as TreeSelectMultipleProps;
      const normalized = Array.isArray(nextValue)
        ? nextValue.map(String)
        : nextValue == null
          ? []
          : [String(nextValue)];
      multipleProps.onChange?.(normalized);
      return;
    }
    const singleProps = props as TreeSelectSingleProps;
    singleProps.onChange?.(nextValue == null ? null : String(Array.isArray(nextValue) ? nextValue[0] : nextValue));
  };

  return (
    <FieldFrame
      className={className}
      controlId={controlId}
      label={label}
      labelId={labelId}
      required={required}
      status={status}
    >
      <AntTreeSelect<string | string[] | null>
        aria-describedby={ariaDescribedBy}
        aria-invalid={status === "error" || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? labelId}
        aria-required={required || undefined}
        allowClear={clearable}
        classNames={{
          root: "rd-tree-select",
          input: "rd-tree-select__input",
          suffix: "rd-tree-select__suffix",
          content: "rd-tree-select__content",
          placeholder: "rd-tree-select__placeholder",
          item: "rd-tree-select__item",
          itemContent: "rd-tree-select__item-content",
          itemRemove: "rd-tree-select__item-remove",
          popup: {
            root: "rd-tree-select__popup",
            item: "rd-tree-select__popup-item",
            itemTitle: "rd-tree-select__popup-title",
            itemSwitcher: "rd-tree-select__popup-switcher"
          }
        }}
        defaultValue={props.defaultValue ?? undefined}
        disabled={disabled}
        id={controlId}
        loading={loading}
        multiple={selectionMode === "multiple"}
        placeholder={placeholder}
        popupMatchSelectWidth
        showCheckedStrategy={AntTreeSelect.SHOW_CHILD}
        showSearch={searchable}
        suffixIcon={<DownOutlined aria-hidden="true" aria-label={undefined} className="rd-tree-select__decorative-suffix" />}
        treeCheckable={selectionMode === "checkbox"}
        treeData={options}
        treeNodeFilterProp="label"
        value={props.value === undefined ? undefined : props.value}
        variant="borderless"
        onChange={handleChange}
      />
    </FieldFrame>
  );
}
