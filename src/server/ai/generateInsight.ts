import { GoogleGenAI } from '@google/genai';
import type { InsightRequest, InsightResponse } from '../../shared/api.js';

const MODEL = 'gemini-2.0-flash';

function buildPrompt(input: InsightRequest): string {
  return [
    'You are a financial data summarizer for a dividend tracking app.',
    'Use only the provided ticker data.',
    'Do not invent values, missing fundamentals, analyst opinions, or external facts.',
    'If data is missing, explicitly say it is missing.',
    'Do not give personalized financial advice.',
    'Keep the response concise, factual, and professional.',
    '',
    `User question: ${input.question}`,
    '',
    'Ticker data (JSON):',
    JSON.stringify(input.tickers, null, 2),
  ].join('\n');
}

export async function generateInsight(input: InsightRequest): Promise<InsightResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY not configured');
    err.name = 'UnconfiguredError';
    throw err;
  }

  const client = new GoogleGenAI({ apiKey });
  const result = await client.models.generateContent({
    model: MODEL,
    contents: buildPrompt(input),
  });

  const answer = result.text?.trim() || 'No response generated.';
  const warnings: string[] = [];

  if (input.tickers.some(t => t.dividendYield == null)) {
    warnings.push('Some tickers are missing yield data.');
  }

  if (input.tickers.some(t => t.price == null)) {
    warnings.push('Some tickers are missing price data.');
  }

  return {
    answer,
    warnings,
    model: MODEL,
  };
}
