import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { profileAnalysisService } from '../services/profileAnalysisService';
import { ChessGame } from '../types/game';
import {
  ReviewAnalysis,
  ReviewClassification,
  ReviewProgress,
  analyzeGameForReview,
  classificationMeta,
  evalStatusText,
  formatEval,
  resultLabel,
} from '../utils/gameReviewAnalysis';
import { Button } from '../components/ui/Button';
import { loadSelectedGame, persistSelectedGame } from '../utils/selectedGame';
import { STOCKFISH_DEPTH, stockfishService } from '../services/stockfishService';

const CLASSIFICATION_ORDER: ReviewClassification[] = [
  'brilliant',
  'great',
  'best',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'blunder',
];

/** Clamp mate-scale evals so the advantage graph stays readable (Chess.com-style). */
function clampEvalForGraph(evaluation: number): number {
  if (Math.abs(evaluation) >= 90000) {
    return evaluation > 0 ? 800 : -800;
  }
  return Math.max(-800, Math.min(800, evaluation));
}

const EvalGraph: React.FC<{
  series: number[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
}> = ({ series, currentIndex, onSelectIndex }) => {
  const width = 320;
  const height = 80;
  const mid = height / 2;
  const clamped = series.map(clampEvalForGraph);
  const maxAbs = Math.max(150, ...clamped.map((value) => Math.abs(value)));

  const points = clamped.map((value, index) => {
    const x = series.length <= 1 ? 0 : (index / (series.length - 1)) * width;
    const y = mid - (value / maxAbs) * (mid - 3);
    return { x, y, value };
  });

  // White advantage (above midline) and black advantage (below) as separate fills
  const whiteArea = points.length
    ? `M 0 ${mid} ${points.map((p) => `L ${p.x} ${Math.min(mid, p.y)}`).join(' ')} L ${width} ${mid} Z`
    : '';
  const blackArea = points.length
    ? `M 0 ${mid} ${points.map((p) => `L ${p.x} ${Math.max(mid, p.y)}`).join(' ')} L ${width} ${mid} Z`
    : '';
  const linePath = points.length
    ? `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`
    : '';

  const lastMoveNumber = Math.max(1, Math.floor((series.length - 1) / 2));
  const tickLabels = [1, ...[0.25, 0.5, 0.75, 1].map((r) => Math.max(1, Math.round(lastMoveNumber * r)))]
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .slice(0, 4);
  const ticks = tickLabels.map((label) => {
    const ply = Math.min(series.length - 1, Math.max(0, label * 2));
    return {
      x: series.length <= 1 ? 0 : (ply / (series.length - 1)) * width,
      label: String(label),
    };
  });

  const cursorX =
    series.length > 1
      ? ((currentIndex + 1) / (series.length - 1)) * width
      : 0;

  return (
    <div className="rounded-xl border border-sky-200/70 bg-gradient-to-b from-slate-100 to-slate-200/80 p-2 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
      <svg
        viewBox={`0 0 ${width} ${height + 14}`}
        className="h-24 w-full cursor-crosshair"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const ply = Math.round(ratio * (series.length - 1));
          onSelectIndex(Math.max(-1, Math.min(series.length - 2, ply - 1)));
        }}
      >
        <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.35)" />
        <path d={whiteArea} fill="rgba(248, 250, 252, 0.95)" />
        <path d={blackArea} fill="rgba(15, 23, 42, 0.88)" />
        <line x1="0" y1={mid} x2={width} y2={mid} stroke="rgba(100,116,139,0.55)" strokeWidth="1" />
        <path d={linePath} fill="none" stroke="rgba(14, 165, 233, 0.9)" strokeWidth="1.5" />
        {series.length > 1 && (
          <line
            x1={cursorX}
            y1="0"
            x2={cursorX}
            y2={height}
            stroke="#f59e0b"
            strokeWidth="1.5"
          />
        )}
        {ticks.map((tick) => (
          <text
            key={`${tick.label}-${tick.x}`}
            x={tick.x}
            y={height + 11}
            textAnchor="middle"
            className="fill-slate-500 text-[9px] dark:fill-slate-400"
          >
            {tick.label}
          </text>
        ))}
      </svg>
    </div>
  );
};

