const DEFAULT_TUNEHUB_BASE_URL = "https://music-dl.sayqz.com/api/";

interface Env {
  API_BASE_URL_2?: string; // 你的备用 API（TuneHub 风格：type=search/url/pic/lrc）
}

const SAFE_RESPONSE_HEADERS = ["content-type", "cache-control", "accept-ranges", "content-length", "content-range", "etag", "last-modified", "expires"];

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

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  // ✅关键：无论 br 是 320 / flac / flac24bit，都原样透传
  const inUrl = new URL(request.url);

  // ✅确保上游 baseUrl 合法（建议你把 API_BASE_URL_2 配成类似 https://xxx.com/api/ 这种绝对地址）
  const base = env.API_BASE_URL_2 || DEFAULT_TUNEHUB_BASE_URL;
  const upstreamUrl = new URL(base);

  // 透传 query（TuneHub 风格：type/source/keyword/limit/page/id/br...）
  inUrl.searchParams.forEach((v, k) => upstreamUrl.searchParams.set(k, v));

  const upstream = await fetch(upstreamUrl.toString(), {
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Accept": request.headers.get("Accept") ?? "*/*",
      // 如果你的 API2 对 Kuwo 也有防盗链要求，可以打开下一行：
      // "Referer": "https://www.kuwo.cn/",
    },
  });

  const headers = createCorsHeaders(upstream.headers);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}
