import { Badge } from "@ai-readable/kit";

const domainCopy = {
  production: { label: "生产", variant: "geekblue" },
  ad: { label: "广告", variant: "purple" }
};

export function StaticValueEntryPage() {
  const selectedDomain = "production";
  const copy = domainCopy[selectedDomain];
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

export function StaticValueReassignedPage() {
  let copy = domainCopy.ad;
  copy = domainCopy.production;
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function fixed(value: string) {
  return value;
}

export function StaticValueFixedExpressionPage() {
  const copy = domainCopy[fixed("pro" + "duction")];
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}
