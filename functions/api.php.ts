const DEFAULT_API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";

// ✅允许：kuwo.cn（主站） + kwcdn.kuwo.cn（图片） + sycdn.kuwo.cn（音频/资源 CDN）
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$|(^|\.)kwcdn\.kuwo\.cn$|(^|\.)sycdn\.kuwo\.cn$/i;

const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
  "expires",
  "content-disposition",
];

interface Env {
  API_BASE_URL?: string; // 你的主 API（GDStudio 风格：types=...）
}

function createCorsHeaders(init?: Headers): Headers {
  const headers = new Headers();
  if (init) {
    for (const [key, value] of init.entries()) {
      if (SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())) headers.set(key, value);
    }
  }
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", SAFE_RESPONSE_HEADERS.join(", "));
  return headers;
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function isAllowedKuwoHost(hostname: string): boolean {
  return !!hostname && KUWO_HOST_PATTERN.test(hostname);
}

function parseKuwoUrl(rawUrl: string): URL | null {
  try {
    const u = new URL(rawUrl);
    if (!isAllowedKuwoHost(u.hostname)) return null;
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchWithKuwoHeaders(url: string, request: Request): Promise<Response> {
  const hdrs: Record<string, string> = {
    "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
    // Kuwo 常见防盗链/反爬：带上 Referer/Origin 更稳
    "Referer": "https://www.kuwo.cn/",
    "Origin": "https://www.kuwo.cn",
    "Accept": request.headers.get("Accept") ?? "*/*",
    "Accept-Language": request.headers.get("Accept-Language") ?? "zh-CN,zh;q=0.9,en;q=0.8",
  };

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) hdrs["Range"] = rangeHeader;

  return fetch(url, { method: request.method, headers: hdrs });
}

async function proxyKuwoTarget(targetUrl: string, request: Request): Promise<Response> {
  const parsed = parseKuwoUrl(targetUrl);
  if (!parsed) return new Response("Invalid target", { status: 400 });

  // ✅你的站点是 https：前端必须走 https 请求你自己的 /api.php；
  // ✅但后端去拉 Kuwo 我们优先 http（你要求），若 514/失败则 fallback https
  const httpUrl = new URL(parsed.toString()); httpUrl.protocol = "http:";
  const httpsUrl = new URL(parsed.toString()); httpsUrl.protocol = "https:";

  let upstream = await fetchWithKuwoHeaders(httpUrl.toString(), request);
  if (upstream.status === 514 || upstream.status === 403 || upstream.status === 404) {
    upstream = await fetchWithKuwoHeaders(httpsUrl.toString(), request);
  }

  const headers = createCorsHeaders(upstream.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "public, max-age=3600");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxyApi(url: URL, request: Request, env: Env): Promise<Response> {
  const apiUrl = new URL(env.API_BASE_URL || DEFAULT_API_BASE_URL);

  url.searchParams.forEach((value, key) => {
    if (key === "target" || key === "callback") return;
    apiUrl.searchParams.set(key, value);
  });

  if (!apiUrl.searchParams.has("types")) return new Response("Missing types", { status: 400 });

  const upstream = await fetch(apiUrl.toString(), {
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Accept": request.headers.get("Accept") ?? "*/*",
    },
  });

  const headers = createCorsHeaders(upstream.headers);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  if (target) return proxyKuwoTarget(target, request);

  return proxyApi(url, request, env);
}
