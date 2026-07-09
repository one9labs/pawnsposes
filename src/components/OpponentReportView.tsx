import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Target,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { ChessReport } from '../types/report';

interface OpponentReportViewProps {
  report: ChessReport;
  onBack: () => void;
}

const formatDateTime = (value: Date | string) => new Date(value).toLocaleString();

const OpponentReportView: React.FC<OpponentReportViewProps> = ({ report, onBack }) => {
  const topWeaknesses = report.recurringWeaknesses.slice(0, 3);
  const topImmediateActions = report.improvementPlan.immediateActions.slice(0, 3);
  const topWeeklyFocus = report.improvementPlan.weeklyFocus.slice(0, 2);

  return (
    <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              <SparklesMarker />
              Opponent report
            </div>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
              {report.username} on {report.platform}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {report.gameCount} games analyzed · generated {formatDateTime(report.generatedAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to reports
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 px-4 py-5 sm:px-6 sm:py-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
            label="Win rate"
            value={`${report.executiveSummary.winRate}%`}
            tone="bg-emerald-50"
          />
          <MetricCard
            icon={<Target className="h-5 w-5 text-sky-600" />}
            label="Average accuracy"
            value={`${report.executiveSummary.averageAccuracy}%`}
            tone="bg-sky-50"
          />
          <MetricCard
            icon={<Trophy className="h-5 w-5 text-amber-600" />}
            label="Overall rating"
            value={report.executiveSummary.overallRating.toLocaleString()}
            tone="bg-amber-50"
          />
          <MetricCard
            icon={<BookOpen className="h-5 w-5 text-violet-600" />}
            label="Key insights"
            value={report.executiveSummary.keyInsights.length.toString()}
            tone="bg-violet-50"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-emerald-600" />
                Key insights
              </CardTitle>
              <CardDescription>High-signal takeaways from the opponent analysis.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.executiveSummary.keyInsights.map((insight, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-slate-700">{insight}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-sky-600" />
                Report details
              </CardTitle>
              <CardDescription>Quick summary of how the report was generated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <DetailRow label="Platform" value={report.platform} />
              <DetailRow label="Games tracked" value={report.gameCount.toString()} />
              <DetailRow label="Generated" value={formatDateTime(report.generatedAt)} />
              <DetailRow label="Favorite openings" value={report.executiveSummary.favoriteOpenings[0] || 'Various'} />
              <DetailRow label="Time preference" value={report.executiveSummary.timeControlPreference} />
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-rose-600" />
                Recurring weaknesses
              </CardTitle>
              <CardDescription>Patterns that appeared most often in the selected games.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {topWeaknesses.map((weakness, index) => (
                <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {index + 1}. {weakness.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">{weakness.description}</p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                      {weakness.frequency}x
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Suggestion:</span> {weakness.improvementSuggestion}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-violet-600" />
                Game phase snapshot
              </CardTitle>
              <CardDescription>A quick look at middlegame and endgame performance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PhaseCard
                title="Middlegame"
                score={report.middleGameAnalysis.overallRating}
                description={report.middleGameAnalysis.strengths[0] || 'Steady middlegame development'}
                detail={report.middleGameAnalysis.recommendations[0] || 'Keep building tactical and positional depth.'}
              />
              <PhaseCard
                title="Endgame"
                score={report.endgameAnalysis.overallRating}
                description={report.endgameAnalysis.strengths[0] || 'Solid endgame habits'}
                detail={report.endgameAnalysis.recommendations[0] || 'Sharpen endgame technique and conversion.'}
              />
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Improvement plan
              </CardTitle>
              <CardDescription>Immediate actions and short-term focus areas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topImmediateActions.map((action, index) => (
                <div key={index} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${priorityTone(action.priority)}`}>
                      {action.priority}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{action.action}</span>
                    <span className="text-xs text-slate-500">{action.timeframe}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{action.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-sky-600" />
                Next focus
              </CardTitle>
              <CardDescription>Weekly priorities pulled from the report.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              {topWeeklyFocus.map((focus) => (
                <div key={focus.week} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Week {focus.week}</div>
                  <div className="mt-1 font-semibold text-slate-900">{focus.focus}</div>
                  <p className="mt-2 text-slate-600">{focus.goals[0] || 'Use the exercises to reinforce the concept.'}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}> = ({ icon, label, value, tone }) => (
  <Card className={`border-slate-200 shadow-sm ${tone}`}>
    <CardContent className="flex items-start justify-between gap-3 p-5">
      <div>
        <div className="text-sm font-medium text-slate-600">{label}</div>
        <div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div>
      </div>
      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">{icon}</div>
    </CardContent>
  </Card>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
    <span className="font-medium text-slate-500">{label}</span>
    <span className="text-right font-semibold text-slate-900">{value}</span>
  </div>
);

const PhaseCard: React.FC<{
  title: string;
  score: number;
  description: string;
  detail: string;
}> = ({ title, score, description, detail }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <div className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-900 ring-1 ring-slate-200">
        {score}/10
      </div>
    </div>
    <p className="mt-3 text-sm text-slate-600">{detail}</p>
  </div>
);

const priorityTone = (priority: 'high' | 'medium' | 'low') => {
  switch (priority) {
    case 'high':
      return 'bg-rose-100 text-rose-700';
    case 'medium':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-emerald-100 text-emerald-700';
  }
};

const SparklesMarker = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z" />
    <path d="M19 14l.9 2.7L22 17.5l-2.1.8L19 21l-.9-2.7L16 17.5l2.1-.8L19 14z" />
  </svg>
);

export default OpponentReportView;