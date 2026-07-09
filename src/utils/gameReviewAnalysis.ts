import { Chess, Move } from 'chess.js';
import { ChessGame } from '../types/game';
import { stockfishService, STOCKFISH_DEPTH } from '../services/stockfishService';

export type ReviewClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface ReviewMove {
  index: number;
  moveNumber: number;
  san: string;
  color: 'w' | 'b';
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  evaluation: number;
  evalBefore: number;
  centipawnLoss: number;
  classification: ReviewClassification;
  glyph: string;
  clock?: string;
  isCapture: boolean;
  isCheck: boolean;
  bestMoveUci?: string | null;
  bestMoveFrom?: string;
  bestMoveTo?: string;
}

export interface ReviewAnalysis {
  moves: ReviewMove[];
  evalSeries: number[];
  whiteAccuracy: number;
  blackAccuracy: number;
  whitePerformance: number;
  blackPerformance: number;
  counts: {
    white: Record<ReviewClassification, number>;
    black: Record<ReviewClassification, number>;
  };
  phaseAccuracy: {
    opening: { white: number; black: number };
    middlegame: { white: number; black: number };
    endgame: { white: number; black: number };
  };
  engine: 'stockfish';
  depth: number;
}

export type ReviewProgress = {
  currentMove: number;
  totalMoves: number;
  progress: number;
  message: string;
};

const emptyCounts = (): Record<ReviewClassification, number> => ({
  brilliant: 0,
  great: 0,
  best: 0,
  good: 0,
  book: 0,
  inaccuracy: 0,
  mistake: 0,
  blunder: 0,
});

export const classificationMeta: Record<
  ReviewClassification,
  { label: string; color: string; glyph: string }
> = {
  brilliant: { label: 'Genius', color: '#a855f7', glyph: '!!' },
  great: { label: 'Smart', color: '#38bdf8', glyph: '!' },
  best: { label: 'Best', color: '#16a34a', glyph: '' },
  good: { label: 'Good', color: '#86efac', glyph: '' },
  book: { label: 'Book', color: '#a16207', glyph: '' },
  inaccuracy: { label: 'Inaccuracy', color: '#eab308', glyph: '?!' },
  mistake: { label: 'Mistake', color: '#f97316', glyph: '?' },
  blunder: { label: 'Blunder', color: '#ef4444', glyph: '??' },
};

function classifyLoss(
  loss: number,
  moveIndex: number,
  playedUci: string,
  bestMoveUci: string | null,
  isCapture: boolean,
  isCheck: boolean
): ReviewClassification {
  const isBest = Boolean(bestMoveUci && playedUci === bestMoveUci);

  if (moveIndex < 12 && loss <= 20) return 'book';
  if (isBest || loss <= 10) {
    if (loss <= 5 && isCapture && isCheck) return 'brilliant';
    if (loss <= 8 && isCheck) return 'great';
    return 'best';
  }
  if (loss <= 25) return 'good';
  if (loss <= 60) return 'inaccuracy';
  if (loss <= 150) return 'mistake';
  return 'blunder';
}

function accuracyFromLoss(loss: number): number {
  return Math.max(0, Math.min(100, 100 - loss * 0.55));
}

function parseClocksFromPgn(pgn: string): string[] {
  const clocks: string[] = [];
  const regex = /\[%clk\s+([0-9:.]+)\]/g;
  let match;
  while ((match = regex.exec(pgn)) !== null) {
    clocks.push(match[1]);
  }
  return clocks;
}

