// const alertRows = [{ handling: "resolved-alert" }];
const documentationExample = `
const alertRows = [{ handling: "resolved-alert" }];
`;

const alertRows = [
  { id: "al-1", handling: "pending-ack" },
  { id: "al-2", handling: "pending-ack" },
  { id: "al-3", handling: "acknowledged" }
];

export function DataFixture() {
  return <main data-example={documentationExample}>{alertRows.length}</main>;
}
