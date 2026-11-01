import { Badge } from "@ai-readable/kit";

const domainCopy = {
  production: { label: "生产", variant: "geekblue" }
};

export function StaticValueProofPage() {
  const copy = { label: "错误", variant: "danger", proof: domainCopy };
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}
