import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  CalendarDays,
  ExternalLink,
  Gamepad2,
  Hash,
  Medal,
  TrendingUp, 
  RefreshCw,
  AlertCircle,
  FileText
} from 'lucide-react';
import { profileAnalysisService } from '../services/profileAnalysisService';
import { PlayerAnalysisProfile } from '../types/profileAnalysis';
import { GameReportRequest, ReportGenerationProgress } from '../types/report';
import ReportPopup from '../components/ReportPopup';

const DashboardPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState<PlayerAnalysisProfile | null>(null);
  const [platform, setPlatform] = useState<'lichess' | 'chess.com'>('lichess');
  const [username, setUsername] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<ReportGenerationProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isReportPopupOpen, setIsReportPopupOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    profileAnalysisService.loadProfile(currentUser?.id).then(savedProfile => {
      if (!isMounted) return;
      setProfile(savedProfile);
      if (savedProfile) {
        setPlatform(savedProfile.platform);
        setUsername(savedProfile.username);
      }
      setIsLoadingProfile(false);
    }).catch(loadError => {
      console.error('Error loading dashboard profile:', loadError);
      if (isMounted) {
        setError('Could not load your saved analysis profile.');
        setIsLoadingProfile(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  const report = profile?.report || null;

  const userGames = useMemo(() => profile?.games || [], [profile?.games]);

  const getIsUserWhite = (game: any) => {
    if (!profile?.username) return true;
    return game.white?.name?.trim().toLowerCase() === profile.username.trim().toLowerCase();
  };

  const getUserRating = (game: any) => {
    return getIsUserWhite(game) ? game.white?.rating : game.black?.rating;
  };

  const getOpponentRating = (game: any) => {
    return getIsUserWhite(game) ? game.black?.rating : game.white?.rating;
  };

  const getOpponentName = (game: any) => {
    return getIsUserWhite(game) ? game.black?.name || 'Unknown opponent' : game.white?.name || 'Unknown opponent';
  };

  const getGameResult = (game: any) => {
    if (game.result === '1/2-1/2') return 'Draw';

    const userWhite = getIsUserWhite(game);
    const isWin = (userWhite && game.result === '1-0') || (!userWhite && game.result === '0-1');
    return isWin ? 'Win' : 'Loss';
  };

  const wins = userGames.filter(game => getGameResult(game) === 'Win').length;
  const draws = userGames.filter(game => getGameResult(game) === 'Draw').length;
  const losses = userGames.filter(game => getGameResult(game) === 'Loss').length;
  const ratings = userGames.map(getUserRating).filter((rating): rating is number => typeof rating === 'number');
  const opponentRatings = userGames.map(getOpponentRating).filter((rating): rating is number => typeof rating === 'number');

  const gameStats = {
    wins,
    draws,
    losses,
    latestRating: ratings[0] ?? null,
    peakRating: ratings.length ? Math.max(...ratings) : null,
    averageOpponentRating: opponentRatings.length
      ? Math.round(opponentRatings.reduce((sum, rating) => sum + rating, 0) / opponentRatings.length)
      : null,
    winRate: userGames.length ? Math.round((wins / userGames.length) * 100) : 0,
  };

  const stats = [
    {
      title: 'Games Tracked',
      value: userGames.length.toString(),
      change: profile?.lastCheckedAt ? `Synced ${new Date(profile.lastCheckedAt).toLocaleDateString()}` : 'Add your chess username',
      icon: <Gamepad2 className="w-5 h-5" />,
      color: 'text-blue-600'
    },
    {
      title: 'Latest Rating',
      value: gameStats.latestRating ? gameStats.latestRating.toLocaleString() : '-',
      change: 'From the most recent game',
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-green-600'
    },
    {
      title: 'Peak Rating',
      value: gameStats.peakRating ? gameStats.peakRating.toLocaleString() : '-',
      change: 'Highest rating seen in the synced games',
      icon: <Medal className="w-5 h-5" />,
      color: 'text-orange-600'
    },
    {
      title: 'Average Opponent Rating',
      value: gameStats.averageOpponentRating ? gameStats.averageOpponentRating.toLocaleString() : '-',
      change: 'Pulled directly from the game archives',
      icon: <Hash className="w-5 h-5" />,
      color: 'text-purple-600'
    }
  ];

  const saveAndAnalyze = async (request: GameReportRequest) => {
    if (!currentUser?.id || !request.username.trim()) return;

    setIsRefreshing(true);
    setError(null);
    setMessage(null);
    setProgress(null);
    profileAnalysisService.setProgressCallback(setProgress);

    try {
      const result = await profileAnalysisService.generateReportForProfile({
        userId: currentUser.id,
        platform: request.platform,
        username: request.username.trim(),
        gameCount: request.gameCount,
        rated: request.rated
      });
      setProfile(result.profile);
      setMessage(`Analyzed ${result.newGamesCount} games and saved your profile analysis.`);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Could not set up profile analysis.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshAnalysis = async () => {
    if (!currentUser?.id) return;

    setIsRefreshing(true);
    setError(null);
    setMessage(null);
    setProgress(null);
    profileAnalysisService.setProgressCallback(setProgress);

    try {
      const result = await profileAnalysisService.refreshProfile(currentUser.id);
      setProfile(result.profile);
      setMessage(result.reusedCache
        ? 'No new games found. Your chess profile is already current.'
        : `Synced ${result.newGamesCount} new game${result.newGamesCount === 1 ? '' : 's'} from the chess API.`
      );
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not refresh analysis.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {currentUser?.displayName}!
        </h1>
        <p className="text-gray-600 mt-2">
          Here's your chess profile dashboard
        </p>
      </div>

      {isLoadingProfile && (
        <Card className="mb-8 border-blue-200 bg-blue-50">
          <CardContent className="flex items-center gap-3 p-5 text-blue-900">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <div>
              <p className="font-medium">Loading your chess profile</p>
              <p className="text-sm text-blue-700">We are syncing your latest games from the chess API.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoadingProfile && (
      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Chess Profile</CardTitle>
              <CardDescription>
                {profile
                  ? 'Your saved games and profile stats are synced from the chess API.'
                  : 'Add your chess username to load your latest games and ratings from the chess API.'}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {profile && (
                <Button type="button" variant="outline" onClick={refreshAnalysis} disabled={isRefreshing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
              <Button
                type="button"
                onClick={() => setIsReportPopupOpen(true)}
                disabled={isRefreshing}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                {report ? 'Open PDF Viewer' : 'Open Report Form'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!profile && (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
              Your report form now opens in the popup. Use the green button above to enter your chess account, choose game settings, and fetch your latest games.
            </div>
          )}

          {profile && (
            <div className="flex flex-col gap-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-medium">{profile.username}</span> on {profile.platform}
                <span className="text-gray-500"> | latest {profile.gameLimit} games tracked</span>
              </div>
              <div className="text-gray-500">
                {profile.lastCheckedAt ? `Checked ${new Date(profile.lastCheckedAt).toLocaleString()}` : 'Not checked yet'}
              </div>
            </div>
          )}

          {progress && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{progress.message}</span>
                <span>{progress.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div className="h-2 rounded-full bg-primary-600" style={{ width: `${progress.progress}%` }} />
              </div>
            </div>
          )}

          {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
          {error && (
            <p className="mt-3 flex items-center text-sm text-red-700">
              <AlertCircle className="mr-2 h-4 w-4" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={stat.color}>
                {stat.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <p className="text-xs text-green-600 mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Game Record</CardTitle>
          <CardDescription>
            Wins, draws, and losses pulled directly from your chess game archives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">Wins</p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">{gameStats.wins}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">Draws</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{gameStats.draws}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-sm text-rose-700">Losses</p>
              <p className="mt-1 text-2xl font-bold text-rose-900">{gameStats.losses}</p>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Win rate: <span className="font-semibold text-gray-900">{gameStats.winRate}%</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Previous Games</CardTitle>
          <CardDescription>
            Tiles below are pulled from the chess API and sorted newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userGames.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              Save your chess username to fetch your previous games.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {userGames.map((game: any) => {
                const result = getGameResult(game);
                const opponent = getOpponentName(game);
                const userRating = getUserRating(game);
                const opponentRating = getOpponentRating(game);
                const resultColor = result === 'Win'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : result === 'Loss'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700';

                return (
                  <div key={game.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {game.date}
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-gray-900">vs {opponent}</h3>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${resultColor}`}>
                        {result}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-gray-50 p-3">
                        <p className="text-gray-500">Your rating</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{userRating ? userRating.toLocaleString() : '-'}</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3">
                        <p className="text-gray-500">Opponent rating</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{opponentRating ? opponentRating.toLocaleString() : '-'}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-600">
                      <span>{game.opening?.name || 'Unknown opening'}</span>
                      <span>{game.timeControl || 'Unknown time control'}</span>
                    </div>

                    {game.url && (
                      <a
                        href={game.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center text-sm font-medium text-emerald-700 hover:text-emerald-800"
                      >
                        Open game <ExternalLink className="ml-1 h-4 w-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ReportPopup
        isOpen={isReportPopupOpen}
        onClose={() => setIsReportPopupOpen(false)}
        report={report}
        initialPlatform={platform}
        initialUsername={username}
        onSaveAndAnalyze={saveAndAnalyze}
        isRefreshing={isRefreshing}
        progress={progress}
        message={message}
        error={error}
      />
    </div>
  );
};

export default DashboardPage;
