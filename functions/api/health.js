function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "s-maxage=45",
    },
  });
}

export async function onRequestGet() {
  return jsonResponse({
    ok: true,
    updatedAt: new Date().toISOString(),
    runtime: "cloudflare-pages-functions",
  });
}
