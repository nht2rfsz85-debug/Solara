// functions/api/index.ts
// ✅路由入口：/api/...
// 直接复用 functions/proxy.ts 的逻辑（无需 _redirects）
export { onRequest } from "../proxy";
