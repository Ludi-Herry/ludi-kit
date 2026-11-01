import compactCatalog from "./catalog.compact.json";

export type ComponentMeta = {
  name: string;
  category: string;
  role: string;
  useWhen: string;
  variants: string[];
};

export const components: ComponentMeta[] = compactCatalog.components;
export const patterns = compactCatalog.patterns;

export { default as projectFlows } from "../../projects/sample-inventory-erp/flows.json";
export { default as projectPages } from "../../projects/sample-inventory-erp/pages.json";
