const DEFAULT_API2_BASE_URL = "https://music-dl.sayqz.com/api/";
const HOST_RE = /(^|\.)kuwo\.cn$|(^|\.)kwcdn\.kuwo\.cn$|(^|\.)sycdn\.kuwo\.cn$/i;

const SAFE_RESPONSE_HEADERS = [
  "content-type","cache-control","accept-ranges","content-length","content-range",
  "etag","last-modified","expires","content-disposition"
];

interface Env { API_BASE_URL_2?: string; }

function cors(init?: Headers): Headers {
  const h = new Headers();
  if (init) for (const [k,v] of init.entries()) if (SAFE_RESPONSE_HEADERS.includes(k.toLowerCase())) h.set(k,v);
  if (!h.has("Cache-Control")) h.set("Cache-Control","no-store");
  h.set("Access-Control-Allow-Origin","*");
  h.set("Access-Control-Expose-Headers", SAFE_RESPONSE_HEADERS.join(", "));
  return h;
}

function options(): Response {
  return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers":"*",
    "Access-Control-Max-Age":"86400",
  }});
}

function parseTarget(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!(u.protocol==="http:" || u.protocol==="https:")) return null;
    if (!HOST_RE.test(u.hostname||"")) return null;
    return u;
  } catch { return null; }
}

async function fetchKuwo(url: string, request: Request): Promise<Response> {
  const hdrs: Record<string,string> = {
    "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
    "Referer": "https://www.kuwo.cn/",
    "Origin": "https://www.kuwo.cn",
    "Accept": request.headers.get("Accept") ?? "*/*",
    "Accept-Language": request.headers.get("Accept-Language") ?? "zh-CN,zh;q=0.9,en;q=0.8",
  };
  const range = request.headers.get("Range");
  if (range) hdrs["Range"] = range;
  return fetch(url,{method:request.method,headers:hdrs});
}

async function proxyTarget(target: string, request: Request): Promise<Response> {
  const u = parseTarget(target);
  if (!u) return new Response("Invalid target",{status:400});

  const httpUrl = new URL(u.toString()); httpUrl.protocol="http:";
  const httpsUrl = new URL(u.toString()); httpsUrl.protocol="https:";

  let up = await fetchKuwo(httpUrl.toString(), request);
  if (up.status===514 || up.status===403) up = await fetchKuwo(httpsUrl.toString(), request);

  const h = cors(up.headers);
  if (!h.has("Cache-Control")) h.set("Cache-Control","public, max-age=3600");
  return new Response(up.body,{status:up.status,statusText:up.statusText,headers:h});
}

async function proxyApi(url: URL, request: Request, env: Env): Promise<Response> {
  const upUrl = new URL(env.API_BASE_URL_2 || DEFAULT_API2_BASE_URL);
  url.searchParams.forEach((v,k)=>{ if(k!=="target") upUrl.searchParams.set(k,v); });
  const up = await fetch(upUrl.toString(),{headers:{
    "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
    "Accept": request.headers.get("Accept") ?? "*/*",
  }});
  const h = cors(up.headers);
  return new Response(up.body,{status:up.status,statusText:up.statusText,headers:h});
}

export async function onRequest({request, env}:{request:Request; env:Env;}): Promise<Response> {
  if (request.method==="OPTIONS") return options();
  if (request.method!=="GET" && request.method!=="HEAD") return new Response("Method not allowed",{status:405});
  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  if (target) return proxyTarget(target, request);
  return proxyApi(url, request, env);
}
