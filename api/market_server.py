from __future__ import annotations

import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = int(os.environ.get("AKSHARE_DASHBOARD_PORT", "8765"))
CACHE_SECONDS = 45

_cache = {"time": 0.0, "payload": None}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def to_number(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip().replace(",", "").replace("%", "")
    if text in {"", "-", "nan", "None"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def clean(value):
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean(item) for item in value]
    return value


def quote_card(
    label,
    symbol,
    price=None,
    previous=None,
    open_price=None,
    change=None,
    change_percent=None,
    icon=None,
    source="",
):
    price = to_number(price)
    previous = to_number(previous)
    open_price = to_number(open_price)
    change = to_number(change)
    change_percent = to_number(change_percent)
    if change is None and price is not None and previous not in (None, 0):
        change = price - previous
    if change_percent is None and change is not None and previous not in (None, 0):
        change_percent = change / previous * 100
    intraday_change = None
    intraday_percent = None
    if price is not None and open_price not in (None, 0):
        intraday_change = price - open_price
        intraday_percent = intraday_change / open_price * 100
    return {
        "label": label,
        "symbol": symbol,
        "price": price,
        "previousClose": previous,
        "open": open_price,
        "change": change,
        "changePercent": change_percent,
        "intradayChange": intraday_change,
        "intradayPercent": intraday_percent,
        "changeBasis": "previousClose",
        "intradayBasis": "open",
        "icon": icon,
        "source": source,
    }


def yahoo_chart(symbol, label=None, icon=None):
    import requests

    headers = {"User-Agent": "Mozilla/5.0"}
    last_error = None
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{symbol}"
        try:
            response = requests.get(
                url,
                params={"range": "1mo", "interval": "1d"},
                timeout=8,
                headers=headers,
            )
            response.raise_for_status()
            result = response.json()["chart"]["result"][0]
            meta = result.get("meta", {})
            price = meta.get("regularMarketPrice")
            previous = meta.get("regularMarketPreviousClose") or meta.get("previousClose")
            open_price = meta.get("regularMarketOpen")

            quote = (result.get("indicators", {}).get("quote") or [{}])[0]
            closes = [item for item in quote.get("close", []) if item is not None]
            opens = [item for item in quote.get("open", []) if item is not None]
            if price is None and closes:
                price = closes[-1]
            if previous is None and len(closes) >= 2:
                previous = closes[-2]
            if previous is None:
                previous = meta.get("chartPreviousClose")
            if open_price is None and opens:
                open_price = opens[-1]

            return quote_card(
                label or meta.get("shortName") or symbol,
                symbol,
                price=price,
                previous=previous,
                open_price=open_price,
                icon=icon,
                source="Yahoo Finance",
            )
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"{symbol} quote failed: {last_error}")


def sina_quote(item):
    import requests

    code = item.get("sina")
    if not code:
        raise RuntimeError("Sina code missing")

    response = requests.get(
        f"https://hq.sinajs.cn/list={code}",
        timeout=8,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://finance.sina.com.cn/",
        },
    )
    response.raise_for_status()
    text = response.content.decode("gbk", errors="replace")
    marker = '="'
    start = text.find(marker)
    end = text.rfind('"')
    if start < 0 or end <= start + len(marker):
        raise RuntimeError("Sina empty result")

    parts = text[start + len(marker) : end].split(",")
    provider = item.get("provider")
    label = item["label"]
    symbol = item.get("symbol", code)
    icon = item.get("icon")

    if provider == "sina-index":
        price = to_number(parts[1])
        change = to_number(parts[2])
        previous = price - change if price is not None and change is not None else None
        return quote_card(
            label,
            symbol,
            price=price,
            previous=previous,
            change=change,
            change_percent=parts[3],
            icon=icon,
            source="Sina Finance",
        )

    if provider == "hk":
        return quote_card(
            label,
            symbol,
            open_price=parts[2],
            previous=parts[3],
            price=parts[6],
            change=parts[7],
            change_percent=parts[8],
            icon=icon,
            source="Sina Finance",
        )

    if provider == "int":
        price = to_number(parts[1])
        change = to_number(parts[2])
        previous = price - change if price is not None and change is not None else None
        return quote_card(
            label,
            symbol,
            price=price,
            previous=previous,
            change=change,
            change_percent=parts[3],
            icon=icon,
            source="Sina Finance",
        )

    return quote_card(
        label,
        symbol,
        price=parts[1],
        previous=parts[26],
        open_price=parts[5],
        change=parts[4],
        change_percent=parts[2],
        icon=icon,
        source="Sina Finance",
    )


