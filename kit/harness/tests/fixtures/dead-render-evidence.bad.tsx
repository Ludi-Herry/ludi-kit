import { Badge, Button, FilterPanel, PageLayout } from "@ai-readable/kit";

type StatusCopyEntry = { label: string; variant: string };

const statusCopy = {
  inbound: {
    "pending-inspection": { label: "待验收", variant: "warning" }
  }
} as const;

type StatusGroup = keyof typeof statusCopy;

function StatusBadge({ group, status }: { group: StatusGroup; status: string }) {
  const table = statusCopy[group] as Record<string, StatusCopyEntry>;
  const copy: StatusCopyEntry = table[status] ?? { label: status, variant: "info" };
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

export function DeadRenderEvidencePage() {
  const record = { status: "active" };
  return (
    <PageLayout>
      {false && <FilterPanel fields={[]}>DEAD_EXPECTED_COPY</FilterPanel>}
      {0 && <Button danger>删除</Button>}
      {null ? <StatusBadge group="inbound" status="pending-inspection" /> : <span>真实内容</span>}
      {<span>可见</span> || <Button danger>JSX 假动作</Button>}
      {false && (record.status === "active" ? <Button danger>条件删除</Button> : null)}
    </PageLayout>
  );
}
