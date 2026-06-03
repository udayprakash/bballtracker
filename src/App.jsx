import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Trophy, RotateCcw, Download, Cloud, FolderCog } from 'lucide-react';
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
  const hasLoadedRef = useRef(false);

  const emptyGame = () => ({
    opponent: '',
    teamScore: 0,
    opponentScore: 0,
    points2: 0,
    points3: 0,
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

  const [games, setGames] = useState([emptyGame(), emptyGame(), emptyGame()]);

  useEffect(() => {
    try {
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) setPlayerName(savedName);
      const savedGames = localStorage.getItem(STORAGE_KEY);
      if (savedGames) {
        const parsed = JSON.parse(savedGames);
        if (Array.isArray(parsed) && parsed.length === 3) {
          setGames(parsed.map(g => ({ ...emptyGame(), ...g })));
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

  const playerScored = (gameIdx, points, statKey) => {
    setGames(prev => prev.map((g, i) => {
      if (i !== gameIdx) return g;
      return {
        ...g,
        [statKey]: (g[statKey] || 0) + 1,
        teamScore: (g.teamScore || 0) + points,
        ...(statKey === 'freeThrowsMade' ? { freeThrowsAttempted: (g.freeThrowsAttempted || 0) + 1 } : {})
      };
    }));
  };

  const playerMissedFT = (gameIdx) => {
    setGames(prev => prev.map((g, i) =>
      i === gameIdx ? { ...g, freeThrowsAttempted: (g.freeThrowsAttempted || 0) + 1 } : g
    ));
  };

  const undoPlayerScore = (gameIdx, points, statKey) => {
    setGames(prev => prev.map((g, i) => {
      if (i !== gameIdx) return g;
      if ((g[statKey] || 0) <= 0) return g;
      return {
        ...g,
        [statKey]: g[statKey] - 1,
        teamScore: Math.max(0, (g.teamScore || 0) - points),
      };
    }));
  };

  const resetGame = (gameIdx) => {
    if (!confirm(`Reset all stats for Game ${gameIdx + 1}?`)) return;
    setGames(prev => prev.map((g, i) => i === gameIdx ? emptyGame() : g));
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

  const game = games[activeGame];
  const playerPoints = (game.points2 * 2) + (game.points3 * 3) + game.freeThrowsMade;
  const ftPct = game.freeThrowsAttempted > 0
    ? Math.round((game.freeThrowsMade / game.freeThrowsAttempted) * 100)
    : 0;

  const totals = games.reduce((acc, g) => {
    const pts = (g.points2 * 2) + (g.points3 * 3) + g.freeThrowsMade;
    return {
      points: acc.points + pts,
      assists: acc.assists + g.assists,
      rebounds: acc.rebounds + g.rebounds,
      steals: acc.steals + g.steals,
      blocks: acc.blocks + g.blocks,
      fouls: acc.fouls + g.fouls,
    };
  }, { points: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0, fouls: 0 });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

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
            className="w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center active:scale-95 transition"
          >
            <Minus size={20} />
          </button>
          <button
            onClick={() => updateStat(activeGame, statKey, 1)}
            className={`w-11 h-11 rounded-full ${colors[color]} text-white flex items-center justify-center active:scale-95 transition`}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    );
  };

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
              <button onClick={saveToDrive} className="bg-white/20 hover:bg-white/30 text-xs px-2 py-1 rounded flex items-center gap-1">
                <Cloud size={12} /> Drive
              </button>
            )}
            <button onClick={exportBackup} className="bg-white/20 hover:bg-white/30 text-xs px-2 py-1 rounded flex items-center gap-1">
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
            className="text-2xl font-bold text-left hover:underline"
          >
            {playerName} ✏️
          </button>
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="flex gap-2 mb-4">
          {[0, 1, 2].map(i => (
            <button
              key={i}
              onClick={() => setActiveGame(i)}
              className={`flex-1 py-3 rounded-xl font-bold transition ${
                activeGame === i
                  ? 'bg-orange-500 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Game {i + 1}
            </button>
          ))}
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
              <div className="text-5xl font-bold text-orange-400">{game.teamScore}</div>
              <div className="flex gap-1 justify-center mt-2 flex-wrap">
                <button onClick={() => updateScore(activeGame, 'teamScore', -1)} className="w-9 h-9 rounded bg-slate-600 hover:bg-slate-500 text-sm font-bold">−</button>
                <button onClick={() => updateScore(activeGame, 'teamScore', 1)} className="w-9 h-9 rounded bg-orange-600 hover:bg-orange-500 text-sm font-bold">+1</button>
                <button onClick={() => updateScore(activeGame, 'teamScore', 2)} className="w-9 h-9 rounded bg-orange-600 hover:bg-orange-500 text-sm font-bold">+2</button>
                <button onClick={() => updateScore(activeGame, 'teamScore', 3)} className="w-9 h-9 rounded bg-orange-600 hover:bg-orange-500 text-sm font-bold">+3</button>
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-400 uppercase mb-1 truncate">{game.opponent || 'Opponent'}</div>
              <div className="text-5xl font-bold text-slate-300">{game.opponentScore}</div>
              <div className="flex gap-1 justify-center mt-2 flex-wrap">
                <button onClick={() => updateScore(activeGame, 'opponentScore', -1)} className="w-9 h-9 rounded bg-slate-600 hover:bg-slate-500 text-sm font-bold">−</button>
                <button onClick={() => updateScore(activeGame, 'opponentScore', 1)} className="w-9 h-9 rounded bg-slate-500 hover:bg-slate-400 text-sm font-bold">+1</button>
                <button onClick={() => updateScore(activeGame, 'opponentScore', 2)} className="w-9 h-9 rounded bg-slate-500 hover:bg-slate-400 text-sm font-bold">+2</button>
                <button onClick={() => updateScore(activeGame, 'opponentScore', 3)} className="w-9 h-9 rounded bg-slate-500 hover:bg-slate-400 text-sm font-bold">+3</button>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 text-center mt-3 leading-tight">
            {playerName}'s scoring auto-adds to Our Team. Use +1/+2/+3 here for teammates' baskets.
          </div>
        </div>

        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-4 text-center">
          <div className="text-xs text-orange-300 uppercase">{playerName}'s Points (Game {activeGame + 1})</div>
          <div className="text-4xl font-bold text-orange-400">{playerPoints}</div>
        </div>

        <div className="text-xs uppercase text-slate-500 font-bold mb-2 mt-4">{playerName}'s Scoring</div>
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between bg-slate-800 rounded-xl p-3 border border-slate-700">
            <div className="flex-1">
              <div className="text-slate-300 text-sm font-medium">2-Pointers Made</div>
              <div className="text-white text-2xl font-bold">{game.points2}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => undoPlayerScore(activeGame, 2, 'points2')} className="w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center active:scale-95 transition"><Minus size={20} /></button>
              <button onClick={() => playerScored(activeGame, 2, 'points2')} className="w-11 h-11 rounded-full bg-orange-500 hover:bg-orange-600 flex items-center justify-center active:scale-95 transition"><Plus size={20} /></button>
            </div>
          </div>
          <div className="flex items-center justify-between bg-slate-800 rounded-xl p-3 border border-slate-700">
            <div className="flex-1">
              <div className="text-slate-300 text-sm font-medium">3-Pointers Made</div>
              <div className="text-white text-2xl font-bold">{game.points3}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => undoPlayerScore(activeGame, 3, 'points3')} className="w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center active:scale-95 transition"><Minus size={20} /></button>
              <button onClick={() => playerScored(activeGame, 3, 'points3')} className="w-11 h-11 rounded-full bg-orange-500 hover:bg-orange-600 flex items-center justify-center active:scale-95 transition"><Plus size={20} /></button>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <div className="mb-2">
              <div className="text-slate-300 text-sm font-medium">Free Throws</div>
              <div className="text-white text-2xl font-bold">
                {game.freeThrowsMade} / {game.freeThrowsAttempted}
                <span className="text-slate-400 text-sm font-normal ml-2">({ftPct}%)</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => playerScored(activeGame, 1, 'freeThrowsMade')} className="bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg font-bold text-sm active:scale-95 transition">✓ Made</button>
              <button onClick={() => playerMissedFT(activeGame)} className="bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg font-bold text-sm active:scale-95 transition">✗ Missed</button>
            </div>
            <div className="flex gap-2 mt-2 text-xs">
              <button onClick={() => undoPlayerScore(activeGame, 1, 'freeThrowsMade')} className="flex-1 bg-slate-700 py-1 rounded text-slate-300">Undo Made</button>
              <button onClick={() => updateStat(activeGame, 'freeThrowsAttempted', -1)} className="flex-1 bg-slate-700 py-1 rounded text-slate-300">Undo Attempt</button>
            </div>
          </div>
        </div>

        <div className="text-xs uppercase text-slate-500 font-bold mb-2">Playmaking & Defense</div>
        <div className="space-y-2 mb-4">
          <StatRow label="Assists" value={game.assists} statKey="assists" color="blue" />
          <StatRow label="Rebounds (Total)" value={game.rebounds} statKey="rebounds" color="green" />
          <StatRow label="Offensive Rebounds" value={game.offRebounds} statKey="offRebounds" color="green" />
          <StatRow label="Steals" value={game.steals} statKey="steals" color="purple" />
          <StatRow label="Blocks" value={game.blocks} statKey="blocks" color="teal" />
        </div>

        <div className="text-xs uppercase text-slate-500 font-bold mb-2">Mistakes</div>
        <div className="space-y-2 mb-4">
          <StatRow label="Turnovers" value={game.turnovers} statKey="turnovers" color="red" />
          <StatRow label="Fouls" value={game.fouls} statKey="fouls" color="red" />
        </div>

        <button
          onClick={() => resetGame(activeGame)}
          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 py-2 rounded-xl text-sm flex items-center justify-center gap-2 mb-4"
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
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Assists</div>
              <div className="text-2xl font-bold text-blue-400">{totals.assists}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase">Rebounds</div>
              <div className="text-2xl font-bold text-green-400">{totals.rebounds}</div>
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
              <div className="text-xs text-slate-400 uppercase">Fouls</div>
              <div className="text-2xl font-bold text-red-400">{totals.fouls}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