function formatClock(raw?: string): string | undefined {
  if (!raw) return undefined;
  const parts = raw.split(':').map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}`;
    return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
  }
  return raw;
}

function phaseForMove(moveIndex: number, totalMoves: number): 'opening' | 'middlegame' | 'endgame' {
  if (moveIndex < Math.min(20, Math.floor(totalMoves * 0.3))) return 'opening';
  if (moveIndex > Math.max(totalMoves - 20, Math.floor(totalMoves * 0.7))) return 'endgame';
  return 'middlegame';
}

function parseUciSquares(uci?: string | null): { from?: string; to?: string } {
  if (!uci || uci.length < 4) return {};
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
  };
}

export async function analyzeGameForReview(
  game: ChessGame,
  options?: {
    depth?: number;
    onProgress?: (progress: ReviewProgress) => void;
    signal?: AbortSignal;
  }
): Promise<ReviewAnalysis> {
  const depth = options?.depth ?? STOCKFISH_DEPTH;
  const chess = new Chess();

  try {
    chess.loadPgn(game.pgn);
  } catch {
    // Fall through with empty history if PGN is malformed
  }

  const history = chess.history({ verbose: true }) as Move[];
  const clocks = parseClocksFromPgn(game.pgn);

  chess.reset();
  const moves: ReviewMove[] = [];
  const evalSeries: number[] = [];
  const counts = { white: emptyCounts(), black: emptyCounts() };

  const phaseLoss = {
    opening: { white: [] as number[], black: [] as number[] },
    middlegame: { white: [] as number[], black: [] as number[] },
    endgame: { white: [] as number[], black: [] as number[] },
  };

  options?.onProgress?.({
    currentMove: 0,
    totalMoves: history.length,
    progress: 0,
    message: 'Starting Stockfish…',
  });

  await stockfishService.newGame();

  // Evaluate each position once (start + after every move). Best-move for
  // classification comes from the position before the played move.
  let previousEval = 0;
  let previousBestMove: string | null = null;

  for (let index = 0; index <= history.length; index += 1) {
    if (options?.signal?.aborted) {
      throw new Error('Analysis cancelled');
    }

    const fen = chess.fen();
    options?.onProgress?.({
      currentMove: Math.min(index, history.length),
      totalMoves: history.length,
      progress: Math.round((index / Math.max(1, history.length)) * 100),
      message:
        index === 0
          ? 'Stockfish evaluating starting position…'
          : `Analyzing move ${index} of ${history.length} with Stockfish…`,
    });

    const positionEval = await stockfishService.evaluatePosition(fen, depth);
    evalSeries.push(positionEval.evaluation);

    if (index > 0) {
      const move = history[index - 1];
      const isWhite = move.color === 'w';
      let centipawnLoss = 0;
      if (isWhite) {
        centipawnLoss = Math.max(0, previousEval - positionEval.evaluation);
      } else {
        centipawnLoss = Math.max(0, positionEval.evaluation - previousEval);
      }

      const playedUci = `${move.from}${move.to}${move.promotion || ''}`;
      const classification = classifyLoss(
        centipawnLoss,
        index - 1,
        playedUci,
        previousBestMove,
        Boolean(move.captured),
        Boolean(move.san.includes('+') || move.san.includes('#'))
      );
      const bestSquares = parseUciSquares(previousBestMove);

      const reviewMove: ReviewMove = {
        index: index - 1,
        moveNumber: Math.floor((index - 1) / 2) + 1,
        san: move.san,
        color: move.color,
        from: move.from,
        to: move.to,
        fenBefore: move.before,
        fenAfter: fen,
        evaluation: positionEval.evaluation,
        evalBefore: previousEval,
        centipawnLoss,
        classification,
        glyph: classificationMeta[classification].glyph,
        clock: formatClock(clocks[index - 1]),
        isCapture: Boolean(move.captured),
        isCheck: Boolean(move.san.includes('+') || move.san.includes('#')),
        bestMoveUci: previousBestMove,
        bestMoveFrom: bestSquares.from,
        bestMoveTo: bestSquares.to,
      };

      moves.push(reviewMove);
      if (isWhite) counts.white[classification] += 1;
      else counts.black[classification] += 1;

      const phase = phaseForMove(index - 1, history.length);
      if (isWhite) phaseLoss[phase].white.push(centipawnLoss);
      else phaseLoss[phase].black.push(centipawnLoss);
    }

    previousEval = positionEval.evaluation;
    previousBestMove = positionEval.bestMoveUci;

    if (index < history.length) {
      chess.move(history[index]);
    }
  }

  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  const whiteLosses = moves.filter((m) => m.color === 'w').map((m) => m.centipawnLoss);
  const blackLosses = moves.filter((m) => m.color === 'b').map((m) => m.centipawnLoss);

  const estimatedWhite = Math.round(accuracyFromLoss(avg(whiteLosses)) * 10) / 10;
  const estimatedBlack = Math.round(accuracyFromLoss(avg(blackLosses)) * 10) / 10;

  const whiteAccuracy = game.accuracy?.white ?? estimatedWhite;
  const blackAccuracy = game.accuracy?.black ?? estimatedBlack;

  const whiteRating = game.white.rating || 1200;
  const blackRating = game.black.rating || 1200;
  const whitePerformance = Math.round(whiteRating + (whiteAccuracy - 70) * 8);
  const blackPerformance = Math.round(blackRating + (blackAccuracy - 70) * 8);

  const phaseAccuracy = {
    opening: {
      white: Math.round(accuracyFromLoss(avg(phaseLoss.opening.white))),
      black: Math.round(accuracyFromLoss(avg(phaseLoss.opening.black))),
    },
    middlegame: {
      white: Math.round(accuracyFromLoss(avg(phaseLoss.middlegame.white))),
      black: Math.round(accuracyFromLoss(avg(phaseLoss.middlegame.black))),
    },
    endgame: {
      white: Math.round(accuracyFromLoss(avg(phaseLoss.endgame.white))),
      black: Math.round(accuracyFromLoss(avg(phaseLoss.endgame.black))),
    },
  };

  options?.onProgress?.({
    currentMove: history.length,
    totalMoves: history.length,
    progress: 100,
    message: 'Stockfish analysis complete',
  });

  return {
    moves,
    evalSeries,
    whiteAccuracy,
    blackAccuracy,
    whitePerformance,
    blackPerformance,
    counts,
    phaseAccuracy,
    engine: 'stockfish',
    depth,
  };
}

export function resultLabel(result: ChessGame['result']): string {
  if (result === '1-0') return 'White wins';
  if (result === '0-1') return 'Black wins';
  if (result === '1/2-1/2') return 'Game drawn';
  return 'Game unfinished';
}

export function evalStatusText(evaluation: number): string {
  const pawns = evaluation / 100;
  if (Math.abs(evaluation) >= 90000) {
    return evaluation > 0 ? 'White mating.' : 'Black mating.';
  }
  if (Math.abs(pawns) < 0.4) return 'Equal position';
  if (pawns >= 3) return 'White dominating.';
  if (pawns <= -3) return 'Black dominating.';
  if (pawns >= 1.2) return 'White is better.';
  if (pawns <= -1.2) return 'Black is better.';
  if (pawns > 0) return 'White slightly better.';
  return 'Black slightly better.';
}

export function formatEval(evaluation: number): string {
  if (Math.abs(evaluation) >= 90000) {
    const mateIn = Math.max(1, Math.round((100000 - Math.abs(evaluation)) / 100));
    return evaluation > 0 ? `M${mateIn}` : `-M${mateIn}`;
  }
  const pawns = evaluation / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}
