import { Badge } from "@ai-readable/kit";

const domainCopy = {
  production: { label: "生产", variant: "geekblue" }
};

const otherCopy = {
  production: { label: "错误", variant: "danger" }
};

export function DeadStaticValuePage() {
  const copy = false ? domainCopy.production : otherCopy.production;
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}
