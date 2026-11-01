import { Badge } from "@ai-readable/kit";

const domainCopy = {
  ad: { label: "广告", variant: "purple" }
};

domainCopy.ad.label = "生产";

export function StaticValueMutationPage() {
  const copy = domainCopy.ad;
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}
