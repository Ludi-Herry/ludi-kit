import { Button, FilterPanel, PageLayout } from "@ai-readable/kit";

export function StaticComparisonDeadPage() {
  return (
    <PageLayout>
      {"a" === "b" && <FilterPanel fields={[]}>STATIC_COMPARISON_DEAD_COPY</FilterPanel>}
      {-0 && <Button danger>删除</Button>}
      {+0 && <span>ZERO_DEAD_COPY</span>}
    </PageLayout>
  );
}
