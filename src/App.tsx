/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from "react";
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
    Send
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { TickerData, TickerBase } from "./types";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default function App() {
    const [tickers, setTickers] = useState<TickerBase[]>([]);
    const [enrichedData, setEnrichedData] = useState<Record<string, TickerData>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: keyof TickerData; direction: 'asc' | 'desc' } | null>(null);
    const [isEnriching, setIsEnriching] = useState(false);
    const [progress, setProgress] = useState(0);
    
    // Gemini Insights State
    const [insightQuery, setInsightQuery] = useState("");
    const [insightResponse, setInsightResponse] = useState("");
    const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

    useEffect(() => {
        fetch("/api/tickers")
            .then(res => res.json())
            .then(data => {
                setTickers(data);
                setLoading(false);
            });
    }, []);

    const generateInsight = async () => {
        if (!insightQuery || isGeneratingInsight) return;
        setIsGeneratingInsight(true);
        setInsightResponse("");
        
        try {
            const model = "gemini-3-flash-preview";
            const dataContext = JSON.stringify(Object.values(enrichedData).slice(0, 20));
            const prompt = `You are a financial analyst. Based on the following dividend data for high-yield ETFs: ${dataContext}. Answer the user's question: ${insightQuery}. Keep it concise and professional.`;
            
            const result = await ai.models.generateContent({
                model,
                contents: prompt
            });
            
            setInsightResponse(result.text || "No response generated.");
        } catch (e) {
            console.error(e);
            setInsightResponse("Failed to generate insight. Please check your API key.");
        } finally {
            setIsGeneratingInsight(false);
        }
    };

    const enrichAll = async () => {
        if (isEnriching) return;
        setIsEnriching(true);
        setProgress(0);
        
        const total = tickers.length;
        for (let i = 0; i < tickers.length; i++) {
            const t = tickers[i];
            try {
                const res = await fetch(`/api/enrich/${t.ticker}?yield=${encodeURIComponent(t.yieldTtm)}`);
                const data = await res.json();
                setEnrichedData(prev => ({ ...prev, [t.ticker]: data }));
            } catch (e) {
                console.error(`Failed to enrich ${t.ticker}`, e);
            }
            setProgress(Math.round(((i + 1) / total) * 100));
            // Small delay to be polite to the API
            await new Promise(r => setTimeout(r, 100));
        }
        setIsEnriching(false);
    };

    const filteredTickers = useMemo(() => {
        const base = tickers.map(t => enrichedData[t.ticker] || {
            ticker: t.ticker,
            yieldTtm: t.yieldTtm,
            lastPrice: "...",
            annualDiv: "...",
            frequency: "...",
            range52W: "...",
            exDate: "...",
            recordDate: "...",
            payDate: "..."
        });

        let filtered = base.filter(t => 
            t.ticker.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (sortConfig) {
            filtered.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];
                
                // Handle numeric sorting for yield and price
                if (sortConfig.key === 'yieldTtm' || sortConfig.key === 'lastPrice' || sortConfig.key === 'annualDiv') {
                    const numA = parseFloat(String(valA).replace(/[%$]/g, "")) || 0;
                    const numB = parseFloat(String(valB).replace(/[%$]/g, "")) || 0;
                    return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    }, [tickers, enrichedData, searchQuery, sortConfig]);

    const handleSort = (key: keyof TickerData) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
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

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-orange-500/30">
            {/* Header */}
            <header className="border-b border-zinc-800/50 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-black" />
                        </div>
                        <h1 className="text-lg font-semibold tracking-tight">Dividend<span className="text-orange-500">Explorer</span></h1>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input 
                                type="text" 
                                placeholder="Search tickers..." 
                                className="bg-zinc-900 border border-zinc-800 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 w-64 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={enrichAll}
                            disabled={isEnriching}
                            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-medium px-4 py-1.5 rounded-full flex items-center gap-2 transition-colors"
                        >
                            {isEnriching ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Enriching {progress}%
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-4 h-4" />
                                    Enrich Data
                                </>
                            )}
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
                        <p className="text-4xl font-light">{tickers.length}</p>
                        <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3" />
                            High-yield focus
                        </p>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Avg Yield</p>
                            <DollarSign className="w-5 h-5 text-green-500" />
                        </div>
                        <p className="text-4xl font-light">184.2%</p>
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

                {/* Table Section */}
                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-zinc-900/50 border-b border-zinc-800">
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('ticker')}>
                                        <div className="flex items-center gap-2">
                                            Ticker
                                            {sortConfig?.key === 'ticker' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('yieldTtm')}>
                                        <div className="flex items-center gap-2">
                                            Yield (TTM)
                                            {sortConfig?.key === 'yieldTtm' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('lastPrice')}>
                                        <div className="flex items-center gap-2">
                                            Price
                                            {sortConfig?.key === 'lastPrice' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('annualDiv')}>
                                        <div className="flex items-center gap-2">
                                            Annual Div
                                            {sortConfig?.key === 'annualDiv' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Frequency</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">52W Range</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ex-Date</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pay Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                <AnimatePresence mode="popLayout">
                                    {filteredTickers.map((t) => (
                                        <motion.tr 
                                            key={t.ticker}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            layout
                                            className="hover:bg-zinc-800/20 transition-colors group"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-orange-500">{t.ticker}</span>
                                                    <a 
                                                        href={`https://www.nasdaq.com/market-activity/etf/${t.ticker.toLowerCase()}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-400"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-green-400 font-medium">{t.yieldTtm}</span>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-sm">
                                                {t.lastPrice !== "..." && t.lastPrice !== "N/A" ? `$${t.lastPrice}` : t.lastPrice}
                                            </td>
                                            <td className="px-6 py-4 font-mono text-sm">
                                                {t.annualDiv !== "..." && t.annualDiv !== "N/A" ? `$${t.annualDiv}` : t.annualDiv}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                                                    t.frequency === 'Monthly' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                                    t.frequency === 'Quarterly' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                                                    'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
                                                }`}>
                                                    {t.frequency}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-zinc-400 font-mono">
                                                {t.range52W}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-zinc-300">
                                                {t.exDate}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-zinc-300">
                                                {t.payDate}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Gemini Insights Section */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-orange-500" />
                        <h2 className="text-lg font-semibold">Gemini <span className="text-orange-500">Insights</span></h2>
                    </div>
                    <div className="flex gap-4">
                        <input 
                            type="text" 
                            placeholder="Ask Gemini about these dividend yields (e.g., 'Which ETF has the most stable payout?')" 
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                            value={insightQuery}
                            onChange={(e) => setInsightQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && generateInsight()}
                        />
                        <button 
                            onClick={generateInsight}
                            disabled={isGeneratingInsight || !insightQuery}
                            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
                        >
                            {isGeneratingInsight ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Analyze
                        </button>
                    </div>
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

                {/* Footer Info */}
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
