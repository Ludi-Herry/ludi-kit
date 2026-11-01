const alertRows = [
  { id: "al-1", handling: "pending-ack" },
  { id: "al-2", handling: "resolved-alert" },
  { id: "al-3", handling: "acknowledged" }
];

export function DataFixture() {
  return <main>{alertRows.length}</main>;
}
