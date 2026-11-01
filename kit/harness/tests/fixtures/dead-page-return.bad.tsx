import { FilterPanel, PageLayout } from "@ai-readable/kit";

export function ThrownDeadReturnPage() {
  throw new Error("stop");
  return <FilterPanel fields={[]}>THROWN_DEAD_COPY</FilterPanel>;
}

export function InfiniteDeadReturnPage() {
  while (true) {
    if (false) break;
    while (true) break;
    switch (1) {
      case 1:
        break;
    }
  }
  return <PageLayout>INFINITE_DEAD_COPY</PageLayout>;
}
