import { Button, FilterPanel, PageLayout } from "@ai-readable/kit";

function Sink(_props: Record<string, unknown>) {
  return <div>sink</div>;
}

export function InertRenderPropsPage() {
  return (
    <PageLayout>
      <Sink render={() => <FilterPanel fields={[]}>INERT_RENDER_COPY</FilterPanel>} />
      <Sink columns={[{ render: () => <Button danger>惰性删除</Button> }]} />
    </PageLayout>
  );
}
