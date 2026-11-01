// 整数输入归整（第 4 阶段 4.5 规则统一）：对齐 antd InputNumber precision=0 在失焦 / 回车时的归整。
// 依据 @rc-component/input-number 的 triggerValueUpdate 与 @rc-component/mini-decimal 的 toFixed：
//   1. 先按 min / max 夹到边界；
//   2. 再按「四舍五入，远离零」取整（1.5 → 2，2.4 → 2，-1.5 → -2，-2.4 → -2；-0.4 → 0）；
//   3. 取整后若又落出范围，改为直接截掉小数。
// 框架无关；两端输入框在失焦 / 回车时调用，把结果写回输入框，校验仍交给各表单自己的规则。

export type NormalizeIntegerOptions = { min?: number; max?: number };

// antd 的数字解析会先去掉 [A-Za-z0-9_.-] 以外的字符（空格、逗号、+ 号等）。
const stripToNumberChars = (raw: string) => raw.replace(/[^\w.-]+/g, "");
// 与 mini-decimal validateNumber 一致：12.5、1.、.5，可带负号。
const NUMBER_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)$/;

/** 把十进制字符串按「远离零的四舍五入」取整；cutOnly 为 true 时只截掉小数。 */
function toInteger(numberText: string, cutOnly: boolean): string {
  const negative = numberText.startsWith("-");
  const body = negative ? numberText.slice(1) : numberText;
  const [integerPart = "", decimalPart = ""] = body.split(".");
  let integer = BigInt(integerPart || "0");
  if (!cutOnly && decimalPart !== "" && Number(decimalPart[0]) >= 5) integer += 1n;
  return negative && integer !== 0n ? `-${integer}` : integer.toString();
}

/**
 * 整数归整。空串返回空串；不是数字原样返回（交给校验报错）；
 * 有 min / max 时先夹到边界再取整。
 */
export function normalizeInteger(raw: string, opts: NormalizeIntegerOptions = {}): string {
  if (raw.trim() === "") return "";
  let text = stripToNumberChars(raw);
  // 科学计数法（1e3）antd 先转成数字再展开；展开后仍带指数的极端值不处理，原样交给校验。
  if (text.includes("e") && !Number.isNaN(Number(text))) {
    text = String(Number(text));
    if (/e/i.test(text)) return raw;
  }
  if (!NUMBER_PATTERN.test(text)) return raw;
  const { min, max } = opts;
  const inRange = (value: number) => (min === undefined || value >= min) && (max === undefined || value <= max);
  let ranged = text;
  if (max !== undefined && Number(text) > max) ranged = String(max);
  else if (min !== undefined && Number(text) < min) ranged = String(min);
  const rounded = toInteger(ranged, false);
  return inRange(Number(rounded)) ? rounded : toInteger(ranged, true);
}
