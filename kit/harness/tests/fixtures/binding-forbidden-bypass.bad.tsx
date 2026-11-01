import {
  Button,
  Card as Panel,
  DataGrid as Grid,
  DataSection as Section,
  PageLayout
} from "@ai-readable/kit";

declare const require: (source: string) => unknown;
const external = require("antd");

export function BindingForbiddenBypassPage() {
  const Button = ({ children }: { children: unknown }) => <span>{children}</span>;
  const className = "primary-button";
  const color = "#1677ff";
  void external;
  return (
    <PageLayout>
      <Grid dataSource={[]} columns={[]} />
      <Section title="section"><span>empty</span></Section>
      <Panel><Panel>nested</Panel></Panel>
      <Button className={className} style={{ color }} danger>删除</Button>
    </PageLayout>
  );
}