def quote_via_best_source(item):
    if item.get("sina"):
        try:
            return sina_quote(item)
        except Exception:
            pass
    return yahoo_chart(item["symbol"], item["label"], item.get("icon"))


def fetch_quote_group(items, max_workers=8):
    cards = []
    errors = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(quote_via_best_source, item): item
            for item in items
        }
        for future in as_completed(futures):
            item = futures[future]
            try:
                card = future.result()
                card["order"] = item.get("order", len(cards))
                cards.append(card)
            except Exception as exc:
                errors.append(f"{item['label']}暂不可用")
    cards.sort(key=lambda item: item.get("order", 0))
    for card in cards:
        card.pop("order", None)
    return cards, errors


def fetch_sina_index_cards(items):
    try:
        import akshare as ak

        df = ak.stock_zh_index_spot_sina()
        cards = []
        errors = []
        for item in items:
            match = df[df.iloc[:, 0].astype(str).eq(item["sina"])]
            if match.empty:
                errors.append(f"{item['label']}暂不可用")
                continue
            row = match.iloc[0]
            card = quote_card(
                item["label"],
                item["sina"],
                price=row_value(row, 2),
                previous=row_value(row, 5),
                open_price=row_value(row, 6),
                change=row_value(row, 3),
                change_percent=row_value(row, 4),
                source="AKShare Sina",
            )
            card["order"] = item.get("order", len(cards))
            card["high"] = to_number(row_value(row, 7))
            card["low"] = to_number(row_value(row, 8))
            cards.append(card)
        return cards, errors
    except Exception:
        return [], [f"{item['label']}暂不可用" for item in items]


def fetch_main_index_cards():
    return fetch_quote_group(MAIN_INDICES)


def row_value(row, index, default=None):
    try:
        return row.iloc[index]
    except Exception:
        return default


SECTOR_ICON_RULES = [
    (("AI", "算力", "软件", "电子信息", "传媒", "互联网"), "🧠"),
    (("半导体", "电子器件", "芯片", "元件"), "💾"),
    (("存储", "计算机"), "💾"),
    (("数据", "通信", "云"), "☁️"),
    (("航天", "飞机", "航空", "卫星"), "🚀"),
    (("机器人", "自动化", "机械"), "🤖"),
    (("汽车", "摩托车"), "🚗"),
    (("电力", "电网", "发电", "供水供气"), "⚡"),
    (("新能源", "电池", "锂", "电器"), "🔋"),
    (("光伏", "太阳能"), "☀️"),
    (("石油", "煤炭"), "🛢️"),
    (("天然气", "燃气"), "🔥"),
    (("钢铁", "有色", "铜", "金属"), "🔶"),
    (("黄金", "贵金属"), "🟡"),
    (("金融", "银行", "保险", "证券"), "🏦"),
    (("医药", "生物", "医疗"), "🧬"),
    (("消费", "商业", "零售", "食品", "酿酒", "服装"), "🛒"),
    (("军工", "船舶"), "🛡️"),
    (("房地产", "建筑", "水泥", "玻璃"), "🏢"),
]


def sector_icon(name):
    for keywords, icon in SECTOR_ICON_RULES:
        if any(keyword in name for keyword in keywords):
            return icon
    return "📊"


def clean_sector_name(name):
    name = str(name or "").strip()
    replacements = {
        "电子器件": "半导体",
        "电子信息": "AI算力",
        "电力行业": "电网",
        "发电设备": "新能源",
        "飞机制造": "商业航天",
        "船舶制造": "军工",
        "供水供气": "公用事业",
        "服装鞋类": "消费",
        "钢铁行业": "钢铁",
        "电器行业": "电器设备",
        "传媒娱乐": "传媒",
        "玻璃行业": "玻璃",
    }
    return replacements.get(name, name.replace("行业", "").replace("制造", ""))


