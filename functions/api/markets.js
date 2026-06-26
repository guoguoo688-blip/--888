const CACHE_SECONDS = 45;

let cachedAt = 0;
let cachedPayload = null;

const yahooHeaders = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json,text/plain,*/*",
};

const sinaHeaders = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://finance.sina.com.cn/",
};

const MAIN_INDICES = [
  { label: "上证指数", sina: "s_sh000001", provider: "sina-index", order: 1 },
  { label: "恒生指数", sina: "rt_hkHSI", provider: "hk", symbol: "^HSI", order: 2 },
  { label: "纳斯达克100", sina: "gb_ndx", provider: "gb", symbol: "^NDX", order: 3 },
  { label: "标普500", sina: "int_sp500", provider: "int", symbol: "^GSPC", order: 4 },
  { label: "道琼斯", sina: "gb_dji", provider: "gb", symbol: "^DJI", order: 5 },
];

const US_FUTURES = [
  { label: "纳指期货", sina: "hf_NQ", provider: "hf", symbol: "NQ=F", order: 1 },
  { label: "标普期货", sina: "hf_ES", provider: "hf", symbol: "ES=F", order: 2 },
  { label: "道指期货", sina: "hf_YM", provider: "hf", symbol: "YM=F", order: 3 },
];

const US_SECTORS = [
  { label: "AI算力", symbol: "AIQ", icon: "🧠", order: 1 },
  { label: "CPO", symbol: "COHR", icon: "💡", order: 2 },
  { label: "半导体", symbol: "SOXX", icon: "💾", order: 3 },
  { label: "存储", symbol: "WDC", icon: "💾", order: 4 },
  { label: "数据中心", symbol: "SRVR", icon: "🏢", order: 5 },
  { label: "云计算", symbol: "SKYY", icon: "☁️", order: 6 },
  { label: "商业航天", symbol: "UFO", icon: "🚀", order: 7 },
  { label: "卫星", symbol: "ARKX", icon: "🛰️", order: 8 },
  { label: "机器人", symbol: "BOTZ", icon: "🤖", order: 9 },
  { label: "自动驾驶", symbol: "DRIV", icon: "🚗", order: 10 },
  { label: "核电", symbol: "NLR", icon: "⚛️", order: 11 },
  { label: "电网", symbol: "GRID", icon: "⚡", order: 12 },
  { label: "军工", symbol: "ITA", icon: "🛡️", order: 13 },
  { label: "新能源", symbol: "ICLN", icon: "🔋", order: 14 },
  { label: "光伏", symbol: "TAN", icon: "☀️", order: 15 },
  { label: "锂电池", symbol: "LIT", icon: "🔋", order: 16 },
  { label: "石油", symbol: "USO", icon: "🛢️", order: 17 },
  { label: "天然气", symbol: "UNG", icon: "🔥", order: 18 },
  { label: "铜 / 有色", symbol: "COPX", icon: "🔶", order: 19 },
  { label: "黄金", symbol: "GLD", icon: "🟡", order: 20 },
  { label: "银行金融", symbol: "XLF", icon: "🏦", order: 21 },
  { label: "生物医药", symbol: "IBB", icon: "🧬", order: 22 },
  { label: "消费", symbol: "XLY", icon: "🛒", order: 23 },
];

const OTHER_INDICATORS = [
  { label: "布伦特原油", sina: "hf_OIL", provider: "hf", symbol: "BZ=F", order: 1 },
  { label: "恐慌指数", sina: "gb_vxx", provider: "gb", symbol: "^VIX", order: 2 },
  { label: "美元强弱", sina: "DINIW", provider: "diniw", symbol: "DX-Y.NYB", order: 3 },
  { label: "美债长债", sina: "gb_tlt", provider: "gb", symbol: "^TNX", order: 4 },
  { label: "黄金盘司", sina: "hf_GC", provider: "hf", symbol: "GC=F", order: 5 },
  { label: "白银盘司", sina: "hf_SI", provider: "hf", symbol: "SI=F", order: 6 },
  { label: "铜", sina: "hf_HG", provider: "hf", symbol: "HG=F", order: 7 },
  { label: "天然气", sina: "hf_NG", provider: "hf", symbol: "NG=F", order: 8 },
];

const JAPAN_INDEX = [
  { label: "日经225", sina: "int_nikkei", provider: "int", symbol: "^N225", order: 1 },
  { label: "TOPIX", sina: "b_TOPIX", provider: "b", symbol: "1306.T", order: 2 },
];

const JAPAN_SECTORS = [
  { label: "半导体设备", sina: "gb_asml", provider: "gb", symbol: "6857.T", order: 1 },
  { label: "工业自动化", sina: "gb_rok", provider: "gb", symbol: "6954.T", order: 2 },
  { label: "精密制造", sina: "gb_sony", provider: "gb", symbol: "6861.T", order: 3 },
  { label: "汽车产业链", sina: "gb_tm", provider: "gb", symbol: "7203.T", order: 4 },
];

const KOREA_INDEX = [
  { label: "KOSPI", sina: "b_KOSPI", provider: "b", symbol: "^KS11", order: 1 },
  { label: "KOSDAQ", sina: "b_KOSDAQ", provider: "b", symbol: "^KQ11", order: 2 },
];

const KOREA_SECTORS = [
  { label: "存储", sina: "gb_mu", provider: "gb", symbol: "005930.KS", order: 1 },
  { label: "半导体", sina: "gb_nvda", provider: "gb", symbol: "000660.KS", order: 2 },
  { label: "电池", sina: "gb_alb", provider: "gb", symbol: "373220.KS", order: 3 },
  { label: "消费电子", sina: "gb_lpl", provider: "gb", symbol: "066570.KS", order: 4 },
];

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(String(value).trim().replace(/,/g, "").replace("%", ""));
  return Number.isFinite(number) ? number : null;
}

async function readSinaText(response) {
  const buffer = await response.arrayBuffer();
  try {
    return new TextDecoder("gbk").decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function quoteCard({
  label,
  symbol,
  price,
  previous,
  open,
  change,
  changePercent,
  icon,
  source,
}) {
  const currentPrice = toNumber(price);
  const previousClose = toNumber(previous);
  const openPrice = toNumber(open);
  let absoluteChange = toNumber(change);
  let percentChange = toNumber(changePercent);

  if (absoluteChange === null && currentPrice !== null && previousClose) {
    absoluteChange = currentPrice - previousClose;
  }
  if (percentChange === null && absoluteChange !== null && previousClose) {
    percentChange = (absoluteChange / previousClose) * 100;
  }

  let intradayChange = null;
  let intradayPercent = null;
  if (currentPrice !== null && openPrice) {
    intradayChange = currentPrice - openPrice;
    intradayPercent = (intradayChange / openPrice) * 100;
  }

  return {
    label,
    symbol,
    price: currentPrice,
    previousClose,
    open: openPrice,
    change: absoluteChange,
    changePercent: percentChange,
    intradayChange,
    intradayPercent,
    changeBasis: "previousClose",
    intradayBasis: "open",
    icon,
    source,
  };
}

async function yahooChart(item) {
  const encoded = encodeURIComponent(item.symbol);
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastError = "";

  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encoded}?range=1mo&interval=1d`;
      const response = await fetch(url, { headers: yahooHeaders });
      if (!response.ok) throw new Error(`Yahoo ${response.status}`);

      const payload = await response.json();
      const result = payload?.chart?.result?.[0];
      if (!result) throw new Error("Yahoo empty result");

      const meta = result.meta ?? {};
      const quote = result.indicators?.quote?.[0] ?? {};
      const closes = (quote.close ?? []).filter((value) => value !== null);
      const opens = (quote.open ?? []).filter((value) => value !== null);

      const price = meta.regularMarketPrice ?? closes.at(-1);
      const previous =
        meta.regularMarketPreviousClose ?? meta.previousClose ?? closes.at(-2) ?? meta.chartPreviousClose;
      const open = meta.regularMarketOpen ?? opens.at(-1);

      return quoteCard({
        label: item.label ?? meta.shortName ?? item.symbol,
        symbol: item.symbol,
        price,
        previous,
        open,
        icon: item.icon,
        source: "Yahoo Finance",
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`${item.label}暂不可用：${lastError}`);
}

async function sinaIndex(item) {
  const url = `https://hq.sinajs.cn/list=${item.sina}`;
  const response = await fetch(url, { headers: sinaHeaders });
  if (!response.ok) throw new Error(`Sina ${response.status}`);

  const text = await readSinaText(response);
  const match = text.match(/="([^"]*)"/);
  if (!match) throw new Error("Sina index empty result");

  const parts = match[1].split(",");
  const price = toNumber(parts[1]);
  const change = toNumber(parts[2]);
  const changePercent = toNumber(parts[3]);
  const previous = price !== null && change !== null ? price - change : null;

  return quoteCard({
    label: item.label,
    symbol: item.sina,
    price,
    previous,
    change,
    changePercent,
    source: "Sina Finance",
  });
}

async function sinaQuote(item) {
  const code = item.sina ?? `gb_${String(item.symbol ?? "").toLowerCase()}`;
  if (!code || code === "gb_") throw new Error("Sina code missing");

  const url = `https://hq.sinajs.cn/list=${encodeURIComponent(code)}`;
  const response = await fetch(url, { headers: sinaHeaders });
  if (!response.ok) throw new Error(`Sina ${response.status}`);

  const text = await readSinaText(response);
  const match = text.match(/="([^"]*)"/);
  if (!match || !match[1]) throw new Error("Sina empty result");

  const parts = match[1].split(",");
  if (item.provider === "sina-index") return sinaIndex(item);

  if (item.provider === "hk") {
    return quoteCard({
      label: item.label,
      symbol: item.symbol ?? code,
      open: parts[2],
      previous: parts[3],
      price: parts[6],
      change: parts[7],
      changePercent: parts[8],
      icon: item.icon,
      source: "Sina Finance",
    });
  }

  if (item.provider === "int") {
    const price = toNumber(parts[1]);
    const change = toNumber(parts[2]);
    return quoteCard({
      label: item.label,
      symbol: item.symbol ?? code,
      price,
      previous: price !== null && change !== null ? price - change : null,
      change,
      changePercent: parts[3],
      icon: item.icon,
      source: "Sina Finance",
    });
  }

  if (item.provider === "b") {
    const price = toNumber(parts[1]);
    const change = toNumber(parts[2]);
    return quoteCard({
      label: item.label,
      symbol: item.symbol ?? code,
      price,
      previous: price !== null && change !== null ? price - change : null,
      open: parts[8],
      change,
      changePercent: parts[3],
      icon: item.icon,
      source: "Sina Finance",
    });
  }

  if (item.provider === "hf") {
    return quoteCard({
      label: item.label,
      symbol: item.symbol ?? code,
      price: parts[0],
      previous: parts[7],
      open: parts[2],
      icon: item.icon,
      source: "Sina Finance",
    });
  }

  if (item.provider === "diniw") {
    return quoteCard({
      label: item.label,
      symbol: item.symbol ?? code,
      price: parts[1],
      previous: parts[3],
      open: parts[2],
      icon: item.icon,
      source: "Sina Finance",
    });
  }

  return quoteCard({
    label: item.label,
    symbol: item.symbol ?? code,
    price: parts[1],
    previous: parts[26],
    open: parts[5],
    change: parts[4],
    changePercent: parts[2],
    icon: item.icon,
    source: "Sina Finance",
  });
}

async function quoteViaBestSource(item) {
  try {
    if (item.provider || item.sina || /^[A-Z.]+$/.test(String(item.symbol ?? ""))) {
      return await sinaQuote(item);
    }
  } catch {
    // Yahoo remains a fallback for symbols Sina does not cover.
  }
  return yahooChart(item);
}

async function fetchQuoteGroup(items) {
  const settled = await Promise.allSettled(items.map((item) => quoteViaBestSource(item)));
  const cards = [];
  const errors = [];

  settled.forEach((result, index) => {
    const order = items[index].order ?? index;
    if (result.status === "fulfilled") {
      cards.push({ ...result.value, order });
    } else {
      errors.push(`${items[index].label}暂不可用`);
    }
  });

  cards.sort((a, b) => a.order - b.order);
  return { cards: cards.map(({ order, ...card }) => card), errors };
}

async function fetchMainIndices() {
  const settled = await Promise.allSettled(
    MAIN_INDICES.map((item) => quoteViaBestSource(item)),
  );
  const cards = [];
  const errors = [];

  settled.forEach((result, index) => {
    const item = MAIN_INDICES[index];
    if (result.status === "fulfilled") {
      cards.push({ ...result.value, order: item.order });
    } else {
      errors.push(`${item.label}暂不可用`);
    }
  });

  cards.sort((a, b) => a.order - b.order);
  return { cards: cards.map(({ order, ...card }) => card), errors };
}

function sectorIcon(name) {
  const rules = [
    [["AI", "算力", "软件", "电子信息", "传媒", "互联网"], "🧠"],
    [["半导体", "电子器件", "芯片", "元件"], "💾"],
    [["存储", "计算机"], "💾"],
    [["数据", "通信", "云"], "☁️"],
    [["航天", "飞机", "航空", "卫星"], "🚀"],
    [["机器人", "自动化", "机械"], "🤖"],
    [["汽车", "摩托车"], "🚗"],
    [["电力", "电网", "发电", "供水供气"], "⚡"],
    [["新能源", "电池", "锂", "电器"], "🔋"],
    [["光伏", "太阳能"], "☀️"],
    [["石油", "煤炭"], "🛢️"],
    [["天然气", "燃气"], "🔥"],
    [["钢铁", "有色", "铜", "金属"], "🔶"],
    [["黄金", "贵金属"], "🟡"],
    [["金融", "银行", "保险", "证券"], "🏦"],
    [["医药", "生物", "医疗"], "🧬"],
    [["消费", "商业", "零售", "食品", "酿酒", "服装"], "🛒"],
    [["军工", "船舶"], "🛡️"],
    [["房地产", "建筑", "水泥", "玻璃"], "🏢"],
  ];
  const rule = rules.find(([keywords]) => keywords.some((keyword) => name.includes(keyword)));
  return rule?.[1] ?? "📊";
}

function cleanSectorName(name) {
  const replacements = {
    电子器件: "半导体",
    电子信息: "AI算力",
    电力行业: "电网",
    发电设备: "新能源",
    飞机制造: "商业航天",
    船舶制造: "军工",
    供水供气: "公用事业",
    服装鞋类: "消费",
    钢铁行业: "钢铁",
    电器行业: "电器设备",
    传媒娱乐: "传媒",
    玻璃行业: "玻璃",
  };
  return replacements[name] ?? name.replace("行业", "").replace("制造", "");
}

async function fetchChinaSectors(limit = 18) {
  const response = await fetch("https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php", {
    headers: sinaHeaders,
  });
  if (!response.ok) throw new Error(`Sina sector ${response.status}`);

  const text = await readSinaText(response);
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) throw new Error("Sina sector empty result");

  const data = JSON.parse(text.slice(jsonStart));
  const rows = Object.values(data)
    .map((value) => String(value).split(","))
    .filter((parts) => parts.length >= 6)
    .map((parts, index) => {
      const label = cleanSectorName(parts[1] ?? parts[0]);
      const card = quoteCard({
        label,
        symbol: parts[0],
        price: parts[3],
        change: parts[4],
        changePercent: parts[5],
        icon: sectorIcon(label),
        source: "Sina Finance",
      });
      return { ...card, rank: index + 1 };
    });

  return rows.slice(0, limit);
}

function section({ id, title, tone = "hot", cards, errors }) {
  return {
    id,
    title,
    tone,
    cards,
    message: errors.join("；"),
    status: cards.length ? "ok" : "error",
  };
}

async function buildPayload() {
  const groups = [
    ["indexFutures", "股指期货", US_FUTURES, "hot"],
    ["usSectors", "美股板块数据", US_SECTORS, "hot"],
    ["otherIndicators", "其他指标", OTHER_INDICATORS, "hot"],
    ["koreaIndex", "韩国指数", KOREA_INDEX, "blue"],
    ["koreaSectors", "韩国核心板块", KOREA_SECTORS, "blue"],
    ["japanIndex", "日本指数", JAPAN_INDEX, "blue"],
    ["japanSectors", "日本核心板块", JAPAN_SECTORS, "blue"],
  ];

  const mainPromise = fetchMainIndices();
  const sectorPromise = fetchChinaSectors().then(
    (cards) => ({ cards, errors: [] }),
    () => ({ cards: [], errors: ["A股行业板块暂不可用"] }),
  );
  const groupPromises = groups.map(async ([id, title, items, tone]) => {
    const result = await fetchQuoteGroup(items);
    return section({ id, title, tone, ...result });
  });

  const [mainResult, chinaResult, ...otherSections] = await Promise.all([
    mainPromise,
    sectorPromise,
    ...groupPromises,
  ]);

  const sections = [
    section({ id: "mainIndices", title: "主要指数", tone: "hot", ...mainResult }),
    section({ id: "chinaSectors", title: "A股板块数据", tone: "hot", ...chinaResult }),
    ...otherSections,
  ];

  const order = [
    "mainIndices",
    "indexFutures",
    "chinaSectors",
    "usSectors",
    "otherIndicators",
    "koreaIndex",
    "koreaSectors",
    "japanIndex",
    "japanSectors",
  ];
  sections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const allErrors = sections.flatMap((item) => (item.message ? [item.message] : []));
  return {
    updatedAt: new Date().toISOString(),
    status: sections.some((item) => item.cards.length) ? "ok" : "error",
    source: "Cloudflare Pages Function: Yahoo Finance chart + Sina Finance",
    message: allErrors.slice(0, 8).join("；"),
    sections,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "s-maxage=45",
    },
  });
}

export async function onRequestOptions() {
  return jsonResponse({ ok: true });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";
  const expired = Date.now() - cachedAt > CACHE_SECONDS * 1000;

  if (force || expired || !cachedPayload) {
    cachedPayload = await buildPayload();
    cachedAt = Date.now();
  }

  return jsonResponse(cachedPayload);
}
