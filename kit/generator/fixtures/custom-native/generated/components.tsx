import type { ReactNode } from "react";

type BaseProps = { children?: ReactNode; className?: string };
type Option = { label: string; value: string };

export function ProjectThemeProvider({ children }: BaseProps) {
  return <div className="project-theme">{children}</div>;
}

export function PageLayout({ children, className }: BaseProps & { density?: "compact" }) {
  return <main className={className}>{children}</main>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="generated-native-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions}</header>;
}

export function Button({ children }: BaseProps & { variant?: string }) {
  return <button type="button">{children}</button>;
}

export function Badge({ children }: BaseProps & { variant?: string }) {
  return <span>{children}</span>;
}

export function Card({ title, children }: BaseProps & { title?: string; extra?: ReactNode }) {
  return <section className="generated-card">{title ? <h2>{title}</h2> : null}{children}</section>;
}

export function MetricCard({ label, value, unit }: { label: string; value: string | number; unit?: string; delta?: string; trend?: "up" | "down" | "flat" }) {
  return <article className="generated-card"><span>{label}</span><strong>{value}{unit ?? ""}</strong></article>;
}

export function FilterPanel({ fields }: { fields: { name: string; label: string; placeholder?: string }[] }) {
  return <form className="generated-actions">{fields.map((field) => <label key={field.name}>{field.label}<input placeholder={field.placeholder} /></label>)}</form>;
}

export function DataSection({ title, children, toolbar }: BaseProps & { title: string; description?: string; toolbar?: ReactNode }) {
  return <section className="generated-card"><header><h2>{title}</h2>{toolbar}</header>{children}</section>;
}

export function DataGrid({ dataSource, rowKey, columns }: { dataSource: Record<string, unknown>[]; rowKey: string; columns: { key: string; title: string }[]; rowSelection?: boolean; pagination?: ReactNode }) {
  return <table><thead><tr>{columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr></thead><tbody>{dataSource.map((row) => <tr key={String(row[rowKey])}>{columns.map((column) => <td key={column.key}>{String(row[column.key] ?? "")}</td>)}</tr>)}</tbody></table>;
}

export function Pagination() {
  return null;
}

export function Table(props: { dataSource: Record<string, unknown>[]; rowKey: string; columns: { key: string; title: string }[] }) {
  return <DataGrid {...props} />;
}

export function Tabs({ items }: { items: { key: string; label: string; content: ReactNode }[] }) {
  return <section>{items.map((item) => <article key={item.key}><h2>{item.label}</h2>{item.content}</article>)}</section>;
}

export function Stepper({ items }: { currentKey?: string; items: { key: string; title: string; description?: string }[] }) {
  return <ol>{items.map((item) => <li key={item.key}><strong>{item.title}</strong>{item.description ? <span>{item.description}</span> : null}</li>)}</ol>;
}

export function DetailHeader({ title, subtitle, actions }: { title: string; subtitle?: string; avatar?: string; status?: ReactNode; actions?: ReactNode }) {
  return <PageHeader title={title} description={subtitle} actions={actions} />;
}

export function DescriptionGrid({ items }: { items: { label: string; value?: string }[] }) {
  return <dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

export function FormSection({ title, description, children }: BaseProps & { title: string; description?: string }) {
  return <section className="generated-card"><h2>{title}</h2>{description ? <p>{description}</p> : null}{children}</section>;
}

export function Input({ label, placeholder }: { label: string; placeholder?: string; defaultValue?: string }) {
  return <label>{label}<input placeholder={placeholder} /></label>;
}

export function Select({ label, placeholder, options }: { label: string; placeholder?: string; options: Option[] }) {
  return <label>{label}<select aria-label={placeholder}>{options.map((option) => <option key={option.value}>{option.label}</option>)}</select></label>;
}

export function Textarea({ label, placeholder }: { label: string; placeholder?: string; rows?: number }) {
  return <label>{label}<textarea placeholder={placeholder} /></label>;
}
