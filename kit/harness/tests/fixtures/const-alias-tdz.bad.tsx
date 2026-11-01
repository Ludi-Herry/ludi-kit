import { FilterPanel, PageLayout } from "@ai-readable/kit";

export function ConstAliasTdzPage() {
  return (
    <PageLayout>
      {LATE && <FilterPanel fields={[]}>TDZ_COPY</FilterPanel>}
    </PageLayout>
  );
  const LATE = false;
}

export function DeadConstAliasTdzPage() {
  return (
    <PageLayout>
      {false && (DEAD_LATE && <FilterPanel fields={[]}>DEAD_TDZ_COPY</FilterPanel>)}
    </PageLayout>
  );
  const DEAD_LATE = false;
}
