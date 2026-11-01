# Figma tool routing

Use the Figma MCP workflow in this order:

1. Parse the supplied Figma URL into `fileKey` and `nodeId`.
2. Call `get_metadata` only when node discovery is needed.
3. Call `get_design_context` for the exact target node and relevant variants.
4. Call `get_screenshot` for visual evidence at each target viewport.
5. Use `get_variable_defs` and Code Connect mappings when tokens/components matter.
6. Retrieve only referenced image/SVG assets; preserve the MCP-provided source URL and node mapping.

Map cutout decisions into the Figma evidence record:

- `cut`: screenshot/export node IDs, dimensions, crop, file format, scale, output hash;
- `do-not-cut`: component/data binding, responsive behavior, and implementation owner;
- `pending`: missing permission, unclear motion/data behavior, or license blocker.

The comparison record must include `fileKey`, `nodeId`, viewport, Figma screenshot path, implementation screenshot path, diff path or documented comparison, and status. Use null fields plus `external-blocked` when live Figma evidence is unavailable.
