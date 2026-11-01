import { Button, PageLayout } from "@ai-readable/kit";

export function NativeDangerPage() {
  return (
    <PageLayout>
      <Button>保留</Button>
      <button danger>删除</button>
    </PageLayout>
  );
}
