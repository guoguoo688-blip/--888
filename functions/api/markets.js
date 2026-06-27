function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const apiBase = env.MARKET_API_URL?.replace(/\/$/, "");
  if (!apiBase) {
    return jsonResponse({ message: "MARKET_API_URL is not configured" }, 500);
  }

  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${apiBase}/api/markets${incomingUrl.search}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
    });
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        message: "Unable to reach the market data service",
        detail: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
}
