import { PageLayout } from "@ai-readable/kit";

function Sink(_props: { label: string }) {
  return <div>实际页面</div>;
}

export function TextLocalPropPage() {
  return (
    <PageLayout>
      <Sink label="LOCAL_PROP_COPY" />
    </PageLayout>
  );
}