def fetch_china_sector_cards(limit=18):
    try:
        import akshare as ak

        df = ak.stock_sector_spot()
        rows = []
        for index, (_, row) in enumerate(df.head(limit).iterrows(), start=1):
            label = clean_sector_name(row_value(row, 1, ""))
            rows.append(
                quote_card(
                    label,
                    str(row_value(row, 0, "")),
                    price=row_value(row, 3),
                    change=row_value(row, 4),
                    change_percent=row_value(row, 5),
                    icon=sector_icon(label),
                    source="AKShare Sina",
                )
            )
            rows[-1]["rank"] = index
        return rows, []
    except Exception:
        return [], ["A股行业板块暂不可用"]


MAIN_INDICES = [
    {"label": "上证指数", "sina": "s_sh000001", "provider": "sina-index", "symbol": "000001.SS", "order": 1},
    {"label": "恒生指数", "sina": "rt_hkHSI", "provider": "hk", "symbol": "^HSI", "order": 2},
    {"label": "纳斯达克100", "sina": "gb_ndx", "provider": "gb", "symbol": "^NDX", "order": 3},
    {"label": "标普500", "sina": "int_sp500", "provider": "int", "symbol": "^GSPC", "order": 4},
    {"label": "道琼斯", "sina": "gb_dji", "provider": "gb", "symbol": "^DJI", "order": 5},
]

US_FUTURES = [
    {"label": "纳指期货", "symbol": "NQ=F", "order": 1},
    {"label": "标普期货", "symbol": "ES=F", "order": 2},
    {"label": "道指期货", "symbol": "YM=F", "order": 3},
]

US_SECTORS = [
    {"label": "AI算力", "symbol": "AIQ", "icon": "🧠", "order": 1},
    {"label": "CPO", "symbol": "COHR", "icon": "💡", "order": 2},
    {"label": "半导体", "symbol": "SOXX", "icon": "💾", "order": 3},
    {"label": "存储", "symbol": "WDC", "icon": "💾", "order": 4},
    {"label": "数据中心", "symbol": "SRVR", "icon": "🏢", "order": 5},
    {"label": "云计算", "symbol": "SKYY", "icon": "☁️", "order": 6},
    {"label": "商业航天", "symbol": "UFO", "icon": "🚀", "order": 7},
    {"label": "卫星", "symbol": "ARKX", "icon": "🛰️", "order": 8},
    {"label": "机器人", "symbol": "BOTZ", "icon": "🤖", "order": 9},
    {"label": "自动驾驶", "symbol": "DRIV", "icon": "🚗", "order": 10},
    {"label": "核电", "symbol": "NLR", "icon": "⚛️", "order": 11},
    {"label": "电网", "symbol": "GRID", "icon": "⚡", "order": 12},
    {"label": "军工", "symbol": "ITA", "icon": "🛡️", "order": 13},
    {"label": "新能源", "symbol": "ICLN", "icon": "🔋", "order": 14},
    {"label": "光伏", "symbol": "TAN", "icon": "☀️", "order": 15},
    {"label": "锂电池", "symbol": "LIT", "icon": "🔋", "order": 16},
    {"label": "石油", "symbol": "USO", "icon": "🛢️", "order": 17},
    {"label": "天然气", "symbol": "UNG", "icon": "🔥", "order": 18},
    {"label": "铜 / 有色", "symbol": "COPX", "icon": "🔶", "order": 19},
    {"label": "黄金", "symbol": "GLD", "icon": "🟡", "order": 20},
    {"label": "银行金融", "symbol": "XLF", "icon": "🏦", "order": 21},
    {"label": "生物医药", "symbol": "IBB", "icon": "🧬", "order": 22},
    {"label": "消费", "symbol": "XLY", "icon": "🛒", "order": 23},
]

OTHER_INDICATORS = [
    {"label": "布伦特原油", "symbol": "BZ=F", "order": 1},
    {"label": "恐慌指数", "symbol": "^VIX", "order": 2},
    {"label": "美元强弱", "symbol": "DX-Y.NYB", "order": 3},
    {"label": "美债长债", "symbol": "^TNX", "order": 4},
    {"label": "黄金盘司", "symbol": "GC=F", "order": 5},
    {"label": "白银盘司", "symbol": "SI=F", "order": 6},
    {"label": "铜", "symbol": "HG=F", "order": 7},
    {"label": "天然气", "symbol": "NG=F", "order": 8},
]

JAPAN_INDEX = [
    {"label": "日经225", "symbol": "^N225", "order": 1},
    {"label": "TOPIX ETF", "symbol": "1306.T", "order": 2},
]

