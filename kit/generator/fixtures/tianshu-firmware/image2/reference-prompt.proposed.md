# TianShu firmware Image2 reference prompt

Status: `approved-and-frozen`

- Route: `exploratory`
- Recommended direction: `release-ledger`
- Selected direction: `release-ledger`
- User confirmation: `2026-07-17`
- Inherited Ops Canvas contract SHA-256: `fc6ce9c1c45d4b2c15609a37af29a9679cec4ab8a35cc42598a050d8927895fd`
- Frozen exploratory contract SHA-256: `82c4990d66eb7525613e6354213bf64247ab6b29992582e6fe12d19afa19a8bf`
- Confirmed fenced Prompt SHA-256: `5e4aa44f92491dbe6ec3176aabb3952713a1e6adaac3f914ea38157effeff87c`
- Target canvas: `1440×1100`
- Generation performed: `true`

The user approved this exact fenced Prompt block. Any later prompt change requires a new confirmation and hash.

## Prompt

```text
Use case: ui-mockup
Asset type: shippable desktop operations-management web UI reference for deterministic Image-to-html reconstruction

Create one complete 1440×1100 straight-on screenshot of “天枢 · 固件版本管理”. Use the Release Ledger direction: dense, list-first, operational, and optimized for quickly distinguishing firmware lifecycle status, signature status, rollout exposure, and the next permitted action.

Use the frozen Ops Canvas visual contract.

Shell:
- Fixed 240px left navigation rail.
- Fixed 64px product header.
- Fluid main content with 24px gutters.
- Light theme.
- Left rail brand: “天枢”.
- Navigation group: “生产履约”.
- Visible entries: “收货入库”, “烧录发证”, “SN/证书”, “测试管理”, “质检管理”, “库存管理”, “出货管理”, “退货 RMA”, “固件版本”.
- Highlight “固件版本” as the active route.
- Product header breadcrumb: “生产履约 / 固件版本”.
- Header right side: “华南生产中心”, “固件管理员 · 周启明”.

Page header:
- Title: “固件版本管理”.
- Description: “维护固件、签名和灰度发布状态，为烧录任务提供受控版本。”
- Secondary actions: “刷新”, “导出版本列表”.
- One primary action: “新建固件版本”.

Filter region:
- Text input label “固件版本号”, placeholder “输入版本号”.
- Select “机型”: “全部机型”, “TJ-M1”, “TJ-S1”, “TJ-Pro”.
- Select “版本状态”: “全部状态”, “草稿”, “测试中”, “灰度中”, “已全量”, “已回滚”, “已停用”.
- Select “签名状态”: “全部状态”, “未签名”, “签名中”, “签名成功”, “签名失败”.
- Buttons: “查询”, “重置”.
- Keep the filter region compact and aligned on one row.

Main data section:
- Section title: “固件版本”.
- Supporting text: “共 24 个版本 · 数据更新时间 2026-07-17 10:32”.
- Use a dense, readable data table.
- Columns: “固件版本号”, “机型”, “版本状态”, “签名状态”, “灰度比例”, “绑定设备数”, “发布人”, “发布时间”, “操作”.
- Version status and signature status must remain two separate columns.
- Pair every semantic color with visible status text.
- Use a compact progress indicator only for active canary rollout.

Show these six rows legibly:

1. “v2.4.0-TJ-M1-beta” | “TJ-M1” | “测试中” | “签名成功” | “—” | “0” | “林嘉禾” | “—” | “查看 · 编辑 · 发起灰度”
2. “v2.3.2-TJ-M1” | “TJ-M1” | “灰度中” | “签名成功” | “25%” | “1,280” | “周启明” | “2026-07-16 18:20” | “查看 · 调整灰度 · 回滚”
3. “v2.3.1-TJ-M1” | “TJ-M1” | “已全量” | “签名成功” | “—” | “4,896” | “周启明” | “2026-07-11 10:08” | “查看 · 回滚 · 停用”
4. “v1.9.8-TJ-S1” | “TJ-S1” | “已回滚” | “签名成功” | “—” | “742” | “顾言” | “2026-07-04 15:36” | “查看 · 停用”
5. “v3.0.0-TJ-Pro-rc1” | “TJ-Pro” | “草稿” | “未签名” | “—” | “0” | “沈秋” | “—” | “编辑 · 上传固件 · 发起签名”
6. “v2.2.7-TJ-M1” | “TJ-M1” | “已停用” | “签名失败” | “—” | “315” | “周启明” | “2026-06-18 09:24” | “查看”

Pagination:
- “第 1-6 条 · 共 24 条”.
- “第 1 / 4 页”.
- Buttons “上一页”, “下一页”.

Kit reconstruction intent:
The page must be reconstructible with AppShell or PageLayout, SideNav, PageHeader, FilterPanel, Input, Select, DataSection, DataGrid, Badge, Pagination, Button, Drawer, FormSection, Upload, and ConfirmDialog. Keep the base screenshot free of open drawers or dialogs. The implementation will verify opening “新建固件版本” as a real interaction.

Visual system:
- Page background #F4F7FB.
- Surface #FFFFFF.
- Elevated surface #F8FAFC.
- Primary text #142033.
- Secondary text #5D6B80.
- Border #DCE3ED.
- Brand #1769E0.
- Success #16865A.
- Warning #B36500.
- Danger #C63838.
- Inter or Segoe UI.
- Tabular numerals.
- Compact scan-first density.
- 4px spacing grid.
- 6px, 10px, and 14px radii.
- Restrained borders and shadows.
- Clear active navigation and visible focus styling.
- One primary action per region.

Constraints:
Render all quoted interface text legibly. Keep the complete page inside one image. Preserve practical browser UI proportions and consistent column alignment. Display synthetic operational data only. Show no firmware binary content, keys, certificates, KMS values, secrets, or real production identifiers.

Avoid:
Browser chrome, device mockups, perspective, photography, 3D effects, gradients, glassmorphism, neon styling, excessive shadows, card-within-card composition, decorative dashboards, oversized KPI cards, placeholder text, gibberish, cropped regions, scroll continuation, watermarks, modal overlays, or extra navigation items.
```
