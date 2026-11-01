import { Button, PageLayout } from "@ai-readable/kit";

export function ActionLabelDynamicPage({ canDelete = false }: { canDelete?: boolean }) {
  return (
    <PageLayout>
      <Button danger>{canDelete ? "删除" : "保留"}</Button>
    </PageLayout>
  );
}
