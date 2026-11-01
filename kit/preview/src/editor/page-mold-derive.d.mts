import type { PageBlockMapEntry, PageRegistry } from "./page-blocks";

export function deriveRegistries(blockMap: PageBlockMapEntry[], patternsManifest: unknown): PageRegistry[];
