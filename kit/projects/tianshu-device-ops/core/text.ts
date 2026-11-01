// 文本空白判定（第 4 阶段 4.5 规则统一）：对齐 antd Form 规则 { required, whitespace: true }。
// async-validator 的 string 校验：空串且非必填 → 直接通过；非空且全为空白 → whitespace 报错；必填的空串 → required 报错。
// 所以「选填」字段只要不是空串、又全是空白，一样报错（不能因为非必填就放过纯空格）。

/** 是否违反 { required, whitespace: true }：必填时空串或纯空白都违反；选填时仅「非空的纯空白」违反。 */
export function violatesNotBlank(value: string, required: boolean): boolean {
  const blank = value.trim() === "";
  return required ? blank : value !== "" && blank;
}
