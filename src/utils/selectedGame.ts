import { ChessGame } from '../types/game';

export const SELECTED_GAME_STORAGE_KEY = 'pawnsposes-selected-game';

export function persistSelectedGame(game: ChessGame) {
  sessionStorage.setItem(SELECTED_GAME_STORAGE_KEY, JSON.stringify(game));
}

export function loadSelectedGame(gameId?: string): ChessGame | null {
  try {
    const raw = sessionStorage.getItem(SELECTED_GAME_STORAGE_KEY);
    if (!raw) return null;
    const game = JSON.parse(raw) as ChessGame;
    if (gameId && game.id !== gameId) return null;
    return game;
  } catch {
    return null;
  }
}
