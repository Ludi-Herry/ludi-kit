export interface RendererRegistryEntry {
  id: "three" | "beauti-map";
  admitted: boolean;
  role: "main-map" | "isolated-poc";
  lazy: boolean;
  source: string;
  decision: string;
}

export const rendererRegistry = {
  three: {
    id: "three",
    admitted: true,
    role: "main-map",
    lazy: true,
    source: "three@0.185.1 + Natural Earth public-domain GeoJSON",
    decision: "Admitted with lifecycle, context-loss, DPR, reduced-motion, and performance controls.",
  },
  "beauti-map": {
    id: "beauti-map",
    admitted: false,
    role: "isolated-poc",
    lazy: true,
    source: "JackQ888/beauti-map@eee4669026b9979689d6cfd119b536dc4d291986",
    decision: "NO-GO: missing full license/data provenance, broken UMD default export, and incomplete lifecycle gates.",
  },
} as const satisfies Record<string, RendererRegistryEntry>;

export function requireAdmittedRenderer(id: keyof typeof rendererRegistry): RendererRegistryEntry {
  const entry = rendererRegistry[id];
  if (!entry.admitted) throw new Error(`${id} is excluded from the formal renderer registry: ${entry.decision}`);
  return entry;
}

export async function loadThreeRenderer() {
  requireAdmittedRenderer("three");
  return import("./ThreeSituationRenderer");
}
