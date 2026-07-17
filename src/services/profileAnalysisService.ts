import { gameImportService } from './gameImport';
import { reportService } from './reportService';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ChessGame } from '../types/game';
import { GameReportRequest, ReportGenerationProgress } from '../types/report';
import { PlayerAnalysisProfile, ProfileRefreshResult } from '../types/profileAnalysis';

const DEFAULT_GAME_LIMIT = 20;
/** How many recent games to fetch on a normal Refresh (incremental sync). */
const SYNC_BATCH_SIZE = 50;
/** Soft cap so Firestore / localStorage stay healthy. */
const MAX_STORED_GAMES = 2000;
/** Hard cap enforced by gameImportService when allGames is false. */
const MAX_IMPORT_COUNT = 500;

class ProfileAnalysisService {
  private storageKey(userId: string) {
    return `player-analysis-profile-${userId}`;
  }

  private firestoreRef(userId: string) {
    return doc(db, 'users', userId, 'analysis', 'profile');
  }

  private chessAccountRef(platform: 'lichess' | 'chess.com', username: string) {
    const key = `${platform}_${username.trim().toLowerCase()}`.replace(/[^a-z0-9_.-]/g, '_');
    return doc(db, 'chessAccounts', key);
  }

  private toFirestoreData(profile: PlayerAnalysisProfile) {
    return JSON.parse(JSON.stringify(profile));
  }

  private reviveProfile(profile: PlayerAnalysisProfile): PlayerAnalysisProfile {
    return {
      ...profile,
      report: profile.report ? {
        ...profile.report,
        generatedAt: new Date(profile.report.generatedAt)
      } : null
    };
  }

  getProfile(userId?: string): PlayerAnalysisProfile | null {
    if (!userId) return null;

    const rawProfile = localStorage.getItem(this.storageKey(userId));
    if (!rawProfile) return null;

    try {
      return this.reviveProfile(JSON.parse(rawProfile));
    } catch (error) {
      console.error('Error loading player analysis profile:', error);
      return null;
    }
  }

  async loadProfile(userId?: string): Promise<PlayerAnalysisProfile | null> {
    if (!userId) return null;

    try {
      const snapshot = await getDoc(this.firestoreRef(userId));
      if (snapshot.exists()) {
        const profile = this.reviveProfile(snapshot.data() as PlayerAnalysisProfile);
        localStorage.setItem(this.storageKey(userId), JSON.stringify(profile));
        return profile;
      }
    } catch (error) {
      console.error('Error loading player analysis profile from Firestore:', error);
    }

    return this.getProfile(userId);
  }

