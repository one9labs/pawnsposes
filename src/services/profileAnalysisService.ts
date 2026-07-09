import { gameImportService } from './gameImport';
import { reportService } from './reportService';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ChessGame } from '../types/game';
import { GameReportRequest, ReportGenerationProgress } from '../types/report';
import { PlayerAnalysisProfile, ProfileRefreshResult } from '../types/profileAnalysis';

const DEFAULT_GAME_LIMIT = 20;
/** Soft ceiling used when syncing full history so merge/storage still has a numeric limit. */
const ALL_GAMES_LIMIT = Number.MAX_SAFE_INTEGER;

class ProfileAnalysisService {
  private storageKey(userId: string) {
    return `player-analysis-profile-${userId}`;
  }

  private resolveGameLimit(request: { gameCount?: number; allGames?: boolean }) {
    if (request.allGames) return ALL_GAMES_LIMIT;
    return request.gameCount || DEFAULT_GAME_LIMIT;
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

  async setupProfile(request: GameReportRequest & { userId: string }): Promise<ProfileRefreshResult> {
    const profile: PlayerAnalysisProfile = {
      userId: request.userId,
      platform: request.platform,
      username: request.username,
      gameLimit: this.resolveGameLimit(request),
      syncAllGames: Boolean(request.allGames),
      rated: request.rated,
      games: [],
      analyzedGameIds: [],
      report: null,
      lastCheckedAt: null,
      lastAnalyzedAt: null
    };

    await this.saveProfile(profile);
    return this.refreshProfile(request.userId);
  }

  async refreshProfile(userId: string): Promise<ProfileRefreshResult> {
    const profile = await this.loadProfile(userId);
    if (!profile) {
      throw new Error('Please add your chess username first.');
    }

    // Always pull full history on refresh (including older profiles that only had a small gameLimit).
    const latestGames = await gameImportService.importGames({
      platform: profile.platform,
      username: profile.username,
      allGames: true,
      rated: profile.rated
    });

    const knownGameIds = new Set([
      ...profile.analyzedGameIds,
      ...profile.games.map(game => game.id)
    ]);
    const newGames = latestGames.games.filter(game => !knownGameIds.has(game.id));

    const nextProfile: PlayerAnalysisProfile = {
      ...profile,
      gameLimit: ALL_GAMES_LIMIT,
      syncAllGames: true,
      games: this.mergeLatestGames(profile.games, latestGames.games, ALL_GAMES_LIMIT),
      lastCheckedAt: new Date().toISOString()
    };

    await this.saveProfile(nextProfile);

    return {
      profile: nextProfile,
      newGamesCount: newGames.length,
      reusedCache: newGames.length === 0
    };
  }

  async generateReportForProfile(request: GameReportRequest & { userId: string }): Promise<ProfileRefreshResult> {
    const existingProfile = await this.loadProfile(request.userId);
    const syncAllGames = Boolean(request.allGames ?? existingProfile?.syncAllGames);
    const gameLimit = this.resolveGameLimit({
      gameCount: request.gameCount,
      allGames: syncAllGames
    });

    const profile: PlayerAnalysisProfile = existingProfile || {
      userId: request.userId,
      platform: request.platform,
      username: request.username,
      gameLimit,
      syncAllGames,
      rated: request.rated,
      games: [],
      analyzedGameIds: [],
      report: null,
      lastCheckedAt: null,
      lastAnalyzedAt: null
    };

    const latestGames = await gameImportService.importGames({
      platform: request.platform,
      username: request.username,
      count: syncAllGames ? undefined : request.gameCount,
      allGames: syncAllGames,
      rated: request.rated
    });

    if (!latestGames.games || latestGames.games.length === 0) {
      throw new Error('No games found for the specified user');
    }

    const report = await reportService.generateReportFromGamesWithUnifiedPrompts(
      {
        platform: request.platform,
        username: request.username,
        gameCount: latestGames.games.length,
        rated: request.rated
      },
      latestGames.games
    );

    const analyzedIds = new Set([
      ...profile.analyzedGameIds,
      ...latestGames.games.map(game => game.id)
    ]);

    const analyzedProfile: PlayerAnalysisProfile = {
      ...profile,
      platform: request.platform,
      username: request.username,
      gameLimit,
      syncAllGames,
      rated: request.rated,
      games: this.mergeLatestGames(profile.games, latestGames.games, gameLimit),
      report: {
        ...report,
        userId: request.userId
      },
      analyzedGameIds: Array.from(analyzedIds),
      lastCheckedAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString()
    };

    await this.saveProfile(analyzedProfile);

    return {
      profile: analyzedProfile,
      newGamesCount: latestGames.games.length,
      reusedCache: false
    };
  }

  private mergeLatestGames(existingGames: ChessGame[], latestGames: ChessGame[], limit: number): ChessGame[] {
    const gamesById = new Map<string, ChessGame>();

    [...latestGames, ...existingGames].forEach(game => {
      if (!gamesById.has(game.id)) {
        gamesById.set(game.id, game);
      }
    });

    const merged = Array.from(gamesById.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return limit >= ALL_GAMES_LIMIT ? merged : merged.slice(0, limit);
  }
}

export const profileAnalysisService = new ProfileAnalysisService();
