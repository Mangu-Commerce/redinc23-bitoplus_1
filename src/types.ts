export interface TickerData {
    ticker: string;
    yieldTtm: string;
    lastPrice: string;
    annualDiv: string;
    frequency: string;
    range52W: string;
    exDate: string;
    recordDate: string;
    payDate: string;
}

export interface TickerBase {
    ticker: string;
    yieldTtm: string;
}
