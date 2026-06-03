// Builds export payloads (CSV + readable summary) from tournament data.
// Kept separate from UI so it can be reused by local download and Drive upload.

export const playerPointsFor = (g) =>
  (g.points2 || 0) * 2 + (g.points3 || 0) * 3 + (g.freeThrowsMade || 0);

const ftPctFor = (g) =>
  g.freeThrowsAttempted > 0
    ? Math.round((g.freeThrowsMade / g.freeThrowsAttempted) * 100)
    : 0;

const COLUMNS = [
  ['Game', (g, i) => i + 1],
  ['Opponent', (g) => g.opponent || ''],
  ['Our Score', (g) => g.teamScore || 0],
  ['Opp Score', (g) => g.opponentScore || 0],
  ['Result', (g) =>
    (g.teamScore || 0) === (g.opponentScore || 0)
      ? 'T'
      : (g.teamScore || 0) > (g.opponentScore || 0)
      ? 'W'
      : 'L'],
  ['Points', (g) => playerPointsFor(g)],
  ['2PM', (g) => g.points2 || 0],
  ['3PM', (g) => g.points3 || 0],
  ['FTM', (g) => g.freeThrowsMade || 0],
  ['FTA', (g) => g.freeThrowsAttempted || 0],
  ['FT%', (g) => ftPctFor(g)],
  ['Assists', (g) => g.assists || 0],
  ['Rebounds', (g) => g.rebounds || 0],
  ['Off Reb', (g) => g.offRebounds || 0],
  ['Steals', (g) => g.steals || 0],
  ['Blocks', (g) => g.blocks || 0],
  ['Turnovers', (g) => g.turnovers || 0],
  ['Fouls', (g) => g.fouls || 0],
];

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Sum a numeric column across games (skips Game/Opponent/Result/FT%).
const sumColumn = (games, accessor) =>
  games.reduce((sum, g, i) => sum + (Number(accessor(g, i)) || 0), 0);

export function buildCsv(playerName, games) {
  const header = COLUMNS.map(([label]) => label);
  const rows = games.map((g, i) => COLUMNS.map(([, fn]) => fn(g, i)));

  // Totals row: sum counting stats, recompute FT% from totals, blank labels.
  const ftm = sumColumn(games, (g) => g.freeThrowsMade);
  const fta = sumColumn(games, (g) => g.freeThrowsAttempted);
  const totalsRow = COLUMNS.map(([label, fn]) => {
    if (label === 'Game') return 'TOTAL';
    if (label === 'Opponent') return '';
    if (label === 'Result') return '';
    if (label === 'FT%') return fta > 0 ? Math.round((ftm / fta) * 100) : 0;
    return sumColumn(games, fn);
  });

  const lines = [
    [`Player`, playerName].map(csvCell).join(','),
    [`Exported`, new Date().toLocaleString()].map(csvCell).join(','),
    '',
    header.map(csvCell).join(','),
    ...rows.map((r) => r.map(csvCell).join(',')),
    totalsRow.map(csvCell).join(','),
  ];
  return lines.join('\n');
}

export function buildSummary(playerName, games) {
  const totalPts = games.reduce((s, g) => s + playerPointsFor(g), 0);
  const n = games.length || 1;
  const avg = (key) =>
    (games.reduce((s, g) => s + (g[key] || 0), 0) / n).toFixed(1);
  const lines = [
    `🏀 ${playerName} — Tournament Stats`,
    `${games.length} game${games.length === 1 ? '' : 's'} · ${totalPts} total pts (${(totalPts / n).toFixed(1)}/game)`,
    '',
    ...games.map((g, i) => {
      const res =
        (g.teamScore || 0) > (g.opponentScore || 0)
          ? 'W'
          : (g.teamScore || 0) < (g.opponentScore || 0)
          ? 'L'
          : 'T';
      return `G${i + 1} vs ${g.opponent || '—'} (${res} ${g.teamScore || 0}-${g.opponentScore || 0}): ${playerPointsFor(g)} pts, ${g.assists || 0} ast, ${g.rebounds || 0} reb`;
    }),
    '',
    `Averages: ${avg('rebounds')} reb · ${avg('assists')} ast · ${avg('steals')} stl · ${avg('blocks')} blk`,
  ];
  return lines.join('\n');
}

export function exportFileName(playerName, ext) {
  const date = new Date().toISOString().split('T')[0];
  const safe = (playerName || 'player').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `${safe}-tournament-${date}.${ext}`;
}
