const DEFAULT_TUNEHUB_BASE_URL = "https://music-dl.sayqz.com/api/";

const SAFE_RESPONSE_HEADERS = ["content-type", "cache-control", "accept-ranges", "content-length", "content-range", "etag", "last-modified", "expires"];

function getEnv(name: string): string | undefined {
  const g: any = globalThis as any;
  return g?.[name];
}

function getTunehubBaseUrl(): string {
  // 用 API_BASE_URL_2 作为 TuneHub(备用API) 的上游
  return getEnv("API_BASE_URL_2") || DEFAULT_TUNEHUB_BASE_URL;
}

function createCorsHeaders(init?: Headers): Headers {
  const headers = new Headers();
  if (init) {
    for (const [key, value] of init.entries()) {
      if (SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
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

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  const inUrl = new URL(request.url);

  // TuneHub 原本 baseUrl 末尾带 /api/ ，并且前端是 new URL(baseUrl) 再加 query
  // 这里我们只需要把 query 透传到你的 API2
  const upstreamUrl = new URL(getTunehubBaseUrl());
  inUrl.searchParams.forEach((v, k) => upstreamUrl.searchParams.set(k, v));

  const upstream = await fetch(upstreamUrl.toString(), {
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      // TuneHub 的 type=url 通常返回 text/plain；不要强制 Accept=json
      "Accept": request.headers.get("Accept") ?? "*/*",
    },
  });

  const headers = createCorsHeaders(upstream.headers);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}
