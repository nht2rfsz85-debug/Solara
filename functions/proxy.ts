// functions/proxy.ts
// ✅Solara Kuwo Proxy（完整可用版）
// - 代理 GDStudio API（types=...）
// - 代理 Kuwo 图片/音频直链（kwcdn / sycdn / kuwo）
// - 支持 Range（无损音质 flac24bit 等）
// - 后端优先 http，514/403 自动 fallback https

const API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";

// ✅Kuwo 资源域名（必须放行，不然封面/音频会 Invalid target）
const KUWO_HOST_PATTERN =
  /(^|\.)kuwo\.cn$|(^|\.)kwcdn\.kuwo\.cn$|(^|\.)sycdn\.kuwo\.cn$/i;

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

function createCorsHeaders(init?: Headers): Headers {
  const headers = new Headers();
  if (init) {
    for (const [key, value] of init.entries()) {
      if (SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
  }
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
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
  if (!hostname) return false;
  return KUWO_HOST_PATTERN.test(hostname);
}

function normalizeKuwoUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);

    if (!isAllowedKuwoHost(parsed.hostname)) return null;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    return parsed;
  } catch {
    return null;
  }
}

// ============================
// ✅Kuwo 图片/音频代理（target=）
// ============================
async function proxyKuwoResource(targetUrl: string, request: Request): Promise<Response> {
  const parsed = normalizeKuwoUrl(targetUrl);
  if (!parsed) return new Response("Invalid target", { status: 400 });

  // ✅优先 http（你要求），失败 fallback https
  const httpUrl = new URL(parsed.toString());
  httpUrl.protocol = "http:";

  const httpsUrl = new URL(parsed.toString());
  httpsUrl.protocol = "https:";

  const headersInit: Record<string, string> = {
    "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
    "Referer": "https://www.kuwo.cn/",
    "Origin": "https://www.kuwo.cn",
    "Accept": request.headers.get("Accept") ?? "*/*",
    "Accept-Language":
      request.headers.get("Accept-Language") ?? "zh-CN,zh;q=0.9,en;q=0.8",
  };

  // ✅Range：无损音质必须支持
  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) headersInit["Range"] = rangeHeader;

  let upstream = await fetch(httpUrl.toString(), {
    method: request.method,
    headers: headersInit,
  });

  if (upstream.status === 514 || upstream.status === 403) {
    upstream = await fetch(httpsUrl.toString(), {
      method: request.method,
      headers: headersInit,
    });
  }

  const headers = createCorsHeaders(upstream.headers);

  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=3600");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

// ============================
// ✅GDStudio API 代理（types=）
// ============================
async function proxyApiRequest(url: URL, request: Request): Promise<Response> {
  const apiUrl = new URL(API_BASE_URL);

  // 透传所有参数
  url.searchParams.forEach((value, key) => {
    if (key === "target" || key === "callback") return;
    apiUrl.searchParams.set(key, value);
  });

  if (!apiUrl.searchParams.has("types")) {
    return new Response("Missing types", { status: 400 });
  }

  const upstream = await fetch(apiUrl.toString(), {
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Accept": "application/json",
    },
  });

  const headers = createCorsHeaders(upstream.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

// ============================
// ✅Cloudflare Pages Function Entry
// ============================
export async function onRequest({ request }: { request: Request }): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);

  // target=xxx → Kuwo 资源代理（封面/音频）
  const target = url.searchParams.get("target");
  if (target) return proxyKuwoResource(target, request);

  // 否则 → GDStudio API 代理
  return proxyApiRequest(url, request);
}
