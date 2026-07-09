import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  ArrowRight,
  BookOpen,
  Brain,
  Eye,
  Flag,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Target,
  Trophy
} from 'lucide-react';
import { GameAnalysis } from '../types/analysis';
import { LichessPuzzleResponse, PuzzleTrainingCategory, PuzzleTrainingConfig } from '../types/puzzle';
import { puzzleService } from '../services/puzzleService';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

interface PuzzleTrainerProps {
  analysis?: GameAnalysis | null;
}

const trainingCategories: Array<{
  id: PuzzleTrainingCategory;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'fix-weakness',
    title: 'Fix My Weaknesses',
    description: 'Puzzles matched to the tactical pattern your analysis struggled with most.',
    icon: <ShieldAlert className="h-5 w-5" />
  },
  {
    id: 'learn-mistakes',
    title: 'Learn From My Mistakes',
    description: 'Conversion and best-move puzzles that train sharper decisions after missed chances.',
    icon: <Brain className="h-5 w-5" />
  },
  {
    id: 'master-opening',
    title: 'Master My Openings',
    description: 'Opening-phase puzzles to improve early plans, development, and punishment patterns.',
    icon: <BookOpen className="h-5 w-5" />
  },
  {
    id: 'master-endgames',
    title: 'Master My Endgames',
    description: 'Endgame puzzles for technique, calculation, and clean conversion.',
    icon: <Flag className="h-5 w-5" />
  }
];

