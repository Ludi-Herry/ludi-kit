import { PageLayout } from "@ai-readable/kit";

function Sink(_props: { className: string }) {
  return <div>实际没有 class</div>;
}

export function ClassTokenLocalPropPage() {
  return (
    <PageLayout>
      <Sink className="generated-row--high" />
    </PageLayout>
  );
}
