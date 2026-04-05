/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  Calendar,
  DollarSign,
  ArrowUpRight,
  Search,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  Send,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import type { TickerSeed, BatchEnrichResponse, InsightResponse } from './shared/api';
import {
  buildInitialStore,
  applyResults,
  type TickerStore,
  type TickerState,
} from './ui/state';
import { sortTickers, type SortKey, type SortDirection } from './ui/sort';
import {
  formatCurrency,
  formatYield,
  formatDate,
  formatRange,
  formatFrequency,
  formatAvgYield,
} from './ui/format';

// Map asset type to the correct Nasdaq URL path segment
function nasdaqPath(assetType: string | undefined, ticker: string): string {
  const t = ticker.toLowerCase();
  switch (assetType) {
    case 'stock': return `https://www.nasdaq.com/market-activity/stocks/${t}`;
    case 'fund':  return `https://www.nasdaq.com/market-activity/funds-and-etfs/${t}`;
    case 'etf':
    default:      return `https://www.nasdaq.com/market-activity/etf/${t}`;
  }
}

export default function App() {
  const [seeds, setSeeds] = useState<TickerSeed[]>([]);
  const [store, setStore] = useState<TickerStore>(new Map<string, TickerState>());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);

  // Gemini Insights state
  const [insightQuery, setInsightQuery] = useState('');
  const [insightResponse, setInsightResponse] = useState('');
  const [insightWarnings, setInsightWarnings] = useState<string[]>([]);
  const [insightError, setInsightError] = useState('');
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  // Load seed list on mount
  useEffect(() => {
    fetch('/api/tickers')
      .then(res => res.json() as Promise<TickerSeed[]>)
      .then(data => {
        setSeeds(data);
        setStore(buildInitialStore(data));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const enrichAll = useCallback(async () => {
    if (isEnriching || seeds.length === 0) return;
    setIsEnriching(true);

    // Transition entries to 'loading' without wiping prior data
    setStore(prev => buildInitialStore(seeds, prev));

    try {
      const res = await fetch('/api/v2/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: seeds.map(s => s.ticker) }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { results } = await res.json() as BatchEnrichResponse;

      setStore(prev => applyResults(prev, results));
    } catch (err) {
      console.error('Batch enrich failed:', err);
      // We don't need to overwrite on failure, existing state can just remain loading or we can mark them error.
      // But keeping it robust:
      setStore(prev => buildInitialStore(seeds, prev));
    } finally {
      setIsEnriching(false);
    }
  }, [seeds, isEnriching]);

  const generateInsight = async () => {
    if (!insightQuery.trim() || isGeneratingInsight) return;
    setIsGeneratingInsight(true);
    setInsightError('');
    setInsightWarnings([]);
    // Purposefully NOT clearing setInsightResponse('') here to preserve previous answer until new returns

    const tickers = ([...store.values()] as TickerState[])
      .filter(s => s.status === 'success' && s.data)
      .slice(0, 20)
      .map(s => ({
        symbol: s.ticker,
        name: null,
        price: s.data?.lastPrice ?? null,
        annualDividend: s.data?.annualDiv ?? null,
        dividendYield: s.data?.yieldTtm ?? null,
        exDividendDate: s.data?.exDate ?? null,
        paymentFrequency: s.data?.frequency ?? null,
      }));

    if (tickers.length === 0) {
      setInsightError('No enriched ticker data available yet. Click "Enrich Data" first.');
      setIsGeneratingInsight(false);
      return;
    }

    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: insightQuery.trim(), tickers }),
      });

      const data = await res.json() as InsightResponse | { error?: string };
      if (!res.ok) {
        throw new Error('error' in data && typeof data.error === 'string'
          ? data.error
          : `HTTP ${res.status}`);
      }

      setInsightResponse((data as InsightResponse).answer);
      setInsightWarnings((data as InsightResponse).warnings);
    } catch (error) {
      console.error(error);
      setInsightError(
        error instanceof Error
          ? error.message
          : 'Failed to generate insight. Server may be missing API key.',
      );
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  // Derive sorted, filtered rows from the store
  const rows = useMemo<TickerState[]>(() => {
    let result = ([...store.values()] as TickerState[]).filter(s =>
      s.ticker.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    if (sortConfig) {
      result = sortTickers(result, sortConfig.key, sortConfig.direction);
    }

    return result;
  }, [store, searchQuery, sortConfig]);

  // Compute average yield dynamically from enriched data
  const avgYield = useMemo(() => {
    const yields = ([...store.values()] as TickerState[])
      .filter(s => s.status === 'success')
      .map(s => s.data?.yieldTtm ?? null);
    return formatAvgYield(yields);
  }, [store]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev?.key === key && prev.direction === 'desc') return { key, direction: 'asc' };
      return { key, direction: 'desc' };
    });
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortConfig?.key !== col) return null;
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
          <p className="text-zinc-400 font-mono text-sm tracking-widest uppercase">Initializing Terminal...</p>
        </div>
      </div>
    );
  }

  const enrichedCount = ([...store.values()] as TickerState[]).filter(s => s.status === 'success').length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">
              Dividend<span className="text-orange-500">Explorer</span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search tickers..."
                className="bg-zinc-900 border border-zinc-800 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 w-64 transition-all"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={enrichAll}
              disabled={isEnriching}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-medium px-4 py-1.5 rounded-full flex items-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isEnriching ? 'animate-spin' : ''}`} />
              {isEnriching ? 'Enriching…' : 'Enrich Data'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Tracked Assets</p>
              <TrendingUp className="w-5 h-5 text-orange-500" />
            </div>
            <p className="text-4xl font-light">{seeds.length}</p>
            <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              {enrichedCount > 0 ? `${enrichedCount} enriched` : 'High-yield focus'}
            </p>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Avg Yield</p>
              <DollarSign className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-4xl font-light">{avgYield}</p>
            <p className="text-xs text-zinc-500 mt-2">TTM Average</p>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Market Status</p>
              <Calendar className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-4xl font-light">Active</p>
            <p className="text-xs text-zinc-500 mt-2">Real-time Nasdaq API</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-900/50 border-b border-zinc-800">
                  {(
                    [
                      { key: 'ticker' as SortKey, label: 'Ticker' },
                      { key: 'yieldTtm' as SortKey, label: 'Yield (TTM)' },
                      { key: 'lastPrice' as SortKey, label: 'Price' },
                      { key: 'annualDiv' as SortKey, label: 'Annual Div' },
                    ] as const
                  ).map(col => (
                    <th
                      key={col.key}
                      className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors"
                      onClick={() => handleSort(col.key)}
                    >
                      <div className="flex items-center gap-2">
                        {col.label}
                        <SortIcon col={col.key} />
                      </div>
                    </th>
                  ))}
                  {['Frequency', '52W Range', 'Ex-Date', 'Pay Date'].map(label => (
                    <th key={label} className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                <AnimatePresence mode="popLayout">
                  {rows.map(state => {
                    const d = state.data;
                    const isError = state.status === 'error';

                    return (
                      <motion.tr
                        key={state.ticker}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        layout
                        className="hover:bg-zinc-800/20 transition-colors group"
                      >
                        {/* Ticker */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-orange-500">{state.ticker}</span>
                            {isError && (
                              <AlertCircle className="w-3 h-3 text-red-400" title={state.error ?? d?.error} />
                            )}
                            <a
                              href={nasdaqPath(d?.assetType, state.ticker)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-400"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>

                        {/* Yield TTM */}
                        <td className="px-6 py-4">
                          <span className="text-green-400 font-medium">
                            {state.status === 'loading' && !d
                              ? <span className="text-zinc-600 animate-pulse">…</span>
                              : formatYield(d?.yieldTtm ?? state.yieldHint)}
                          </span>
                        </td>

                        {/* Price */}
                        <td className="px-6 py-4 font-mono text-sm">
                          {state.status === 'loading' && !d
                            ? <span className="text-zinc-600 animate-pulse">…</span>
                            : formatCurrency(d?.lastPrice ?? null)}
                        </td>

                        {/* Annual Div */}
                        <td className="px-6 py-4 font-mono text-sm">
                          {state.status === 'loading' && !d
                            ? <span className="text-zinc-600 animate-pulse">…</span>
                            : formatCurrency(d?.annualDiv ?? null)}
                        </td>

                        {/* Frequency */}
                        <td className="px-6 py-4">
                          {state.status === 'loading' && !d ? (
                            <span className="text-zinc-600 animate-pulse">…</span>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              d?.frequency === 'Monthly'
                                ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                : d?.frequency === 'Quarterly'
                                  ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                                  : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
                            }`}>
                              {formatFrequency(d?.frequency ?? null)}
                            </span>
                          )}
                        </td>

                        {/* 52W Range */}
                        <td className="px-6 py-4 text-xs text-zinc-400 font-mono">
                          {state.status === 'loading' && !d
                            ? <span className="text-zinc-600 animate-pulse">…</span>
                            : formatRange(d?.range52W?.low ?? null, d?.range52W?.high ?? null)}
                        </td>

                        {/* Ex-Date */}
                        <td className="px-6 py-4 text-sm text-zinc-300">
                          {state.status === 'loading' && !d
                            ? <span className="text-zinc-600 animate-pulse">…</span>
                            : formatDate(d?.exDate ?? null)}
                        </td>

                        {/* Pay Date */}
                        <td className="px-6 py-4 text-sm text-zinc-300">
                          {state.status === 'loading' && !d
                            ? <span className="text-zinc-600 animate-pulse">…</span>
                            : formatDate(d?.payDate ?? null)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        {/* Gemini Insights */}
        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-semibold">
              Gemini <span className="text-orange-500">Insights</span>
            </h2>
          </div>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Ask Gemini about these dividend yields (e.g., 'Which ETF has the most stable payout?')"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              value={insightQuery}
              onChange={e => setInsightQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generateInsight()}
            />
            <button
              onClick={generateInsight}
              disabled={isGeneratingInsight || !insightQuery.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
            >
              {isGeneratingInsight
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Analyze
            </button>
          </div>
          {insightError && (
            <div className="mt-4 p-4 bg-red-950/40 border border-red-900 rounded-xl text-sm text-red-300">
              {insightError}
            </div>
          )}
          {insightWarnings.length > 0 && (
            <div className="mt-4 p-4 bg-yellow-950/30 border border-yellow-900 rounded-xl text-sm text-yellow-200">
              {insightWarnings.map(warning => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          )}
          {insightResponse && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-300 leading-relaxed"
            >
              {insightResponse}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-500 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              <span>Data sourced from Nasdaq API</span>
            </div>
            <div className="flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              <span>TTM = Trailing Twelve Months</span>
            </div>
          </div>
          <p>© 2026 DividendExplorer Terminal. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}
