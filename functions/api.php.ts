const DEFAULT_API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";

// ✅允许 Kuwo 主站与图片 CDN（你报错的 img1.kwcdn.kuwo.cn 就在这里）
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$|(^|\.)kwcdn\.kuwo\.cn$/i;

const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
  "expires",
];

interface Env {
  API_BASE_URL?: string; // 你的主 API（GDStudio 风格：types=search/url/pic/lyric）
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

function normalizeKuwoUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);

    // ✅只允许 Kuwo 相关域名，避免 SSRF
    if (!isAllowedKuwoHost(parsed.hostname)) return null;

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    // ✅关键：强制上游用 http（你明确要求走 http）
    parsed.protocol = "http:";
    return parsed;
  } catch {
    return null;
  }
}

async function proxyKuwoTarget(targetUrl: string, request: Request): Promise<Response> {
  const normalized = normalizeKuwoUrl(targetUrl);
  if (!normalized) return new Response("Invalid target", { status: 400 });

  const init: RequestInit = {
    method: request.method,
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Referer": "https://www.kuwo.cn/",
    },
  };

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) (init.headers as Record<string, string>)["Range"] = rangeHeader;

  const upstream = await fetch(normalized.toString(), init);
  const headers = createCorsHeaders(upstream.headers);

  // 图片/音频一般可以缓存一会儿
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "public, max-age=3600");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxyApi(url: URL, request: Request, env: Env): Promise<Response> {
  const apiUrl = new URL(env.API_BASE_URL || DEFAULT_API_BASE_URL);

  // ✅严格透传 query（GDStudio 风格）
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
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  const url = new URL(request.url);
  const target = url.searchParams.get("target");

  // ✅target=... 走 Kuwo 代理（强制 http）
  if (target) return proxyKuwoTarget(target, request);

  return proxyApi(url, request, env);
}
