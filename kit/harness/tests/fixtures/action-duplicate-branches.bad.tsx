import { Button, PageLayout } from "@ai-readable/kit";

export function DuplicateBranchActionPage({ record }: { record: { active: boolean } }) {
  return (
    <PageLayout>
      {record.active ? <Button>吊销</Button> : <Button>吊销</Button>}
    </PageLayout>
  );
}