const PhaseBars: React.FC<{
  phaseAccuracy: ReviewAnalysis['phaseAccuracy'];
}> = ({ phaseAccuracy }) => {
  const rows = [
    { label: 'Opening', white: phaseAccuracy.opening.white, black: phaseAccuracy.opening.black },
    { label: 'Middlegame', white: phaseAccuracy.middlegame.white, black: phaseAccuracy.middlegame.black },
    { label: 'Endgame', white: phaseAccuracy.endgame.white, black: phaseAccuracy.endgame.black },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Accuracy by phase</p>
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>{row.label}</span>
            <span>{row.white}% / {row.black}%</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, row.white)}%` }} />
            <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, row.black)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

/** Chess.com-style classification chip anchored near the destination square. */
const ClassificationBadge: React.FC<{
  square: string;
  glyph: string;
  classification: ReviewClassification;
  orientation: 'white' | 'black';
}> = ({ square, glyph, classification, orientation }) => {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(square[1], 10) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  const left = ((col + 0.72) / 8) * 100;
  const top = ((row + 0.08) / 8) * 100;
  const color = classificationMeta[classification].color;

  return (
    <div
      className="pointer-events-none absolute z-10 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white shadow-md"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        backgroundColor: color,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {glyph}
    </div>
  );
};

const GameReviewPage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [game, setGame] = useState<ChessGame | null>(
    (location.state as { game?: ChessGame } | null)?.game || loadSelectedGame(gameId)
  );
  const [analysis, setAnalysis] = useState<ReviewAnalysis | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<ReviewProgress | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [activeTab, setActiveTab] = useState<'report' | 'time' | 'database'>('report');
  const [whiteAvatar, setWhiteAvatar] = useState<string | null>(null);
  const [blackAvatar, setBlackAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (game) {
      persistSelectedGame(game);
      return;
    }

    if (!currentUser?.id || !gameId) return;

    profileAnalysisService.loadProfile(currentUser.id).then((profile) => {
      const found = profile?.games.find((item) => item.id === gameId) || null;
      if (found) {
        setGame(found);
        persistSelectedGame(found);
      }
    });
  }, [currentUser?.id, game, gameId]);

  useEffect(() => {
    if (!game) return undefined;

    const abortController = new AbortController();
    setIsAnalyzing(true);
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisProgress({
      currentMove: 0,
      totalMoves: game.moves?.length || 0,
      progress: 0,
      message: 'Starting Stockfish…',
    });
    setCurrentMoveIndex(-1);
    setIsPlaying(false);

    analyzeGameForReview(game, {
      depth: STOCKFISH_DEPTH,
      signal: abortController.signal,
      onProgress: setAnalysisProgress,
    })
      .then((result) => {
        if (abortController.signal.aborted) return;
        setAnalysis(result);
        setIsAnalyzing(false);
        setAnalysisProgress(null);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        setIsAnalyzing(false);
        setAnalysisError(error instanceof Error ? error.message : 'Stockfish analysis failed');
      });

    return () => {
      abortController.abort();
      stockfishService.terminate();
    };
  }, [game]);

  const positionFen = useMemo(() => {
    if (!game || !analysis) return 'start';
    if (currentMoveIndex < 0) return 'start';
    return analysis.moves[currentMoveIndex]?.fenAfter || 'start';
  }, [analysis, currentMoveIndex, game]);

  const currentMove = analysis && currentMoveIndex >= 0 ? analysis.moves[currentMoveIndex] : null;

  // Chess.com Game Review: after a suboptimal move, show a green suggestion
  // arrow for the best move that should have been played (from fenBefore),
  // not a red arrow along the move that was already played.
  const showSuggestion =
    Boolean(currentMove) &&
    ['inaccuracy', 'mistake', 'blunder'].includes(currentMove!.classification) &&
    Boolean(currentMove!.bestMoveFrom && currentMove!.bestMoveTo) &&
    (currentMove!.bestMoveFrom !== currentMove!.from || currentMove!.bestMoveTo !== currentMove!.to);

  const boardArrows = useMemo(() => {
    if (!showSuggestion || !currentMove?.bestMoveFrom || !currentMove?.bestMoveTo) return [];
    return [
      {
        startSquare: currentMove.bestMoveFrom,
        endSquare: currentMove.bestMoveTo,
        color: '#15781B',
      },
    ];
  }, [currentMove, showSuggestion]);

  const squareStyles = useMemo(() => {
    if (!currentMove) return {};
    const styles: Record<string, React.CSSProperties> = {
      [currentMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.35)' },
      [currentMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.5)' },
    };

    if (currentMove.classification === 'blunder' || currentMove.classification === 'mistake') {
      styles[currentMove.to] = { backgroundColor: 'rgba(235, 97, 80, 0.72)' };
    } else if (currentMove.classification === 'inaccuracy') {
      styles[currentMove.to] = { backgroundColor: 'rgba(234, 179, 8, 0.55)' };
    } else if (currentMove.classification === 'brilliant' || currentMove.classification === 'great') {
      styles[currentMove.to] = { backgroundColor: 'rgba(34, 197, 94, 0.45)' };
    }

    return styles;
  }, [currentMove]);

  const goToMove = (index: number) => {
    if (!analysis) return;
    setIsPlaying(false);
    setCurrentMoveIndex(Math.max(-1, Math.min(index, analysis.moves.length - 1)));
  };

  useEffect(() => {
    if (!isPlaying || !analysis) return undefined;
    if (currentMoveIndex >= analysis.moves.length - 1) {
      setIsPlaying(false);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCurrentMoveIndex((prev) => {
        if (!analysis || prev >= analysis.moves.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [analysis, currentMoveIndex, isPlaying]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!analysis) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToMove(currentMoveIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToMove(currentMoveIndex + 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        goToMove(-1);
      } else if (event.key === 'End') {
        event.preventDefault();
        goToMove(analysis.moves.length - 1);
      } else if (event.key === ' ') {
        event.preventDefault();
        if (currentMoveIndex >= analysis.moves.length - 1) goToMove(-1);
        setIsPlaying((prev) => !prev);
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [analysis, currentMoveIndex]);

  useEffect(() => {
    let isMounted = true;

    const loadAvatar = async (username: string, setter: (url: string | null) => void) => {
      if (!username || username === 'Unknown') {
        setter(null);
        return;
      }
      try {
        const response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`);
        if (!response.ok) {
          if (isMounted) setter(null);
          return;
        }
        const data = await response.json();
        if (isMounted) setter(typeof data?.avatar === 'string' ? data.avatar : null);
      } catch {
        if (isMounted) setter(null);
      }
    };

    if (game?.site === 'chess.com') {
      loadAvatar(game.white.name, setWhiteAvatar);
      loadAvatar(game.black.name, setBlackAvatar);
    } else {
      setWhiteAvatar(null);
      setBlackAvatar(null);
    }

    return () => {
      isMounted = false;
    };
  }, [game]);

  const whiteClock = useMemo(() => {
    if (!analysis) return '—';
    for (let i = currentMoveIndex; i >= 0; i -= 1) {
      if (analysis.moves[i].color === 'w' && analysis.moves[i].clock) return analysis.moves[i].clock!;
    }
    return analysis.moves.find((m) => m.color === 'w' && m.clock)?.clock || '—';
  }, [analysis, currentMoveIndex]);

  const blackClock = useMemo(() => {
    if (!analysis) return '—';
    for (let i = currentMoveIndex; i >= 0; i -= 1) {
      if (analysis.moves[i].color === 'b' && analysis.moves[i].clock) return analysis.moves[i].clock!;
    }
    return analysis.moves.find((m) => m.color === 'b' && m.clock)?.clock || '—';
  }, [analysis, currentMoveIndex]);

  const statusText = useMemo(() => {
    if (!analysis) return '';
    if (currentMoveIndex < 0) {
      const startEval = analysis.evalSeries[0] ?? 0;
      return `${evalStatusText(startEval)} · ${formatEval(startEval)}`;
    }
    const evaluation = analysis.moves[currentMoveIndex].evaluation;
    return `${evalStatusText(evaluation)} · ${formatEval(evaluation)}`;
  }, [analysis, currentMoveIndex]);

  const movePairs = useMemo(() => {
    if (!analysis) return [];
    const pairs: Array<{ number: number; white?: typeof analysis.moves[0]; black?: typeof analysis.moves[0] }> = [];
    for (let i = 0; i < analysis.moves.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: analysis.moves[i],
        black: analysis.moves[i + 1],
      });
    }
    return pairs;
  }, [analysis]);

  if (!game) {
    return (
      <div className="section-shell py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">Game not found</h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Select a game from your dashboard archive to open the review board.
          </p>
          <Button className="mt-6 cursor-pointer" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (isAnalyzing || !analysis) {
    return (
      <div className="section-shell py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            {analysisError ? 'Analysis failed' : 'Stockfish is analyzing'}
          </h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            {analysisError || analysisProgress?.message || 'Loading Stockfish engine…'}
          </p>
          {!analysisError && (
            <div className="mx-auto mt-6 h-2 max-w-sm overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-sky-600 transition-all"
                style={{ width: `${analysisProgress?.progress ?? 5}%` }}
              />
            </div>
          )}
          {analysisProgress && !analysisError && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Depth {STOCKFISH_DEPTH} · move {analysisProgress.currentMove}/{analysisProgress.totalMoves}
            </p>
          )}
          {analysisError && (
            <Button className="mt-6 cursor-pointer" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </Button>
          )}
        </div>
      </div>
    );
  }

  const openingName = game.opening?.name && game.opening.name !== 'Unknown'
    ? game.opening.name
    : 'Unknown opening';

  return (
    <div className="flex flex-col bg-gradient-to-b from-sky-50/80 via-slate-50 to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 lg:h-[calc(100dvh-5rem)] lg:overflow-hidden">
      <div className="shrink-0 border-b border-sky-200/70 bg-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-3 sm:px-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-sky-800 transition hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="h-4 w-px bg-sky-200 dark:bg-slate-700" />
          <p className="truncate text-sm text-slate-600 dark:text-slate-300">
            {game.white.name} vs {game.black.name}
          </p>
          <span className="ml-auto hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
            Stockfish · depth {analysis.depth}
          </span>
        </div>
      </div>

      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 gap-3 p-3 pb-2 lg:grid-cols-[280px_minmax(0,1fr)_300px] lg:items-stretch xl:grid-cols-[300px_minmax(0,1fr)_320px] xl:gap-4 xl:px-4 xl:pb-2">
        <aside className="order-2 flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-sky-200/80 bg-white/90 shadow-soft dark:border-slate-700 dark:bg-slate-900/80 lg:order-1 lg:h-full lg:min-h-0">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="border-b border-sky-100 bg-sky-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/80">
              <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">{resultLabel(game.result)}</p>
              <p className="mt-1 text-sm text-sky-800 dark:text-sky-300">{openingName}</p>
              <div className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                <p>
                  <span className="font-medium text-slate-900 dark:text-white">{game.white.name}</span>
                  {game.white.rating ? ` (${game.white.rating})` : ''}
                </p>
                <p>
                  <span className="font-medium text-slate-900 dark:text-white">{game.black.name}</span>
                  {game.black.rating ? ` (${game.black.rating})` : ''}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {[game.timeControl, game.date].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            <div className="border-b border-sky-100 bg-white/95 p-3 dark:border-slate-700 dark:bg-slate-900/95">
              <EvalGraph
                series={analysis.evalSeries}
                currentIndex={currentMoveIndex}
                onSelectIndex={goToMove}
              />
            </div>

            <div>
              <div className="grid grid-cols-[40px_1fr_1fr] border-b border-sky-100 bg-slate-50/95 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-400">
                <span>#</span>
                <span>White</span>
                <span>Black</span>
              </div>
              {movePairs.map((pair) => {
                const whiteActive = pair.white && pair.white.index === currentMoveIndex;
                const blackActive = pair.black && pair.black.index === currentMoveIndex;
                return (
                  <div key={pair.number} className="grid grid-cols-[40px_1fr_1fr] border-b border-sky-50 text-sm dark:border-slate-800">
                    <div className="px-2 py-1.5 text-slate-400">{pair.number}</div>
                    <button
                      type="button"
                      disabled={!pair.white}
                      onClick={() => pair.white && goToMove(pair.white.index)}
                      className={`cursor-pointer px-2 py-1.5 text-left font-mono transition ${
                        whiteActive
                          ? 'bg-sky-200/80 text-slate-900 dark:bg-sky-500/30 dark:text-white'
                          : 'hover:bg-sky-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {pair.white ? (
                        <>
                          {pair.white.san}
                          {pair.white.glyph ? (
                            <span
                              className="ml-1 text-xs font-semibold"
                              style={{ color: classificationMeta[pair.white.classification].color }}
                            >
                              {pair.white.glyph}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      disabled={!pair.black}
                      onClick={() => pair.black && goToMove(pair.black.index)}
                      className={`cursor-pointer px-2 py-1.5 text-left font-mono transition ${
                        blackActive
                          ? 'bg-sky-200/80 text-slate-900 dark:bg-sky-500/30 dark:text-white'
                          : 'hover:bg-sky-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {pair.black ? (
                        <>
                          {pair.black.san}
                          {pair.black.glyph ? (
                            <span
                              className="ml-1 text-xs font-semibold"
                              style={{ color: classificationMeta[pair.black.classification].color }}
                            >
                              {pair.black.glyph}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="order-1 flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-sky-200/80 bg-white/90 p-3 shadow-soft dark:border-slate-700 dark:bg-slate-900/80 sm:p-4 lg:order-2 lg:h-full lg:min-h-0">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900 dark:text-white">{game.white.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{whiteClock}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="truncate font-semibold text-slate-900 dark:text-white">{game.black.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{blackClock}</p>
            </div>
          </div>

          <div className="mb-3 shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white dark:bg-sky-500/20 dark:text-sky-100">
            {statusText}
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <div className="relative aspect-square h-full max-h-full w-auto max-w-full">
              <div className="h-full w-full overflow-hidden rounded-sm border border-[#8b5a2b]/70 shadow-elevated">
                <Chessboard
                  options={{
                    position: positionFen === 'start' ? new Chess().fen() : positionFen,
                    boardOrientation,
                    allowDragging: false,
                    showNotation: true,
                    arrows: boardArrows,
                    squareStyles,
                    lightSquareStyle: { backgroundColor: '#f0d9b5' },
                    darkSquareStyle: { backgroundColor: '#b58863' },
                    boardStyle: {
                      borderRadius: '2px',
                      width: '100%',
                      height: '100%',
                    },
                  }}
                />
              </div>

              {currentMove && currentMove.glyph && (
                <ClassificationBadge
                  square={currentMove.to}
                  glyph={currentMove.glyph}
                  classification={currentMove.classification}
                  orientation={boardOrientation}
                />
              )}
            </div>
          </div>

          <div className="mt-4 flex shrink-0 items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-sky-200 text-slate-700 transition hover:bg-sky-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Flip board"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => goToMove(-1)} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-sky-200 text-slate-700 transition hover:bg-sky-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Start">
                <SkipBack className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => goToMove(currentMoveIndex - 1)} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-sky-200 text-slate-700 transition hover:bg-sky-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (currentMoveIndex >= analysis.moves.length - 1) goToMove(-1);
                  setIsPlaying((prev) => !prev);
                }}
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-sky-600 text-white transition hover:bg-sky-700"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => goToMove(currentMoveIndex + 1)} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-sky-200 text-slate-700 transition hover:bg-sky-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => goToMove(analysis.moves.length - 1)} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-sky-200 text-slate-700 transition hover:bg-sky-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="End">
                <SkipForward className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <aside className="order-3 flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-sky-200/80 bg-white/90 shadow-soft dark:border-slate-700 dark:bg-slate-900/80 lg:h-full lg:min-h-0">
          <div className="flex shrink-0 border-b border-sky-100 dark:border-slate-700">
            {([
              ['report', 'Report'],
              ['time', 'Time'],
              ['database', 'Database'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex-1 cursor-pointer px-3 py-2.5 text-sm font-medium transition ${
                  activeTab === id
                    ? 'border-b-2 border-sky-600 text-sky-800 dark:border-sky-400 dark:text-sky-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activeTab === 'report' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <img
                      src={whiteAvatar || '/pnp_logo.jpeg'}
                      alt={game.white.name}
                      className="mx-auto h-14 w-14 rounded-full border-2 border-white object-cover shadow dark:border-slate-700"
                    />
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                      {analysis.whiteAccuracy.toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Accuracy</p>
                    <p className="mt-1 text-sm font-medium text-sky-700 dark:text-sky-300">{analysis.whitePerformance}</p>
                  </div>
                  <div>
                    <img
                      src={blackAvatar || '/pnp_logo.jpeg'}
                      alt={game.black.name}
                      className="mx-auto h-14 w-14 rounded-full border-2 border-white object-cover shadow dark:border-slate-700"
                    />
                    <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                      {analysis.blackAccuracy.toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Accuracy</p>
                    <p className="mt-1 text-sm font-medium text-sky-700 dark:text-sky-300">{analysis.blackPerformance}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {CLASSIFICATION_ORDER.map((key) => {
                    const meta = classificationMeta[key];
                    return (
                      <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: meta.color }}
                          >
                            {meta.glyph || '•'}
                          </span>
                          <span className="text-slate-700 dark:text-slate-200">{meta.label}</span>
                        </div>
                        <span className="w-6 text-right font-semibold text-slate-900 dark:text-white">
                          {analysis.counts.white[key]}
                        </span>
                        <span className="w-6 text-right font-semibold text-slate-900 dark:text-white">
                          {analysis.counts.black[key]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <PhaseBars phaseAccuracy={analysis.phaseAccuracy} />
              </div>
            )}

            {activeTab === 'time' && (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p className="font-medium text-slate-900 dark:text-white">Clock usage</p>
                <p>White last clock: {whiteClock}</p>
                <p>Black last clock: {blackClock}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Clocks are parsed from Chess.com / Lichess PGN `%clk` annotations when available.
                </p>
              </div>
            )}

            {activeTab === 'database' && (
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p className="font-medium text-slate-900 dark:text-white">Game source</p>
                <p>Platform: {game.site}</p>
                <p>Opening: {openingName}</p>
                {game.opening?.eco && <p>ECO: {game.opening.eco}</p>}
                <p>Engine: Stockfish (depth {analysis.depth})</p>
                {game.url && (
                  <a
                    href={game.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex cursor-pointer text-sky-700 underline dark:text-sky-300"
                  >
                    Open original game
                  </a>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default GameReviewPage;
