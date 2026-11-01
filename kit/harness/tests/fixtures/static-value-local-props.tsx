import { Badge, Table } from "@ai-readable/kit";

const domainCopy = {
  production: { label: "生产", variant: "geekblue" },
  ad: { label: "广告", variant: "purple" }
};

type Domain = keyof typeof domainCopy;

function DomainTag({ domain }: { domain: Domain }) {
  const copy = domainCopy[domain];
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function DomainTagProps(props: { domain: Domain }) {
  const copy = domainCopy[props.domain];
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

function DomainWrapper({ domain }: { domain: Domain }) {
  return <DomainTag domain={domain} />;
}

export function StaticValueFixedPropPage() {
  return <DomainTag domain="production" />;
}

export function StaticValueTwoCallsPage() {
  return (
    <>
      <DomainTag domain="production" />
      <DomainTag domain="ad" />
    </>
  );
}

export function StaticValueSpreadPropPage() {
  return <DomainTag {...{ domain: "ad" }} />;
}

export function StaticValueDynamicPropPage({ domain }: { domain: Domain }) {
  return <DomainTag domain={domain} />;
}

export function StaticValueMissingPropPage() {
  return <DomainTag />;
}

export function StaticValueTableCallbackPage() {
  const rows = [
    { domain: "production" },
    { domain: "ad" }
  ];
  return <Table data={rows} columns={[{ key: "domain", render: (record) => <DomainTag domain={record.domain} /> }]} />;
}

export function StaticValueMapCallbackPage() {
  const rows = [
    { domain: "production" },
    { domain: "ad" }
  ];
  return <>{rows.map((record) => <DomainTag domain={record.domain} />)}</>;
}

export function StaticValueNestedFixedPropPage() {
  return <DomainWrapper domain="production" />;
}

export function StaticValuePropsObjectPage() {
  return <DomainTagProps domain="ad" />;
}
