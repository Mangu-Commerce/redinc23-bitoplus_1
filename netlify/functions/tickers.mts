import type { Config } from '@netlify/functions';
import { TICKER_SEEDS } from '../../src/shared/seeds.js';

export default async () => {
  return Response.json(TICKER_SEEDS);
};

export const config: Config = {
  path: '/api/tickers',
  method: 'GET',
};