const PuzzleTrainer: React.FC<PuzzleTrainerProps> = ({ analysis }) => {
  const chessRef = useRef(new Chess());
  const [selectedCategory, setSelectedCategory] = useState<PuzzleTrainingCategory | null>(null);
  const [trainingConfig, setTrainingConfig] = useState<PuzzleTrainingConfig | null>(null);
  const [currentPuzzle, setCurrentPuzzle] = useState<LichessPuzzleResponse | null>(null);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [fen, setFen] = useState(chessRef.current.fen());
  const [status, setStatus] = useState('Choose a training target to begin.');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [solved, setSolved] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [showHint, setShowHint] = useState(false);
  const [isSolved, setIsSolved] = useState(false);

  const activeCategory = useMemo(
    () => trainingCategories.find(category => category.id === selectedCategory),
    [selectedCategory]
  );
  const sideToMove = fen.split(' ')[1] === 'b' ? 'Black' : 'White';

  useEffect(() => {
    if (!selectedCategory) return;

    const config = puzzleService.buildTrainingConfig(selectedCategory, analysis);
    setTrainingConfig(config);
    loadPuzzle(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, analysis]);

  const loadPuzzle = async (config = trainingConfig) => {
    if (!config) return;

    setIsLoading(true);
    setError(null);
    setShowHint(false);
    setIsSolved(false);
    setStatus('Loading a Lichess puzzle...');

    try {
      const puzzle = await puzzleService.getNextPuzzle(config);
      preparePuzzle(puzzle);
      setCurrentPuzzle(puzzle);
      setStatus('Find the best move.');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Could not load a puzzle.';
      setError(message);
      setStatus('Puzzle loading failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const preparePuzzle = (puzzle: LichessPuzzleResponse) => {
    const puzzleGame = new Chess();
    puzzleGame.loadPgn(puzzle.game.pgn);

    chessRef.current = puzzleGame;
    setSolutionIndex(0);
    setFen(puzzleGame.fen());
    setBoardOrientation(puzzleGame.turn() === 'w' ? 'white' : 'black');
  };

  const getExpectedMove = () => currentPuzzle?.puzzle.solution[solutionIndex];

  const getMoveFromUci = (uciMove: string) => ({
    from: uciMove.slice(0, 2),
    to: uciMove.slice(2, 4),
    promotion: uciMove[4]
  });

  const isLegalUciMove = (game: Chess, uciMove: string) => {
    return game.moves({ verbose: true }).some(move => {
      return move.from === uciMove.slice(0, 2) &&
        move.to === uciMove.slice(2, 4) &&
        (!uciMove[4] || move.promotion === uciMove[4]);
    });
  };

  const playUciMove = (uciMove: string) => {
    const move = chessRef.current.move(getMoveFromUci(uciMove));

    if (!move) {
      throw new Error(`Illegal puzzle move: ${uciMove}`);
    }
  };

  const finishPuzzle = () => {
    setIsSolved(true);
    setSolved(prev => prev + 1);
    setStreak(prev => prev + 1);
    setStatus('Solved. Nice calculation.');
  };

  const handlePieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    const expectedMove = getExpectedMove();

    if (!currentPuzzle || !expectedMove || !targetSquare || isSolved || isLoading) {
      return false;
    }

    if (!isLegalUciMove(chessRef.current, expectedMove)) {
      setError('This puzzle position did not match the Lichess solution. Please load the next puzzle.');
      return false;
    }

    const candidateMove = `${sourceSquare}${targetSquare}${expectedMove[4] || ''}`;

    if (candidateMove !== expectedMove) {
      setStreak(0);
      setStatus('Not quite. Reset your candidate and look for the forcing move.');
      return false;
    }

    try {
      playUciMove(expectedMove);
      let nextIndex = solutionIndex + 1;

      if (nextIndex >= currentPuzzle.puzzle.solution.length) {
        setFen(chessRef.current.fen());
        finishPuzzle();
        return true;
      }

      playUciMove(currentPuzzle.puzzle.solution[nextIndex]);
      nextIndex += 1;

      setSolutionIndex(nextIndex);
      setFen(chessRef.current.fen());

      if (nextIndex >= currentPuzzle.puzzle.solution.length) {
        finishPuzzle();
      } else {
        setStatus('Correct. Continue the line.');
      }

      return true;
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'The puzzle line could not be played.');
      return false;
    }
  };

  const resetCurrentPuzzle = () => {
    if (!currentPuzzle) return;
    setShowHint(false);
    setIsSolved(false);
    setStatus('Find the best move.');
    preparePuzzle(currentPuzzle);
  };

  const showSolution = () => {
    if (!currentPuzzle) return;

    try {
      let nextIndex = solutionIndex;
      while (nextIndex < currentPuzzle.puzzle.solution.length) {
        const move = currentPuzzle.puzzle.solution[nextIndex];
        playUciMove(move);
        nextIndex += 1;
      }
      setSolutionIndex(nextIndex);
      setFen(chessRef.current.fen());
      setStreak(0);
      setIsSolved(true);
      setStatus('Solution shown. Try the next puzzle fresh.');
    } catch (solutionError) {
      setError(solutionError instanceof Error ? solutionError.message : 'Could not show the solution.');
    }
  };

  const expectedMove = getExpectedMove();

  return (
    <div className="space-y-6">
      <div className="divide-y divide-sky-200/70 dark:divide-slate-700/80">
        {trainingCategories.map(category => {
          const config = puzzleService.buildTrainingConfig(category.id, analysis);
          const isActive = selectedCategory === category.id;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              className={`grid w-full cursor-pointer gap-2 py-3 text-left transition sm:grid-cols-[1fr_auto] sm:items-center ${
                isActive
                  ? 'bg-sky-50/70 dark:bg-slate-800/60'
                  : 'hover:bg-white/40 dark:hover:bg-slate-800/40'
              }`}
            >
              <div>
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  {category.icon}
                </div>
                <h3 className="mt-2 font-display text-base font-semibold text-slate-900 dark:text-white">{category.title}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{category.description}</p>
                <div className="mt-2 text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
                  Lichess theme: {config.angle}
                </div>
              </div>
              <Badge variant="outline" className="h-fit w-fit capitalize border-sky-200 text-sky-700 dark:border-slate-600 dark:text-sky-300">
                {config.difficulty}
              </Badge>
            </button>
          );
        })}
      </div>

      {selectedCategory && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="aurora-subtle">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2 font-display text-xl">
                    <Target className="h-5 w-5" />
                    {activeCategory?.title}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBoardOrientation(boardOrientation === 'white' ? 'black' : 'white')}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mx-auto aspect-square max-w-xl">
                  <Chessboard
                    options={{
                      position: fen,
                      boardOrientation,
                      allowDragging: !!currentPuzzle && !isSolved && !isLoading,
                      onPieceDrop: handlePieceDrop,
                      boardStyle: {
                        borderRadius: '14px',
                        boxShadow: '0 18px 48px rgba(15, 23, 42, 0.24)'
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="aurora-subtle">
              <CardHeader>
                <CardTitle className="font-display text-lg">Puzzle Session</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
                    <div className="text-xs text-sky-700 dark:text-sky-300">Streak</div>
                    <div className="font-display text-2xl font-semibold text-slate-900 dark:text-white">{streak}</div>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10">
                    <div className="text-xs text-sky-700 dark:text-sky-300">Solved</div>
                    <div className="font-display text-2xl font-semibold text-slate-900 dark:text-white">{solved}</div>
                  </div>
                </div>

                {currentPuzzle && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-sky-700 dark:text-sky-300">Side to Move</div>
                      <div className="font-semibold text-slate-900 dark:text-white">{sideToMove}</div>
                    </div>
                    <div>
                      <div className="text-sky-700 dark:text-sky-300">Puzzle Rating</div>
                      <div className="font-semibold text-slate-900 dark:text-white">{currentPuzzle.puzzle.rating}</div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {status}
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {error}
                  </div>
                )}

                {showHint && expectedMove && (
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    Try a move from <span className="font-mono">{expectedMove.slice(0, 2)}</span>.
                  </div>
                )}

                {currentPuzzle?.puzzle.themes && (
                  <div className="flex flex-wrap gap-2">
                    {currentPuzzle.puzzle.themes.slice(0, 5).map(theme => (
                      <Badge key={theme} variant="secondary" className="bg-ink-100 text-ink-700 dark:bg-slate-800 dark:text-slate-200">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowHint(true)} disabled={!currentPuzzle || isSolved}>
                    <Lightbulb className="mr-2 h-4 w-4" />
                    Hint
                  </Button>
                  <Button type="button" variant="outline" onClick={showSolution} disabled={!currentPuzzle || isSolved}>
                    <Eye className="mr-2 h-4 w-4" />
                    Show
                  </Button>
                  <Button type="button" variant="outline" onClick={resetCurrentPuzzle} disabled={!currentPuzzle || isLoading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                  <Button type="button" onClick={() => loadPuzzle()} disabled={!trainingConfig || isLoading}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="aurora-subtle">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <Trophy className="h-5 w-5" />
                  Targeting
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-sky-700 dark:text-sky-300">Category</span>
                  <span className="font-medium text-slate-900 dark:text-white">{selectedCategory ? puzzleService.getCategoryLabel(selectedCategory) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sky-700 dark:text-sky-300">Lichess theme</span>
                  <span className="font-medium text-slate-900 dark:text-white">{trainingConfig?.angle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sky-700 dark:text-sky-300">Level</span>
                  <span className="font-medium capitalize text-slate-900 dark:text-white">{trainingConfig?.difficulty}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default PuzzleTrainer;
