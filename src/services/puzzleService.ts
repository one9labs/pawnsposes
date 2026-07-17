import { GameAnalysis } from '../types/analysis';
import { ChessGame } from '../types/game';
import {
  LichessPuzzleResponse,
  PuzzleDifficulty,
  PuzzleTrainingCategory,
  PuzzleTrainingConfig,
  TrainerPuzzle,
  WeaknessMiningProgress
} from '../types/puzzle';
import { weaknessPuzzleService } from './weaknessPuzzleService';

const LICHESS_API_BASE = 'https://lichess.org/api';

const CATEGORY_LABELS: Record<PuzzleTrainingCategory, string> = {
  'fix-weakness': 'Fix My Weaknesses',
  'master-opening': 'Master My Openings',
  'master-endgames': 'Master My Endgames'
};

export interface PuzzleSessionContext {
  analysis?: GameAnalysis | null;
  platform?: 'lichess' | 'chess.com';
  username?: string;
  games?: ChessGame[];
  rated?: boolean;
  onWeaknessProgress?: (progress: WeaknessMiningProgress) => void;
  signal?: AbortSignal;
}

class PuzzleService {
  getCategoryLabel(category: PuzzleTrainingCategory): string {
    return CATEGORY_LABELS[category];
  }

  buildTrainingConfig(category: PuzzleTrainingCategory, analysis?: GameAnalysis | null): PuzzleTrainingConfig {
    const averageAccuracy = analysis ? (analysis.whiteAccuracy + analysis.blackAccuracy) / 2 : 70;
    const difficulty = this.getDifficultyForAccuracy(averageAccuracy);

    return {
      category,
      difficulty,
      angle: this.getAngleForCategory(category, analysis)
    };
  }

  async getNextPuzzle(
    config: PuzzleTrainingConfig,
    context: PuzzleSessionContext = {}
  ): Promise<TrainerPuzzle> {
    if (config.category === 'fix-weakness') {
      return this.getWeaknessPuzzle(context);
    }

    const lichessPuzzle = await this.fetchLichessPuzzle(config);
    return this.toTrainerPuzzle(lichessPuzzle);
  }

  private async getWeaknessPuzzle(context: PuzzleSessionContext): Promise<TrainerPuzzle> {
    if (!context.platform || !context.username) {
      throw new Error('Connect and sync a chess account first so we can mine puzzles from your recent games.');
    }

    return weaknessPuzzleService.getNextWeaknessPuzzle({
      platform: context.platform,
      username: context.username,
      games: context.games,
      rated: context.rated,
      onProgress: context.onWeaknessProgress,
      signal: context.signal
    });
  }

  private async fetchLichessPuzzle(config: PuzzleTrainingConfig): Promise<LichessPuzzleResponse> {
    const params = new URLSearchParams({
      angle: config.angle,
      difficulty: config.difficulty
    });

    if (config.color) {
      params.set('color', config.color);
    }

    const response = await fetch(`${LICHESS_API_BASE}/puzzle/next?${params.toString()}`, {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Lichess puzzle rate limit reached. Please wait a minute before requesting more puzzles.');
      }

      throw new Error('Could not load a Lichess puzzle for this training target.');
    }

    return response.json();
  }

  private toTrainerPuzzle(response: LichessPuzzleResponse): TrainerPuzzle {
    return {
      id: response.puzzle.id,
      fen: '',
      solution: response.puzzle.solution,
      rating: response.puzzle.rating,
      themes: response.puzzle.themes,
      lichessPgn: response.game.pgn,
      lichessGameId: response.game.id
    };
  }

  private getDifficultyForAccuracy(accuracy: number): PuzzleDifficulty {
    if (accuracy < 55) return 'easier';
    if (accuracy < 72) return 'normal';
    if (accuracy < 86) return 'harder';
    return 'hardest';
  }

  private getAngleForCategory(category: PuzzleTrainingCategory, analysis?: GameAnalysis | null): string {
    switch (category) {
      case 'fix-weakness':
        return analysis ? 'from your games' : 'your recent games';
      case 'master-opening':
        return 'opening';
      case 'master-endgames':
        return 'endgame';
      default:
        return 'mix';
    }
  }
}

export const puzzleService = new PuzzleService();
