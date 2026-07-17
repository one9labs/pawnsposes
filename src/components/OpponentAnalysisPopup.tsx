import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Target, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { Alert, AlertDescription } from './ui/Alert';
import { GameReportRequest, ReportGenerationProgress } from '../types/report';
import { reportService } from '../services/reportService';

interface OpponentAnalysisPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyze: (request: GameReportRequest) => Promise<void>;
  isAnalyzing: boolean;
  progress: ReportGenerationProgress | null;
  error: string | null;
}

const OpponentAnalysisPopup: React.FC<OpponentAnalysisPopupProps> = ({
  isOpen,
  onClose,
  onAnalyze,
  isAnalyzing,
  progress,
  error,
}) => {
  const [platform, setPlatform] = useState<'lichess' | 'chess.com'>('lichess');
  const [username, setUsername] = useState('');
  const [gameCount, setGameCount] = useState(20);
  const [ratedFilter, setRatedFilter] = useState<'all' | 'rated' | 'unrated'>('all');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFormError(null);
    setUsername('');
    setPlatform('lichess');
    setGameCount(20);
    setRatedFilter('all');
  }, [isOpen]);

  const estimatedTime = useMemo(() => reportService.estimateGenerationTime(gameCount), [gameCount]);

  const handleSubmit = async () => {
    if (!username.trim()) {
      setFormError('Please enter a username.');
      return;
    }

    if (gameCount < 1 || gameCount > 100) {
      setFormError('Please choose between 1 and 100 games.');
      return;
    }

    setFormError(null);

    await onAnalyze({
      platform,
      username: username.trim(),
      gameCount,
      rated: ratedFilter === 'all' ? undefined : ratedFilter === 'rated',
    });
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-primary-50 via-white to-emerald-50 px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-700">
              <Sparkles className="h-4 w-4" />
              Analyze Opponents
            </div>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Opponent analysis popup</h2>
            <p className="mt-1 text-sm text-slate-600">
              Enter a Chess.com or Lichess username, choose the games you want to pull, and generate an analysis.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close opponent analysis popup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto bg-slate-50 p-4 sm:p-6">
          <Card className="mx-auto max-w-2xl shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Analyze an opponent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="platform">Platform</Label>
                <Select
                  id="platform"
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value as 'lichess' | 'chess.com')}
                >
                  <option value="lichess">Lichess</option>
                  <option value="chess.com">Chess.com</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={platform === 'lichess' ? 'Enter a Lichess username' : 'Enter a Chess.com username'}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="game-count">Games to analyze</Label>
                  <Input
                    id="game-count"
                    type="number"
                    min="1"
                    max="100"
                    value={gameCount}
                    onChange={(event) => setGameCount(parseInt(event.target.value, 10) || 20)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rated-filter">Game filter</Label>
                  <Select
                    id="rated-filter"
                    value={ratedFilter}
                    onChange={(event) => setRatedFilter(event.target.value as 'all' | 'rated' | 'unrated')}
                  >
                    <option value="all">All games</option>
                    <option value="rated">Rated only</option>
                    <option value="unrated">Unrated only</option>
                  </Select>
                </div>
              </div>

              {(formError || error) && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {formError || error}
                  </AlertDescription>
                </Alert>
              )}

              {progress && isAnalyzing && (
                <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium text-primary-900">
                    <span>{progress.message}</span>
                    <span>{progress.progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-primary-100">
                    <div
                      className="h-full rounded-full bg-primary-600 transition-all"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  What happens next
                </div>
                <div>We fetch the selected games, run the analysis, and return a summary report for that opponent.</div>
                <div className="mt-2 text-emerald-700">Estimated time: about {estimatedTime} seconds.</div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button onClick={handleSubmit} disabled={isAnalyzing} className="flex-1">
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    'Analyze Opponent'
                  )}
                </Button>
                <Button onClick={onClose} variant="outline" disabled={isAnalyzing}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OpponentAnalysisPopup;