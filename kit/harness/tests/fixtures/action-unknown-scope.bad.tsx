import { Button, PageLayout } from "@ai-readable/kit";

export function UnknownActionScopePage({
  record,
  oppositeLabel,
  outsideLabel
}: {
  record: { status: string };
  oppositeLabel: string;
  outsideLabel: string;
}) {
  return (
    <PageLayout>
      <Button>{outsideLabel}</Button>
      {record.status === "active" ? <Button>删除</Button> : <Button>{oppositeLabel}</Button>}
    </PageLayout>
  );
}
