# Basketball Tournament Tracker

A mobile-friendly web app for tracking basketball stats across a 3-game tournament. Designed to be tapped quickly courtside on a phone.

## Features

- Track 3 games in one tournament with separate tabs
- Per-player stats: 2-pointers, 3-pointers, free throws (with attempt tracking & FT%), assists, rebounds (total + offensive), steals, blocks, turnovers, fouls
- Independent team and opponent scoreboards (player's scoring auto-adds to team)
- Tournament totals roll up across all 3 games
- All data persists in `localStorage` — close the tab and come back later
- One-tap JSON backup download

## Quick Start

```bash
npm install
npm run dev
```

Open the local URL on your phone (same Wi-Fi network) for courtside use.

## Deploy

Build a static bundle:

```bash
npm run build
```

The `dist/` folder can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static host.

### GitHub Pages quick deploy

1. Push this repo to GitHub
2. In `vite.config.js`, set `base: '/<your-repo-name>/'`
3. Run `npm run build`
4. Push the `dist/` folder to a `gh-pages` branch (or use the [`gh-pages`](https://www.npmjs.com/package/gh-pages) package)

## Tech

React 18 + Vite + Tailwind CSS + lucide-react icons.

## License

MIT — do whatever you want with it.
