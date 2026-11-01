// 编辑器 dev 端口。默认 5393；Windows 偶尔把它划进系统保留端口段（绑定报 EACCES），
// 这时用环境变量 LUDI_EDITOR_PORT 换一个本机可用端口。只影响端口，仍只监听 127.0.0.1。
const raw = process.env.LUDI_EDITOR_PORT;
const value = raw === undefined || raw === '' ? 5393 : Number(raw);
if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`LUDI_EDITOR_PORT 必须是 1024–65535 的整数：${raw}`);
export const EDITOR_PORT = value;
