import { ChessGame } from './game';
import { ChessReport } from './report';

export interface PlayerAnalysisProfile {
  userId: string;
  platform: 'lichess' | 'chess.com';
  username: string;
  /** Max games to keep/sync. Use a large value when `syncAllGames` is true. */
  gameLimit: number;
  /** When true, syncs the player's full game history from the chess API. */
  syncAllGames?: boolean;
  rated?: boolean;
  games: ChessGame[];
  analyzedGameIds: string[];
  report: ChessReport | null;
  lastCheckedAt: string | null;
  lastAnalyzedAt: string | null;
}

export interface ProfileRefreshResult {
  profile: PlayerAnalysisProfile;
  newGamesCount: number;
  reusedCache: boolean;
}
