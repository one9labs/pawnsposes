import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Brain, Sparkles, Swords, Trophy } from 'lucide-react';
import PuzzleTrainer from '../components/PuzzleTrainer';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { GameAnalysis } from '../types/analysis';
import { profileAnalysisService } from '../services/profileAnalysisService';

const PuzzlesPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<GameAnalysis[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadAnalysisContext = async () => {
      const savedAnalyses = localStorage.getItem(`chess-analyses-${currentUser?.id}`);
      const profile = await profileAnalysisService.loadProfile(currentUser?.id);

      if (!savedAnalyses) {
        if (isMounted) setAnalyses(profile?.report ? [createAnalysisFromProfileReport(profile.report)] : []);
        return;
      }

      try {
        const parsedAnalyses = JSON.parse(savedAnalyses) as Array<[string, GameAnalysis]>;
        const gameAnalyses = parsedAnalyses.map(([, analysis]) => ({
          ...analysis,
          analyzedAt: new Date(analysis.analyzedAt)
        }));
        if (isMounted) {
          setAnalyses(profile?.report ? [createAnalysisFromProfileReport(profile.report), ...gameAnalyses] : gameAnalyses);
        }
      } catch (error) {
        console.error('Error loading puzzle analysis context:', error);
        if (isMounted) setAnalyses(profile?.report ? [createAnalysisFromProfileReport(profile.report)] : []);
      }
    };

    loadAnalysisContext();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  const latestAnalysis = useMemo(() => {
    return analyses
      .slice()
      .sort((a, b) => b.analyzedAt.getTime() - a.analyzedAt.getTime())[0] || null;
  }, [analyses]);

  return (
    <div className="section-shell space-y-8 py-8">
      <section className="aurora-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">Tactics lab</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-slate-900 sm:text-4xl dark:text-white">Puzzle Trainer</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-700 sm:text-base dark:text-slate-300">
              Train with focused, analysis-aware puzzle sets that feel like a modern coaching workspace.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/analyze')} className="cursor-pointer border-sky-200/80 bg-white/70 text-slate-800 hover:bg-white dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800">
            <BarChart3 className="mr-2 h-4 w-4" />
            Open analysis library
          </Button>
        </div>
      </section>

      <section className="aurora-subtle divide-y divide-sky-200/70 pt-2 dark:divide-slate-700/80">
        {[
          { icon: <Swords className="h-4 w-4" />, title: 'Adaptive training', text: 'Puzzle themes pivot to your latest analysis profile.' },
          { icon: <Sparkles className="h-4 w-4" />, title: 'Session flow', text: 'Hints, resets, and next puzzles are one-click and fast.' },
          { icon: <Trophy className="h-4 w-4" />, title: 'Progress streaks', text: 'Keep momentum with streak and solved tracking.' },
          { icon: <Brain className="h-4 w-4" />, title: 'No lock-in', text: 'Still useful without analysis using general categories.' },
        ].map((item) => (
          <div key={item.title} className="grid gap-2 py-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100/80 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{item.icon}</div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="mr-2 font-semibold text-slate-900 dark:text-white">{item.title}</span>
              {item.text}
            </p>
          </div>
        ))}
      </section>

      {!latestAnalysis && (
        <section className="aurora-subtle flex items-start gap-3 pt-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-600 text-white">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">No analyzed game found yet</h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              You can still train now. Analyze a game later for personalized puzzle recommendations.
            </p>
          </div>
        </section>
      )}

      {latestAnalysis && (
        <section className="aurora-subtle grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3 sm:divide-x sm:divide-sky-200/70 dark:sm:divide-slate-700/80">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Latest analysis</div>
            <div className="mt-1 font-semibold text-slate-900 dark:text-white">{latestAnalysis.openingEvaluation.name}</div>
          </div>
          <div className="sm:pl-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">White accuracy</div>
            <div className="font-display text-2xl font-semibold text-slate-900 dark:text-white">{latestAnalysis.whiteAccuracy}%</div>
          </div>
          <div className="sm:pl-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Black accuracy</div>
            <div className="font-display text-2xl font-semibold text-slate-900 dark:text-white">{latestAnalysis.blackAccuracy}%</div>
          </div>
        </section>
      )}

      <div className="aurora-subtle pt-6">
        <PuzzleTrainer analysis={latestAnalysis} />
      </div>
    </div>
  );
};

export default PuzzlesPage;

const createAnalysisFromProfileReport = (report: any): GameAnalysis => ({
  gameId: report.id,
  moves: [],
  whiteAccuracy: report.executiveSummary.averageAccuracy || 70,
  blackAccuracy: report.executiveSummary.averageAccuracy || 70,
  totalMistakes: {
    white: {
      blunders: report.recurringWeaknesses?.[0]?.frequency || 0,
      mistakes: report.recurringWeaknesses?.[1]?.frequency || 0,
      inaccuracies: report.recurringWeaknesses?.[2]?.frequency || 0
    },
    black: {
      blunders: 0,
      mistakes: 0,
      inaccuracies: 0
    }
  },
  openingEvaluation: {
    name: report.executiveSummary.favoriteOpenings?.[0] || 'Profile analysis',
    eco: '',
    evaluation: 0
  },
  criticalMoments: [],
  analyzedAt: new Date(report.generatedAt),
  engineUsed: 'stockfish',
  depth: 0
});
