import { FilterPanel, PageLayout } from "@ai-readable/kit";

function Unrelated(OFF: boolean) {
  return OFF;
}

export function ConstAliasDeadPage() {
  const LOCAL_OFF = false;
  return (
    <PageLayout>
      {OFF && <FilterPanel fields={[]}>CONST_ALIAS_AFTER_PAGE_DEAD_COPY</FilterPanel>}
      {LOCAL_OFF && <FilterPanel fields={[]}>CONST_ALIAS_LOCAL_DEAD_COPY</FilterPanel>}
      {SELF_NEGATING && <span>{String(Unrelated(true))}</span>}
    </PageLayout>
  );
}

const OFF = false;
const SELF_NEGATING = !SELF_NEGATING;
