# Workflow proposals

这个目录保存尚未进入中央 manifest 的 workflow fragment，以及已经完成翻译后仍需保留的历史记录。

proposal 不能直接改变 `workflows.manifest.json`。流程如下：

1. 按 proposal schema 编写并验证 fragment。
2. 由中央 manifest owner 对齐 schema、ID、路径和交付合同。
3. 合入后在 fragment 中记录已翻译状态，当前能力以中央 manifest 为准。

目录中的 `active`、日期或说明只代表该记录的历史语境。查询当前状态时读取 [`../../workflows.manifest.json`](../../workflows.manifest.json)。
