import { Button, PageLayout } from "@ai-readable/kit";

export function DeadActionLabelPage() {
  return (
    <PageLayout>
      <Button danger>{false ? "删除" : "保留"}</Button>
    </PageLayout>
  );
}
