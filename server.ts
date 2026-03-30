import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TICKERS_WITH_YIELD = [
    ["MST", "774.17%"],
    ["ICOI", "393.82%"],
    ["TSYY", "313.12%"],
    ["MSTY", "297.61%"],
    ["COYY", "294.88%"],
    ["MARO", "282.23%"],
    ["SMCY", "268.20%"],
    ["IMST", "256.16%"],
    ["CONY", "227.32%"],
    ["COIW", "219.35%"],
    ["AIYY", "215.64%"],
    ["XBTY", "193.34%"],
    ["MSTW", "186.80%"],
    ["IMRA", "182.74%"],
    ["HOOW", "173.05%"],
    ["HOOY", "167.90%"],
    ["HOYY", "150.46%"],
    ["ULTY", "134.01%"],
    ["YETH", "131.82%"],
    ["NVYY", "130.36%"],
    ["FIAT", "130.13%"],
    ["MTYY", "125.47%"],
    ["CVNY", "124.90%"],
    ["PLTY", "121.93%"],
    ["SMYY", "117.54%"],
    ["PLTW", "117.24%"],
    ["XYZY", "115.60%"],
    ["SNOY", "114.22%"],
    ["LFGY", "108.22%"],
    ["YBIT", "106.07%"],
    ["MAAY", "104.49%"],
    ["TSLW", "103.09%"],
    ["IOYY", "101.74%"],
    ["TSLY", "100.99%"],
    ["AMDY", "97.85%"],
    ["CRSH", "97.06%"],
    ["FEAT", "96.45%"],
    ["BABO", "89.75%"],
    ["MRNY", "89.62%"],
    ["WNTR", "89.57%"],
    ["YMAX", "88.99%"],
    ["YBTC", "88.50%"],
    ["BITO", "86.95%"],
    ["DRAY", "83.84%"],
    ["RBLY", "83.37%"],
    ["BITU", "82.91%"],
    ["HMYY", "80.45%"],
    ["IGME", "80.06%"],
    ["PYPY", "79.05%"],
    ["HIYY", "78.83%"],
    ["RDYY", "78.19%"],
    ["RGYY", "77.44%"],
    ["PLYY", "76.87%"],
    ["NVDY", "75.35%"],
    ["AMYY", "73.19%"],
    ["NVDW", "71.61%"],
];

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const REQUEST_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/",
};

async function fetchNasdaqData(ticker: string, path: string) {
    const assetclasses = ["etf", "stocks", "stock", "funds", "mutualfunds"];
    for (const ac of assetclasses) {
        const url = `https://api.nasdaq.com/api/${path.replace("{ticker}", ticker)}?assetclass=${ac}`;
        try {
            const resp = await fetch(url, { headers: REQUEST_HEADERS });
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.data) return data;
            }
        } catch (e) {
            console.error(`Error fetching ${url}:`, e);
        }
        await new Promise(r => setTimeout(r, 200));
    }
    return null;
}

function safeFloat(val: any): number | null {
    if (val === null || val === undefined) return null;
    const s = String(val).replace(/[$,]/g, "").trim();
    const f = parseFloat(s);
    return isNaN(f) ? null : f;
}

function toIsoDate(val: any): string | null {
    if (!val) return null;
    const s = String(val).trim();
    if (s.toLowerCase() === "n/a" || s === "--") return null;
    
    // Try MM/DD/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        const [, mm, dd, yyyy] = m;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

async function getEnrichedTicker(ticker: string, yieldTtm: string) {
    const divData = await fetchNasdaqData(ticker, "quote/{ticker}/dividends");
    const summaryData = await fetchNasdaqData(ticker, "quote/{ticker}/summary");

    let lastPrice: number | null = null;
    let low52: number | null = null;
    let high52: number | null = null;

    if (summaryData && summaryData.data) {
        const s = summaryData.data;
        lastPrice = safeFloat(s.lastSalePrice || s.lastSale || s.lastTrade);
        low52 = safeFloat(s.fiftyTwoWeekLow || s.yearLow);
        high52 = safeFloat(s.fiftyTwoWeekHigh || s.yearHigh);
    }

    const events: any[] = [];
    if (divData && divData.data && divData.data.dividends && divData.data.dividends.rows) {
        for (const r of divData.data.dividends.rows) {
            events.push({
                exDate: toIsoDate(r.exOrEffDate || r.exDate),
                recordDate: toIsoDate(r.recordDate),
                payDate: toIsoDate(r.paymentDate || r.payDate),
                amount: safeFloat(r.amount)
            });
        }
    }

    // Sort by date descending
    events.sort((a, b) => (b.exDate || "").localeCompare(a.exDate || ""));

    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    let annualDiv = 0;
    let hasDiv = false;
    for (const ev of events) {
        const d = new Date(ev.payDate || ev.exDate);
        if (d <= now && d >= oneYearAgo && ev.amount !== null) {
            annualDiv += ev.amount;
            hasDiv = true;
        }
    }

    const mostRecent = events[0] || {};

    return {
        ticker,
        yieldTtm,
        lastPrice: lastPrice !== null ? lastPrice.toFixed(2) : "N/A",
        annualDiv: hasDiv ? annualDiv.toFixed(2) : "N/A",
        frequency: inferFrequency(events),
        range52W: (low52 !== null && high52 !== null) ? `${low52.toFixed(2)} - ${high52.toFixed(2)}` : "N/A",
        exDate: mostRecent.exDate || "N/A",
        recordDate: mostRecent.recordDate || "N/A",
        payDate: mostRecent.payDate || "N/A"
    };
}

function inferFrequency(events: any[]): string {
    const dates: Date[] = [];
    for (const ev of events.slice(0, 10)) {
        const d = new Date(ev.payDate || ev.exDate);
        if (!isNaN(d.getTime())) dates.push(d);
    }
    dates.sort((a, b) => a.getTime() - b.getTime());
    if (dates.length < 3) return "N/A";

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
        if (diff > 0 && diff < 200) gaps.push(diff);
    }

    if (gaps.length < 2) return "N/A";
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    if (avgGap >= 25 && avgGap <= 35) return "Monthly";
    if (avgGap >= 80 && avgGap <= 100) return "Quarterly";
    if (avgGap >= 170 && avgGap <= 200) return "Semi-Annual";
    if (avgGap >= 5 && avgGap <= 10) return "Weekly";

    return "Irregular";
}

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.get("/api/tickers", (req, res) => {
        res.json(TICKERS_WITH_YIELD.map(([ticker, yieldTtm]) => ({ ticker, yieldTtm })));
    });

    app.get("/api/enrich/:ticker", async (req, res) => {
        const { ticker } = req.params;
        const yieldTtm = req.query.yield as string || "N/A";
        try {
            const data = await getEnrichedTicker(ticker, yieldTtm);
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: "Failed to fetch data" });
        }
    });

    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
            res.sendFile(path.join(distPath, "index.html"));
        });
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
