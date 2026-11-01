import type { ReactNode } from "react";
import { Button, Card, FilterPanel, PageLayout } from "@ai-readable/kit";

function DropChildren(_props: { children?: ReactNode }) {
  return <Card>实际页面</Card>;
}

export function ChildrenDropEvidencePage() {
  return (
    <PageLayout>
      <DropChildren>
        <FilterPanel fields={[]}>DROPPED_CHILD_COPY</FilterPanel>
        <Button danger>删除</Button>
      </DropChildren>
    </PageLayout>
  );
}
