import { Button, PageLayout } from "@ai-readable/kit";

export function PageDangerUnknownPage({ label }: { label: string }) {
  return (
    <PageLayout>
      <Button danger>删除</Button>
      <Button>{label}</Button>
    </PageLayout>
  );
}