JAPAN_SECTORS = [
    {"label": "半导体设备", "sina": "gb_asml", "provider": "gb", "symbol": "6857.T", "order": 1},
    {"label": "工业自动化", "sina": "gb_rok", "provider": "gb", "symbol": "6954.T", "order": 2},
    {"label": "精密制造", "sina": "gb_sony", "provider": "gb", "symbol": "6861.T", "order": 3},
    {"label": "汽车产业链", "sina": "gb_tm", "provider": "gb", "symbol": "7203.T", "order": 4},
]

KOREA_INDEX = [
    {"label": "KOSPI", "symbol": "^KS11", "order": 1},
    {"label": "KOSDAQ", "symbol": "^KQ11", "order": 2},
]

KOREA_SECTORS = [
    {"label": "存储", "symbol": "005930.KS", "order": 1},
    {"label": "半导体", "symbol": "000660.KS", "order": 2},
    {"label": "电池", "symbol": "373220.KS", "order": 3},
    {"label": "消费电子", "symbol": "066570.KS", "order": 4},
]


def build_payload():
    groups = [
        ("indexFutures", "股指期货", US_FUTURES, "hot"),
        ("usSectors", "美股板块数据", US_SECTORS, "hot"),
        ("otherIndicators", "其他指标", OTHER_INDICATORS, "hot"),
        ("koreaIndex", "韩国指数", KOREA_INDEX, "blue"),
        ("koreaSectors", "韩国核心板块", KOREA_SECTORS, "blue"),
        ("japanIndex", "日本指数", JAPAN_INDEX, "blue"),
        ("japanSectors", "日本核心板块", JAPAN_SECTORS, "blue"),
    ]
    sections = []
    all_errors = []
    main_cards, main_errors = fetch_main_index_cards()
    sections.append(
        {
            "id": "mainIndices",
            "title": "主要指数",
            "tone": "hot",
            "cards": main_cards,
            "message": "；".join(main_errors),
            "status": "ok" if main_cards else "error",
        }
    )
    all_errors.extend(main_errors)

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(fetch_quote_group, symbols): (section_id, title, tone)
            for section_id, title, symbols, tone in groups
        }
        for future in as_completed(futures):
            section_id, title, section_tone = futures[future]
            cards, errors = future.result()
            sections.append(
                {
                    "id": section_id,
                    "title": title,
                    "tone": section_tone,
                    "cards": cards,
                    "message": "；".join(errors),
                    "status": "ok" if cards else "error",
                }
            )
            all_errors.extend(errors)

    china_cards, china_errors = fetch_china_sector_cards()
    sections.append(
        {
            "id": "chinaSectors",
            "title": "A股板块数据",
            "tone": "hot",
            "cards": china_cards,
            "message": "；".join(china_errors),
            "status": "ok" if china_cards else "error",
        }
    )
    all_errors.extend(china_errors)

    section_order = [
        "mainIndices",
        "indexFutures",
        "chinaSectors",
        "usSectors",
        "otherIndicators",
        "koreaIndex",
        "koreaSectors",
        "japanIndex",
        "japanSectors",
    ]
    order_map = {section_id: index for index, section_id in enumerate(section_order)}
    sections.sort(key=lambda item: order_map.get(item["id"], 99))

    return clean(
        {
            "updatedAt": now_iso(),
            "status": "ok" if any(section["cards"] for section in sections) else "error",
            "source": "Yahoo Finance chart + AKShare Sina",
            "message": "；".join(all_errors[:8]),
            "sections": sections,
        }
    )


class MarketHandler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self._send_json({"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json({"ok": True, "updatedAt": now_iso()})
            return
        if parsed.path != "/api/markets":
            self._send_json({"error": "Not found"}, 404)
            return

        params = parse_qs(parsed.query)
        force = params.get("refresh", ["0"])[0] == "1"
        expired = time.time() - _cache["time"] > CACHE_SECONDS
        if force or expired or _cache["payload"] is None:
            _cache["payload"] = build_payload()
            _cache["time"] = time.time()
        self._send_json(_cache["payload"])

    def log_message(self, fmt, *args):
        print(f"[market-api] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), MarketHandler)
    print(f"Market API running at http://{HOST}:{PORT}/api/markets")
    server.serve_forever()
