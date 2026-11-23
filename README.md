# Dip-Recovery BTC Bot

Entry for the make.fun competition **btc-race-24h-20261123-0511** —
"Race a BTC trading bot live for 24 hours". A long-only dip buyer trading
Coinbase Wrapped BTC (cbBTC) on 1-minute bars with $1,000 of paper money.

## Strategy

- **Buy** with all cash when, on the same bar: the close is down at least
  0.8% over the trailing 120 minutes, the 4-hour return is at least -0.5%
  (flat-or-rising regime, no waterfalls), and the close has bounced at least
  0.05% over the last 15 minutes.
- **Sell** everything when the position is up 1.2% over its cost.
- One open position at a time, never short, no stop-loss.

## Run

The grader runs `node main.ts`; the bot speaks `agent-fun/bars-replay/v1`
(newline-delimited JSON on stdin/stdout) via the vendored
`vendor/makefun-bars.ts` shim (a byte-identical copy of the kit SDK).
Deterministic: no clock, no randomness, no network, no files.

## License

MIT — see `LICENSE`.