  async saveProfile(profile: PlayerAnalysisProfile) {
    localStorage.setItem(this.storageKey(profile.userId), JSON.stringify(profile));

    try {
      await setDoc(this.firestoreRef(profile.userId), this.toFirestoreData(profile), { merge: true });
      await setDoc(this.chessAccountRef(profile.platform, profile.username), {
        userId: profile.userId,
        platform: profile.platform,
        username: profile.username,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving player analysis profile to Firestore:', error);
    }
  }

  async isChessAccountTaken(platform: 'lichess' | 'chess.com', username: string): Promise<boolean> {
    try {
      const snapshot = await getDoc(this.chessAccountRef(platform, username));
      return snapshot.exists();
    } catch (error) {
      console.error('Error checking chess account ownership:', error);
      return false;
    }
  }

  setProgressCallback(callback: (progress: ReportGenerationProgress) => void) {
    reportService.setProgressCallback(callback);
  }

  /**
   * First-time profile setup (registration / connect account).
   * Can optionally pull full history, then optionally generate a report.
   */
  async setupProfile(
    request: GameReportRequest & { userId: string; generateReport?: boolean }
  ): Promise<ProfileRefreshResult> {
    const profile: PlayerAnalysisProfile = {
      userId: request.userId,
      platform: request.platform,
      username: request.username,
      gameLimit: request.gameCount || DEFAULT_GAME_LIMIT,
      rated: request.rated,
      games: [],
      analyzedGameIds: [],
      report: null,
      lastCheckedAt: null,
      lastAnalyzedAt: null
    };

    await this.saveProfile(profile);

    const synced = await this.syncProfileGames(request.userId, {
      allGames: request.allGames,
      replaceExisting: true,
    });

    if (request.generateReport === false) {
      return synced;
    }

    return this.generateProfileReport(request.userId, {
      gameCount: request.gameCount || DEFAULT_GAME_LIMIT,
      rated: request.rated,
    });
  }

  /**
   * Dashboard "Refresh profile": pull only recent/new games. Never generates a report.
   */
  async refreshProfile(userId: string): Promise<ProfileRefreshResult> {
    return this.syncProfileGames(userId);
  }

  /**
   * Incremental (or full) game sync without touching the report.
   */
  async syncProfileGames(
    userId: string,
    options?: { allGames?: boolean; replaceExisting?: boolean }
  ): Promise<ProfileRefreshResult> {
    const profile = await this.loadProfile(userId);
    if (!profile) {
      throw new Error('Please add your chess username first.');
    }

    const importCount = Math.min(
      MAX_IMPORT_COUNT,
      Math.max(SYNC_BATCH_SIZE, Math.min(profile.gameLimit || SYNC_BATCH_SIZE, MAX_IMPORT_COUNT))
    );

    const latestGames = await gameImportService.importGames({
      platform: profile.platform,
      username: profile.username,
      count: options?.allGames ? undefined : importCount,
      rated: profile.rated,
      allGames: Boolean(options?.allGames),
    });

    const knownGameIds = new Set([
      ...profile.games.map((game) => game.id),
      ...profile.analyzedGameIds,
    ]);
    const newGames = latestGames.games.filter((game) => !knownGameIds.has(game.id));

    const mergedGames = options?.replaceExisting
      ? this.mergeGames([], latestGames.games, MAX_STORED_GAMES)
      : this.mergeGames(profile.games, latestGames.games, MAX_STORED_GAMES);

    const nextProfile: PlayerAnalysisProfile = {
      ...profile,
      games: mergedGames,
      lastCheckedAt: new Date().toISOString(),
    };

    await this.saveProfile(nextProfile);

    return {
      profile: nextProfile,
      newGamesCount: options?.replaceExisting ? latestGames.games.length : newGames.length,
      reusedCache: !options?.replaceExisting && newGames.length === 0,
    };
  }

  /**
   * Manual report generation only — uses games already on the profile
   * (optionally after a light incremental sync first).
   */
  async generateProfileReport(
    userId: string,
    request?: Partial<Pick<GameReportRequest, 'gameCount' | 'rated'>>
  ): Promise<ProfileRefreshResult> {
    // Pick up any brand-new games before analyzing, without re-pulling full history.
    const synced = await this.syncProfileGames(userId);
    const profile = synced.profile;

    const gameCount = Math.max(
      1,
      Math.min(request?.gameCount || profile.gameLimit || DEFAULT_GAME_LIMIT, profile.games.length || DEFAULT_GAME_LIMIT)
    );

    const gamesToAnalyze = profile.games.slice(0, gameCount);
    if (gamesToAnalyze.length === 0) {
      throw new Error('No games available to analyze. Refresh your profile first.');
    }

    const report = await reportService.generateReportFromGamesWithUnifiedPrompts(
      {
        platform: profile.platform,
        username: profile.username,
        gameCount: gamesToAnalyze.length,
        rated: request?.rated ?? profile.rated,
      },
      gamesToAnalyze
    );

    const analyzedIds = new Set([
      ...profile.analyzedGameIds,
      ...gamesToAnalyze.map((game) => game.id),
    ]);

    const analyzedProfile: PlayerAnalysisProfile = {
      ...profile,
      gameLimit: request?.gameCount || profile.gameLimit || DEFAULT_GAME_LIMIT,
      rated: request?.rated ?? profile.rated,
      report: {
        ...report,
        userId,
      },
      analyzedGameIds: Array.from(analyzedIds),
      lastAnalyzedAt: new Date().toISOString(),
    };

    await this.saveProfile(analyzedProfile);

    return {
      profile: analyzedProfile,
      newGamesCount: synced.newGamesCount,
      reusedCache: false,
    };
  }

  private mergeGames(existingGames: ChessGame[], incomingGames: ChessGame[], maxGames: number): ChessGame[] {
    const gamesById = new Map<string, ChessGame>();

    // Incoming first so refreshed metadata wins.
    [...incomingGames, ...existingGames].forEach((game) => {
      if (!gamesById.has(game.id)) {
        gamesById.set(game.id, game);
      }
    });

    return Array.from(gamesById.values())
      .sort((a, b) => this.gameTimestamp(b) - this.gameTimestamp(a))
      .slice(0, maxGames);
  }

  private gameTimestamp(game: ChessGame): number {
    const normalized = game.date?.includes('.') ? game.date.replace(/\./g, '-') : game.date;
    const parsed = Date.parse(normalized || '');
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}

export const profileAnalysisService = new ProfileAnalysisService();
