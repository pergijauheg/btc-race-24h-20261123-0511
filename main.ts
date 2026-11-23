// Dip-Recovery BTC Bot — a long-only dip buyer for the make.fun BTC race.
//
// Strategy, in plain terms: BTC spends most of a day chopping sideways with sharp
// intraday dips that bounce back. This bot waits for a dip, checks the wider trend
// is not collapsing, waits for the first sign of a bounce, buys with all its cash,
// and sells everything once the position is up 1.2% over its cost. One position at
// a time, never short, no stop-loss: a dip that keeps falling simply stays held
// until it recovers past the take-profit or the window flattens it at the end.
//
// Entry (all three must hold on the same bar):
//   - Dip: the close has fallen at least 0.8% over the trailing 120 minutes.
//   - Regime: the close is no more than 0.5% below where it was 240 minutes ago,
//     so we only buy dips inside a flat-or-rising 4-hour trend, never a waterfall.
//   - Bounce: the close is at least 0.05% above where it was 15 minutes ago,
//     so the dip has started turning instead of still falling.
// Exit:
//   - Take profit: the position's value at the latest close is at least 1.2%
//     above what the position cost (fees included).
//
// All comparisons are exact bigint cross-multiplications on raw closes, so two
// runs on the same bars produce the same orders. No clock, no randomness, no
// network, no files: the only state is the list of closes seen so far.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Lookbacks, in 1-minute bars.
const DIP_BARS = 120;
const REGIME_BARS = 240;
const BOUNCE_BARS = 15;

// Thresholds, in basis points (10_000 bps = 100%).
const DIP_BPS = 80; // close down >= 0.8% over DIP_BARS
const REGIME_FLOOR_BPS = -50; // 4-hour return >= -0.5%
const BOUNCE_BPS = 5; // 15-minute bounce >= +0.05%
const TAKE_PROFIT_BPS = 120; // sell at +1.2% over cost

const MAX_SLIPPAGE_BPS = 200;

/** Closes seen so far, one entry per batch (null before the first bar). */
const closes: (bigint | null)[] = [];

/** True when `now` is at least `bps` below `then` (both raw closes). */
function fellAtLeast(now: bigint, then: bigint, bps: number): boolean {
  return now * 10_000n <= then * BigInt(10_000 - bps);
}

/** True when `now` is at least `bps` above `then`. */
function roseAtLeast(now: bigint, then: bigint, bps: number): boolean {
  return now * 10_000n >= then * BigInt(10_000 + bps);
}

/** True when `now` is no more than `bps` below `then` (bps positive). */
function notBelow(now: bigint, then: bigint, bps: number): boolean {
  return now * 10_000n >= then * BigInt(10_000 - bps);
}

/** The close `bars` batches back, or null when there is not that much history. */
function closeBack(bars: number): bigint | null {
  const idx = closes.length - 1 - bars;
  if (idx < 0) return null;
  return closes[idx] ?? null;
}

await runBars({
  onBatch(state: BarsState, _batch): OrderInput[] {
    closes.push(state.close(SYMBOL));
    if (state.warmingUp) return [];

    const now = state.close(SYMBOL);
    if (now === null) return [];

    const held = state.positions.get(SYMBOL);

    // Exit first: take profit on the whole position.
    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty, now);
      if (value * 10_000n >= held.cost * BigInt(10_000 + TAKE_PROFIT_BPS)) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Entry: need the full 4-hour history before any signal can fire.
    const dipThen = closeBack(DIP_BARS);
    const regimeThen = closeBack(REGIME_BARS);
    const bounceThen = closeBack(BOUNCE_BARS);
    if (dipThen === null || regimeThen === null || bounceThen === null) return [];
    if (!fellAtLeast(now, dipThen, DIP_BPS)) return [];
    if (!notBelow(now, regimeThen, -REGIME_FLOOR_BPS)) return [];
    if (!roseAtLeast(now, bounceThen, BOUNCE_BPS)) return [];

    // Buy with all cash, capped by the weight room (100% of equity here).
    const room = state.weightRoom(SYMBOL);
    const spend = state.cash < room ? state.cash : room;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
