import type { Key, ReactNode } from "react";
import type { DescriptionsProps, TableProps, UploadFile } from "antd";

type NativeColumn = {
  key: string;
  title: ReactNode;
  render?: (record: any) => ReactNode;
  sortable?: boolean;
  width?: number;
  minReadableWidth?: number;
  align?: "left" | "center" | "right";
  fixed?: "left" | "right";
  responsive?: Array<"xs" | "sm" | "md" | "lg" | "xl" | "xxl">;
};

function valueText(value: unknown) {
  return value == null ? "" : String(value);
}

const numericColumnPattern = /(?:count|quantity|total|amount|budget|cost|stock|available|locked|defect|rate|ratio|progress|days|devices|files)$/i;
const timeColumnPattern = /(?:time|date|created|updated|started|completed|published|window|slot)$/i;
const stateColumnPattern = /(?:status|state|result|risk)$/i;
const allBreakpoints = ["xs", "sm", "md", "lg", "xl", "xxl"] as const;
const fixedActionColumnWidth = 136;
const fixedColumnAdjacentMinWidth = 160;

export function mapTableColumns(columns: NativeColumn[]): TableProps<any>["columns"] {
  const hasFixedRightColumn = columns.some((column) => column.fixed === "right" || (column.key === "actions" && column.fixed !== "left"));

  return columns.map((column, index) => {
    const isAction = column.key === "actions";
    const isFixedRight = column.fixed === "right" || (isAction && column.fixed !== "left");
    const isState = stateColumnPattern.test(column.key);
    const isNumeric = numericColumnPattern.test(column.key);
    const isTime = timeColumnPattern.test(column.key);
    const defaultWidth = column.width
      ?? (isAction ? fixedActionColumnWidth : isState ? 112 : isNumeric ? 112 : isTime ? 176 : index === 0 ? 168 : 152);
    const width = Math.max(
      defaultWidth,
      column.minReadableWidth ?? (hasFixedRightColumn && index === 0 ? fixedColumnAdjacentMinWidth : 0)
    );
    const requestedResponsive = column.responsive
      ?? (index < 2 || isAction || isState
        ? [...allBreakpoints]
        : index < 4
          ? ["md", "lg", "xl", "xxl"]
          : ["lg", "xl", "xxl"]);
    const responsive = hasFixedRightColumn && index > 0 && !isFixedRight
      ? requestedResponsive.filter((breakpoint) => breakpoint !== "xs")
      : requestedResponsive;
    const align = column.align ?? (isAction || isNumeric ? "right" : isState ? "center" : "left");

    return {
      key: String(column.key),
      title: column.title,
      dataIndex: isAction ? undefined : String(column.key),
      width,
      align,
      fixed: isFixedRight ? "right" : column.fixed,
      responsive,
      sorter: column.sortable
        ? (left: any, right: any) => valueText(left[column.key]).localeCompare(valueText(right[column.key]))
        : undefined,
      render: (_value: unknown, record: any) => column.render ? column.render(record) : valueText(record[column.key])
    };
  });
}

export function rowSelectionConfig(selectedRowKeys?: string[], onSelectionChange?: (keys: string[]) => void): TableProps<any>["rowSelection"] {
  return {
    selectedRowKeys,
    onChange: (keys: Key[]) => onSelectionChange?.(keys.map(String))
  };
}

export function stepIndex(currentKey: string, items: Array<{ key: string } & Record<string, unknown>>) {
  return Math.max(0, items.findIndex((item) => item.key === currentKey));
}

export function toTabsItems(items: Array<{ key: string; label: ReactNode; content: ReactNode }>) {
  return items.map(({ content, ...item }) => ({ ...item, children: content }));
}

export function toDescriptionItems(items: Array<{ label: ReactNode; value: ReactNode }>): DescriptionsProps["items"] {
  return items.map((item, index) => ({ key: index, label: item.label, children: item.value }));
}

export function toUploadFileList(items?: Array<{ id: string; name: string; status: string }>): UploadFile[] {
  return (items ?? []).map((item) => ({
    uid: item.id,
    name: item.name,
    status: item.status === "success" ? "done" : "uploading"
  }));
}

export function toAcceptList(accept?: string[]) {
  return accept?.join(",");
}
