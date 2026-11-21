[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/akbarzn1311/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/akbarzn1311/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Fast CSV reader

A dependency-free, single-pass CSV reader (`solve.js`) that returns exactly
the answer csv-reader 1.0.0 returns for broken CSV input — columns, rows and
errors — but faster. It is the entry for the make.fun bounty
[Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

## What it does

`solve.js` exports `run(input)`, where `input` is `{ text, header }` and the
answer is `{ columns, rows, errors }`:

- Text is read once, left to right, with commas and double quotes. A U+FEFF
  at the very start is dropped.
- A record ends at LF or CRLF; a line left with no characters is no record.
  Outside quotes a CR not followed by LF is dropped (`stray_cr`).
- A field that opens with a quote runs to the next quote that is not doubled;
  `""` inside it is one quote; each CRLF or lone CR inside it is read as LF;
  what follows its closing quote, up to the next comma or line break, is
  appended as it stands (`quote_junk`); a quote that never closes is a
  literal character, and the text after it is read again as unquoted
  (`unterminated_quote`). A quote inside an unquoted field is literal.
- Fields stay strings, never trimmed or converted.
- `columns` is the first record when `header` is true, else null; `rows`
  holds the records after it, each padded with empty strings (`short_row`)
  or cut (`long_row`) to the first record's width.
- Each error is `{ code, line, row }`, in the order met.

## Quickstart

Node 22 is required (the grader runs Node 22.23.4). No dependencies to
install.

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`)
and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`).

## Configuration

No environment variables are needed. `main.ts` turns V8's incremental
marking off (`--no-incremental-marking`) before importing `solve.js`, the
same as the house baseline's driver.

## Development and testing

Verify correctness and speed against the kit's practice set (from the kit
directory):

```sh
MAKEFUN_INPUT_DIR=./practice/input MAKEFUN_OUTPUT_DIR=/tmp/my-out node /path/to/repo/main.ts
node ./program/scorer/main.ts  # with MAKEFUN_OUTPUT_DIR, MAKEFUN_REFERENCE_DIR, MAKEFUN_SCORES_DIR set
```

Compare the answers with `practice/reference/expected.json` — every case
must be identical. Time the run against the house baseline
(`baselines/csv-reader/main.ts`) on the same input.

## License

MIT — see [LICENSE](LICENSE).
