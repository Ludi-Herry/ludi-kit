import { Button, PageLayout } from "@ai-readable/kit";

export function DynamicRenderEvidencePage({ record }: { record: { active: boolean } }) {
  return (
    <PageLayout>
      {record.active ? <Button danger>删除</Button> : null}
    </PageLayout>
  );
}
