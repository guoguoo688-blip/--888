import { RefreshCw, Wifi, AlertCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const refreshSeconds = 60;

function formatNumber(value, precision = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(Number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const sign = Number(value) > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(2)}%`;
}

function formatChange(value, precision = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const sign = Number(value) > 0 ? '+' : '';
  return `${sign}${formatNumber(value, precision)}`;
}

function direction(value) {
  const number = Number(value);
  if (Number.isNaN(number) || number === 0) return 'flat';
  return number > 0 ? 'up' : 'down';
}

function formatDataDate(value) {
  const text = String(value ?? '');
  if (!/^\d{8}$/.test(text)) return '--';
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function App() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(refreshSeconds);

  const fetchMarkets = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/markets${force ? '?refresh=1' : ''}`);
      if (!response.ok) throw new Error(`API ${response.status}`);
      setPayload(await response.json());
      setSecondsLeft(refreshSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法连接本地行情接口');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          fetchMarkets(true);
          return refreshSeconds;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const sections = useMemo(() => payload?.sections ?? [], [payload]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="top-kicker">
            <Wifi size={16} />
            全球市场监控
          </p>
          <h1>美股 · 日韩 · A股板块</h1>
        </div>
        <div className="actions">
          <span>{loading ? '刷新中' : `${secondsLeft}s 后刷新`}</span>
          <button type="button" onClick={() => fetchMarkets(true)} disabled={loading} aria-label="刷新行情">
            <RefreshCw size={19} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="global-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="section-stack">
        {sections.map((section) => (
          <MarketSection key={section.id} section={section} />
        ))}
      </div>

      <footer className="footer">
        <span>数据源：{payload?.source ?? '等待连接'}</span>
        <span>更新时间：{payload?.updatedAt ? new Date(payload.updatedAt).toLocaleString('zh-CN') : '--'}</span>
      </footer>
    </main>
  );
}

function MarketSection({ section }) {
  const isLarge = ['mainIndices', 'indexFutures'].includes(section.id);
  const isMetric = section.id === 'otherIndicators';
  const isChinaSector = section.id === 'chinaSectors';
  const showsPrice =
    isLarge ||
    isMetric ||
    isChinaSector ||
    ['koreaIndex', 'japanIndex'].includes(section.id);
  const cards = section.cards ?? [];
  const sectorGroups = isChinaSector
    ? Array.from(
        cards.reduce((groups, card) => {
          const groupName = card.group || '其他';
          if (!groups.has(groupName)) groups.set(groupName, []);
          groups.get(groupName).push(card);
          return groups;
        }, new Map()),
      )
    : [];

  return (
    <section className={`market-section ${section.tone === 'blue' ? 'blue' : 'hot'}`}>
      <div className="section-title">
        <span />
        <h2>{section.title}</h2>
      </div>

      {section.message && !cards.length ? (
        <div className="section-message">
          <AlertCircle size={16} />
          <span>{section.message}</span>
        </div>
      ) : null}

      {isChinaSector && cards.length ? (
        <div className="sector-groups">
          <div className="section-meta">
            <span>交易日 {formatDataDate(cards[0]?.dataDate)}</span>
          </div>
          {sectorGroups.map(([groupName, groupCards]) => (
            <div className="sector-group" key={groupName}>
              <h3 className="sector-group-title">{groupName}</h3>
              <div className="card-grid sector-index-grid">
                {groupCards.map((card) => (
                  <QuoteCard
                    key={`${section.id}-${card.symbol}-${card.label}`}
                    card={card}
                    sectorIndex
                    showsPrice
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : cards.length ? (
        <div className={`card-grid ${isLarge ? 'large' : ''} ${isMetric ? 'metric' : ''}`}>
          {cards.map((card) => (
            <QuoteCard
              key={`${section.id}-${card.symbol}-${card.label}`}
              card={card}
              large={isLarge}
              metric={isMetric}
              showsPrice={showsPrice}
            />
          ))}
        </div>
      ) : (
        <div className="empty-card">暂无可展示数据</div>
      )}
    </section>
  );
}

function QuoteCard({ card, large, metric, sectorIndex = false, showsPrice }) {
  const move = direction(card.changePercent);
  const precision = Number.isInteger(card.precision) ? card.precision : 2;

  return (
    <article
      className={`quote-card ${large ? 'large' : ''} ${metric ? 'metric' : ''} ${
        sectorIndex ? 'sector-index' : ''
      }`}
    >
      <div className="quote-main">
        {card.icon ? <span className="quote-icon">{card.icon}</span> : null}
        <div>
          <h3>{card.label}</h3>
          {sectorIndex ? <small>{card.symbol}</small> : null}
          {showsPrice ? <strong>{formatNumber(card.price, precision)}</strong> : null}
        </div>
      </div>

      <div className={`quote-change ${move}`}>
        <span>{move === 'up' ? '▲' : move === 'down' ? '▼' : '■'}</span>
        <b>{formatPercent(card.changePercent)}</b>
        {large || sectorIndex ? <em>{formatChange(card.change, precision)}</em> : null}
      </div>
    </article>
  );
}

export default App;
