import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Minus,
  Trophy,
  RotateCcw,
  Download,
  Cloud,
  FolderCog,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { buildCsv, buildSummary, exportFileName } from './exporters';
import {
  driveConfigured,
  uploadToDrive,
  pickFolder,
  getSavedFolder,
} from './googleDrive';

const STORAGE_KEY = 'basketball-tracker-v1';
const NAME_KEY = 'basketball-tracker-name-v1';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState(0);
  const [playerName, setPlayerName] = useState('Player');
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [driveStatus, setDriveStatus] = useState(null); // { type, text }
  const [driveFolder, setDriveFolder] = useState(null);
  const [uploadingDrive, setUploadingDrive] = useState(false);
  const [resetTarget, setResetTarget] = useState(null); // game index pending reset
  const [openSections, setOpenSections] = useState({ defense: true, mistakes: true });
  const hasLoadedRef = useRef(false);

  const emptyGame = () => ({
    opponent: '',
    teamScore: 0,
    opponentScore: 0,
    points2: 0,
    points2Attempted: 0,
    points3: 0,
    points3Attempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    assists: 0,
    rebounds: 0,
    offRebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fouls: 0,
  });

  // Merge a saved game onto the current shape and repair legacy data that
  // tracked makes without attempts (so a shooting % never divides by < makes).
  const migrateGame = (g) => {
    const m = { ...emptyGame(), ...g };
    m.points2Attempted = Math.max(m.points2Attempted || 0, m.points2 || 0);
    m.points3Attempted = Math.max(m.points3Attempted || 0, m.points3 || 0);
    m.freeThrowsAttempted = Math.max(m.freeThrowsAttempted || 0, m.freeThrowsMade || 0);
    return m;
  };

  const [games, setGames] = useState([emptyGame(), emptyGame(), emptyGame()]);

  useEffect(() => {
    try {
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) setPlayerName(savedName);
      const savedGames = localStorage.getItem(STORAGE_KEY);
      if (savedGames) {
        const parsed = JSON.parse(savedGames);
        if (Array.isArray(parsed) && parsed.length === 3) {
          setGames(parsed.map(migrateGame));
        }
      }
    } catch (e) {
      console.error('Load failed', e);
    }
    if (driveConfigured) setDriveFolder(getSavedFolder());
    hasLoadedRef.current = true;
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    } catch (e) {
      console.error('Save failed', e);
    }
  }, [games]);

  // Auto-clear transient success messages so the header doesn't stay cluttered.
  useEffect(() => {
    if (driveStatus?.type === 'ok') {
      const t = setTimeout(() => setDriveStatus(null), 4000);
      return () => clearTimeout(t);
    }
  }, [driveStatus]);

  const updateStat = (gameIdx, key, delta, min = 0) => {
    setGames(prev => prev.map((g, i) => {
      if (i !== gameIdx) return g;
      return { ...g, [key]: Math.max(min, (g[key] || 0) + delta) };
    }));
  };

  const updateOpponent = (gameIdx, value) => {
    setGames(prev => prev.map((g, i) => i === gameIdx ? { ...g, opponent: value } : g));
  };

  const updateScore = (gameIdx, side, delta) => {
    setGames(prev => prev.map((g, i) =>
      i === gameIdx ? { ...g, [side]: Math.max(0, (g[side] || 0) + delta) } : g
    ));
  };

  // A made shot bumps makes, attempts, and the team score together.
  const playerScored = (gameIdx, points, madeKey, attemptedKey) => {
    setGames(prev => prev.map((g, i) => {
      if (i !== gameIdx) return g;
      return {
        ...g,
        [madeKey]: (g[madeKey] || 0) + 1,
        [attemptedKey]: (g[attemptedKey] || 0) + 1,
        teamScore: (g.teamScore || 0) + points,
      };
    }));
  };

  // A missed shot only counts as an attempt.
  const playerMissed = (gameIdx, attemptedKey) => {
    setGames(prev => prev.map((g, i) =>
      i === gameIdx ? { ...g, [attemptedKey]: (g[attemptedKey] || 0) + 1 } : g
    ));
  };

  const undoMade = (gameIdx, points, madeKey, attemptedKey) => {
    setGames(prev => prev.map((g, i) => {
      if (i !== gameIdx) return g;
      if ((g[madeKey] || 0) <= 0) return g;
      const nextMade = g[madeKey] - 1;
      return {
        ...g,
        [madeKey]: nextMade,
        [attemptedKey]: Math.max(nextMade, (g[attemptedKey] || 0) - 1),
        teamScore: Math.max(0, (g.teamScore || 0) - points),
      };
    }));
  };

  const undoMiss = (gameIdx, madeKey, attemptedKey) => {
    setGames(prev => prev.map((g, i) => {
      if (i !== gameIdx) return g;
      const missed = (g[attemptedKey] || 0) - (g[madeKey] || 0);
      if (missed <= 0) return g;
      return { ...g, [attemptedKey]: g[attemptedKey] - 1 };
    }));
  };

  const resetGame = (gameIdx) => {
    setGames(prev => prev.map((g, i) => i === gameIdx ? emptyGame() : g));
    setResetTarget(null);
  };

  const savePlayerName = () => {
    const name = tempName.trim() || 'Player';
    setPlayerName(name);
    setEditingName(false);
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { }
  };

  const exportBackup = () => {
    const data = JSON.stringify({ playerName, games }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playerName}-tournament-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToDrive = async () => {
    if (uploadingDrive) return;
    setUploadingDrive(true);
    setDriveStatus({ type: 'working', text: 'Uploading to Drive…' });
    try {
      const files = [
        {
          name: exportFileName(playerName, 'csv'),
          mimeType: 'text/csv',
          content: buildCsv(playerName, games),
        },
        {
          name: exportFileName(playerName, 'json'),
          mimeType: 'application/json',
          content: JSON.stringify({ playerName, games }, null, 2),
        },
      ];
      const { folder } = await uploadToDrive(files);
      setDriveFolder(folder);
      setDriveStatus({ type: 'ok', text: `Saved to “${folder.name}”` });
    } catch (e) {
      setDriveStatus({ type: 'error', text: e.message || 'Upload failed' });
    } finally {
      setUploadingDrive(false);
    }
  };

  const changeDriveFolder = async () => {
    try {
      const folder = await pickFolder();
      if (folder) {
        setDriveFolder(folder);
        setDriveStatus({ type: 'ok', text: `Folder set to “${folder.name}”` });
      }
    } catch (e) {
      setDriveStatus({ type: 'error', text: e.message || 'Could not pick folder' });
    }
  };

  const toggleSection = (key) =>
    setOpenSections(s => ({ ...s, [key]: !s[key] }));

  const gameResult = (g) => {
    if (!(g.teamScore || g.opponentScore)) return null;
    if (g.teamScore > g.opponentScore) return 'W';
    if (g.teamScore < g.opponentScore) return 'L';
    return 'T';
  };

  const game = games[activeGame];
  const playerPoints = (game.points2 * 2) + (game.points3 * 3) + game.freeThrowsMade;
  const scoreDiff = game.teamScore - game.opponentScore;

  const totals = games.reduce((acc, g) => {
    const pts = (g.points2 * 2) + (g.points3 * 3) + g.freeThrowsMade;
    return {
      points: acc.points + pts,
      assists: acc.assists + g.assists,
      rebounds: acc.rebounds + g.rebounds,
      offRebounds: acc.offRebounds + g.offRebounds,
      steals: acc.steals + g.steals,
      blocks: acc.blocks + g.blocks,
      turnovers: acc.turnovers + g.turnovers,
      fouls: acc.fouls + g.fouls,
      fgMade: acc.fgMade + g.points2 + g.points3,
      fgAtt: acc.fgAtt + g.points2Attempted + g.points3Attempted,
      ftMade: acc.ftMade + g.freeThrowsMade,
      ftAtt: acc.ftAtt + g.freeThrowsAttempted,
    };
  }, {
    points: 0, assists: 0, rebounds: 0, offRebounds: 0, steals: 0, blocks: 0,
    turnovers: 0, fouls: 0, fgMade: 0, fgAtt: 0, ftMade: 0, ftAtt: 0,
  });

  const pct = (made, att) => (att > 0 ? Math.round((made / att) * 100) : 0);
  const totalFgPct = pct(totals.fgMade, totals.fgAtt);
  const totalFtPct = pct(totals.ftMade, totals.ftAtt);
  const ppg = (totals.points / games.length).toFixed(1);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-orange-500 animate-spin" />
        <div className="text-slate-400 text-sm">Loading your stats…</div>
      </div>
    );
  }

  const btnFocus =
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';

  const StatRow = ({ label, value, statKey, color = 'orange' }) => {
    const colors = {
      orange: 'bg-orange-500 hover:bg-orange-600',
      blue: 'bg-blue-500 hover:bg-blue-600',
      green: 'bg-green-500 hover:bg-green-600',
      purple: 'bg-purple-500 hover:bg-purple-600',
      red: 'bg-red-500 hover:bg-red-600',
      teal: 'bg-teal-500 hover:bg-teal-600',
    };
    return (
      <div className="flex items-center justify-between bg-slate-800 rounded-xl p-3 border border-slate-700">
        <div className="flex-1">
          <div className="text-slate-300 text-sm font-medium">{label}</div>
          <div className="text-white text-2xl font-bold">{value}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => updateStat(activeGame, statKey, -1)}
            aria-label={`Decrease ${label}`}
            className={`w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center active:scale-95 transition ${btnFocus}`}
          >
            <Minus size={20} />
          </button>
          <button
            onClick={() => updateStat(activeGame, statKey, 1)}
            aria-label={`Increase ${label}`}
            className={`w-11 h-11 rounded-full ${colors[color]} text-white flex items-center justify-center active:scale-95 transition ${btnFocus}`}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    );
  };

  // Made/missed shooting control with a live percentage and per-action undo.
  const ShootingRow = ({ label, points, madeKey, attemptedKey }) => {
    const made = game[madeKey] || 0;
    const attempted = game[attemptedKey] || 0;
    const missed = Math.max(0, attempted - made);
    return (
      <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-slate-300 text-sm font-medium">{label}</div>
          <div className="text-white text-xl font-bold">
            {made}
            <span className="text-slate-500 text-base font-normal">/{attempted}</span>
            <span className="text-slate-400 text-sm font-normal ml-2">
              {pct(made, attempted)}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => playerScored(activeGame, points, madeKey, attemptedKey)}
            aria-label={`${label}: made (adds ${points} point${points > 1 ? 's' : ''})`}
            className={`bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-1 active:scale-95 transition ${btnFocus}`}
          >
            <Check size={16} /> Made +{points}
          </button>
          <button
            onClick={() => playerMissed(activeGame, attemptedKey)}
            aria-label={`${label}: missed`}
            className={`bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-1 active:scale-95 transition ${btnFocus}`}
          >
            <X size={16} /> Miss
          </button>
        </div>
        <div className="flex gap-2 mt-2 text-xs">
          <button
            onClick={() => undoMade(activeGame, points, madeKey, attemptedKey)}
            disabled={made <= 0}
            className="flex-1 bg-slate-700/60 py-1 rounded text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Undo Made
          </button>
          <button
            onClick={() => undoMiss(activeGame, madeKey, attemptedKey)}
            disabled={missed <= 0}
            className="flex-1 bg-slate-700/60 py-1 rounded text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Undo Miss
          </button>
        </div>
      </div>
    );
  };

  const SectionHeader = ({ id, children }) => (
    <button
      onClick={() => toggleSection(id)}
      aria-expanded={openSections[id]}
      className="w-full flex items-center justify-between text-xs uppercase text-slate-400 font-bold mb-2 mt-4 tracking-wider hover:text-slate-200 transition"
    >
      <span>{children}</span>
      {openSections[id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
  );

  const scoreBtn =
    `h-11 flex-1 rounded text-sm font-bold flex items-center justify-center active:scale-95 transition ${btnFocus}`;

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-8 max-w-md mx-auto">
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Trophy size={20} />
            <span className="text-sm font-medium opacity-90">Tournament Tracker</span>
          </div>
          <div className="flex items-center gap-1">
            {driveConfigured && (
              <button
                onClick={saveToDrive}
                disabled={uploadingDrive}
                className={`bg-white/20 hover:bg-white/30 text-xs px-2 py-1 rounded flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed ${btnFocus}`}
              >
                <Cloud size={12} className={uploadingDrive ? 'animate-pulse' : ''} />
                {uploadingDrive ? 'Saving…' : 'Drive'}
              </button>
            )}
            <button
              onClick={exportBackup}
              className={`bg-white/20 hover:bg-white/30 text-xs px-2 py-1 rounded flex items-center gap-1 ${btnFocus}`}
            >
              <Download size={12} /> Backup
            </button>
          </div>
        </div>
        {driveStatus && (
          <div className="flex items-center justify-between gap-2 mb-1 text-xs">
            <span
              className={
                driveStatus.type === 'error'
                  ? 'text-red-100'
                  : driveStatus.type === 'ok'
                  ? 'text-green-100'
                  : 'text-white/80'
              }
            >
              {driveStatus.text}
            </span>
            {driveConfigured && driveFolder && (
              <button onClick={changeDriveFolder} className="flex items-center gap-1 opacity-80 hover:opacity-100 underline">
                <FolderCog size={11} /> Change folder
              </button>
            )}
          </div>
        )}
        {editingName ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePlayerName()}
              autoFocus
              className="flex-1 bg-white/20 text-white placeholder-white/60 rounded px-3 py-1 text-lg font-bold outline-none"
              placeholder="Player name"
            />
            <button onClick={savePlayerName} className="bg-white text-orange-600 px-3 py-1 rounded font-bold">Save</button>
          </div>
        ) : (
          <button
            onClick={() => { setTempName(playerName); setEditingName(true); }}
            aria-label="Edit player name"
            className="text-2xl font-bold text-left hover:underline flex items-center gap-2"
          >
            {playerName}
            <Pencil size={16} className="opacity-80" />
          </button>
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="flex gap-2 mb-4">
          {[0, 1, 2].map(i => {
            const res = gameResult(games[i]);
            const isActive = activeGame === i;
            return (
              <button
                key={i}
                onClick={() => setActiveGame(i)}
                aria-pressed={isActive}
                className={`flex-1 py-2.5 rounded-xl font-bold transition leading-tight ${btnFocus} ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-lg'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <div>Game {i + 1}</div>
                {res ? (
                  <div className={`text-[10px] font-semibold mt-0.5 ${
                    isActive ? 'text-white/80'
                      : res === 'W' ? 'text-green-400'
                      : res === 'L' ? 'text-red-400'
                      : 'text-slate-400'
                  }`}>
                    {res} {games[i].teamScore}-{games[i].opponentScore}
                  </div>
                ) : (
                  <div className="text-[10px] font-medium mt-0.5 opacity-50">—</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl p-4 mb-4 border border-slate-600">
          <input
            type="text"
            value={game.opponent}
            onChange={(e) => updateOpponent(activeGame, e.target.value)}
            placeholder="Opponent name..."
            className="w-full bg-transparent text-slate-300 text-sm mb-3 outline-none border-b border-slate-600 pb-1"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-xs text-slate-400 uppercase mb-1">Our Team</div>
              <div className={`text-5xl font-bold ${scoreDiff >= 0 ? 'text-orange-400' : 'text-slate-300'}`}>{game.teamScore}</div>
              <div className="flex gap-1 justify-center mt-2">
                <button onClick={() => updateScore(activeGame, 'teamScore', -1)} aria-label="Our team minus 1" className={`${scoreBtn} bg-slate-600 hover:bg-slate-500`}>−</button>
                <button onClick={() => updateScore(activeGame, 'teamScore', 1)} aria-label="Our team plus 1" className={`${scoreBtn} bg-orange-600 hover:bg-orange-500`}>+1</button>
                <button onClick={() => updateScore(activeGame, 'teamScore', 2)} aria-label="Our team plus 2" className={`${scoreBtn} bg-orange-600 hover:bg-orange-500`}>+2</button>
                <button onClick={() => updateScore(activeGame, 'teamScore', 3)} aria-label="Our team plus 3" className={`${scoreBtn} bg-orange-600 hover:bg-orange-500`}>+3</button>
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-400 uppercase mb-1 truncate">{game.opponent || 'Opponent'}</div>
              <div className={`text-5xl font-bold ${scoreDiff < 0 ? 'text-red-400' : 'text-slate-300'}`}>{game.opponentScore}</div>
              <div className="flex gap-1 justify-center mt-2">
                <button onClick={() => updateScore(activeGame, 'opponentScore', -1)} aria-label="Opponent minus 1" className={`${scoreBtn} bg-slate-600 hover:bg-slate-500`}>−</button>
                <button onClick={() => updateScore(activeGame, 'opponentScore', 1)} aria-label="Opponent plus 1" className={`${scoreBtn} bg-slate-500 hover:bg-slate-400`}>+1</button>
                <button onClick={() => updateScore(activeGame, 'opponentScore', 2)} aria-label="Opponent plus 2" className={`${scoreBtn} bg-slate-500 hover:bg-slate-400`}>+2</button>
                <button onClick={() => updateScore(activeGame, 'opponentScore', 3)} aria-label="Opponent plus 3" className={`${scoreBtn} bg-slate-500 hover:bg-slate-400`}>+3</button>
              </div>
            </div>
          </div>
          <div className="mt-3 text-center">
            {scoreDiff === 0 ? (
              <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-slate-600/60 text-slate-200">Tied</span>
            ) : scoreDiff > 0 ? (
              <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">Leading +{scoreDiff}</span>
            ) : (
              <span className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Trailing {scoreDiff}</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 text-center mt-2 leading-tight">
            {playerName}'s scoring auto-adds to Our Team. Use +1/+2/+3 here for teammates' baskets.
          </div>
        </div>

        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-4 text-center">
          <div className="text-xs text-orange-300 uppercase">{playerName}'s Points (Game {activeGame + 1})</div>
          <div className="text-4xl font-bold text-orange-400">{playerPoints}</div>
        </div>

        <div className="text-xs uppercase text-slate-400 font-bold mb-2 mt-4 tracking-wider">{playerName}'s Scoring</div>
        <div className="space-y-2 mb-4">
          <ShootingRow label="2-Pointers" points={2} madeKey="points2" attemptedKey="points2Attempted" />
          <ShootingRow label="3-Pointers" points={3} madeKey="points3" attemptedKey="points3Attempted" />
          <ShootingRow label="Free Throws" points={1} madeKey="freeThrowsMade" attemptedKey="freeThrowsAttempted" />
        </div>

        <SectionHeader id="defense">Playmaking &amp; Defense</SectionHeader>
        {openSections.defense && (
          <div className="space-y-2 mb-4">
            <StatRow label="Assists" value={game.assists} statKey="assists" color="blue" />
            <StatRow label="Rebounds (Total)" value={game.rebounds} statKey="rebounds" color="green" />
            <StatRow label="Offensive Rebounds" value={game.offRebounds} statKey="offRebounds" color="green" />
            <StatRow label="Steals" value={game.steals} statKey="steals" color="purple" />
            <StatRow label="Blocks" value={game.blocks} statKey="blocks" color="teal" />
          </div>
        )}

        <SectionHeader id="mistakes">Mistakes</SectionHeader>
        {openSections.mistakes && (
          <div className="space-y-2 mb-4">
            <StatRow label="Turnovers" value={game.turnovers} statKey="turnovers" color="red" />
            <StatRow label="Fouls" value={game.fouls} statKey="fouls" color="red" />
          </div>
        )}

        <button
          onClick={() => setResetTarget(activeGame)}
          className={`w-full bg-slate-800 hover:bg-slate-700 text-slate-400 py-2 rounded-xl text-sm flex items-center justify-center gap-2 mb-4 ${btnFocus}`}
        >
          <RotateCcw size={14} /> Reset Game {activeGame + 1}
        </button>

        <div className="bg-gradient-to-br from-orange-600/20 to-purple-600/20 border border-orange-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={18} className="text-orange-400" />
            <div className="font-bold text-orange-300">{playerName}'s Tournament Totals</div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-slate-400 uppercase">Points</div>
              <div className="text-2xl font-bold text-orange-400">{totals.points}</div>
              <div className="text-[10px] text-slate-500">{ppg}/game</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Assists</div>
              <div className="text-2xl font-bold text-blue-400">{totals.assists}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Rebounds</div>
              <div className="text-2xl font-bold text-green-400">{totals.rebounds}</div>
              <div className="text-[10px] text-slate-500">{totals.offRebounds} off</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Steals</div>
              <div className="text-2xl font-bold text-purple-400">{totals.steals}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Blocks</div>
              <div className="text-2xl font-bold text-teal-400">{totals.blocks}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Turnovers</div>
              <div className="text-2xl font-bold text-red-400">{totals.turnovers}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center mt-3 pt-3 border-t border-orange-500/20">
            <div>
              <div className="text-xs text-slate-400 uppercase">FG%</div>
              <div className="text-xl font-bold text-orange-300">{totalFgPct}%</div>
              <div className="text-[10px] text-slate-500">{totals.fgMade}/{totals.fgAtt}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">FT%</div>
              <div className="text-xl font-bold text-orange-300">{totalFtPct}%</div>
              <div className="text-[10px] text-slate-500">{totals.ftMade}/{totals.ftAtt}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Fouls</div>
              <div className="text-xl font-bold text-red-400">{totals.fouls}</div>
            </div>
          </div>
        </div>
      </div>

      {resetTarget !== null && (
        <div
          className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setResetTarget(null)}
        >
          <div
            className="bg-slate-800 border border-slate-600 rounded-2xl p-5 max-w-xs w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2 text-orange-400">
              <AlertTriangle size={20} />
              <span className="font-bold">Reset Game {resetTarget + 1}?</span>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              This clears all scores and stats for Game {resetTarget + 1}. This can't be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setResetTarget(null)}
                className={`flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-bold ${btnFocus}`}
              >
                Cancel
              </button>
              <button
                onClick={() => resetGame(resetTarget)}
                className={`flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg font-bold ${btnFocus}`}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
