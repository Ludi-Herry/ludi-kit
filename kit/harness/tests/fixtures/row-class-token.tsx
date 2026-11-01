import { DataGrid, DataSection, PageLayout, Table } from "@ai-readable/kit";

function Sink(_props: Record<string, unknown>) {
  return <div>sink</div>;
}

export function RowClassTokenPage() {
  return (
    <PageLayout>
      <DataSection title="rows">
        <DataGrid
          dataSource={[]}
          columns={[]}
          rowClassName={(record) => record.risk === "high" ? "generated-row--high" : "generated-row--normal"}
        />
        <Table dataSource={[]} columns={[]} rowClassName={() => "generated-table-row"} />
      </DataSection>
    </PageLayout>
  );
}

export function InertRowClassTokenPage() {
  return (
    <PageLayout>
      <Sink rowClassName={() => "generated-row--high"} />
    </PageLayout>
  );
}

export function ShadowedRowClassTokenPage({ DataGrid }: { DataGrid: (props: Record<string, unknown>) => unknown }) {
  return (
    <PageLayout>
      <DataGrid rowClassName={() => "generated-row--high"} />
    </PageLayout>
  );
}
