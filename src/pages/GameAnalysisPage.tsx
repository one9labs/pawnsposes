import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Clock3, Plus, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import ReportDisplay from '../components/ReportDisplay';
import { reportService } from '../services/reportService';
import { ChessReport, GameReportRequest, ReportGenerationProgress } from '../types/report';
import { useAuth } from '../contexts/AuthContext';

const GameAnalysisPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<ReportGenerationProgress | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisReport, setAnalysisReport] = useState<ChessReport | null>(null);
  const [savedReports, setSavedReports] = useState<ChessReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ChessReport | null>(null);

  const storageKey = useMemo(() => {
    return `opponent-analysis-reports-${currentUser?.id || 'guest'}`;
  }, [currentUser?.id]);

  const reviveReport = (report: ChessReport): ChessReport => ({
    ...report,
    generatedAt: report.generatedAt instanceof Date ? report.generatedAt : new Date(report.generatedAt),
  });

  useEffect(() => {
    const storedReports = localStorage.getItem(storageKey);

    if (!storedReports) {
      setSavedReports([]);
      return;
    }

    try {
      const parsedReports = JSON.parse(storedReports) as ChessReport[];
      const revivedReports = parsedReports.map(reviveReport).sort(
        (left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime()
      );

      setSavedReports(revivedReports);
      setSelectedReport(revivedReports[0] || null);
    } catch (parseError) {
      console.error('Failed to load saved opponent reports:', parseError);
      setSavedReports([]);
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(savedReports));
  }, [savedReports, storageKey]);

  const handleStartAnalysis = async (request: GameReportRequest) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress(null);
    reportService.setProgressCallback(setAnalysisProgress);

    try {
      const report = await reportService.generateReport(request);
      const normalizedReport = reviveReport(report);
      setAnalysisReport(normalizedReport);
      setSelectedReport(normalizedReport);
      setSavedReports((previousReports) => {
        const reportKey = `${normalizedReport.platform}:${normalizedReport.username.trim().toLowerCase()}`;
        const remainingReports = previousReports.filter(
          (existingReport) => `${existingReport.platform}:${existingReport.username.trim().toLowerCase()}` !== reportKey
        );

        return [normalizedReport, ...remainingReports].sort(
          (left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime()
        );
      });
      setIsPopupOpen(false);
    } catch (reportError) {
      setAnalysisError(reportError instanceof Error ? reportError.message : 'Could not analyze opponent.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Analyze Opponents</h1>
        <p className="mt-2 text-gray-600">
          Open the analyzer, enter a username, and revisit every opponent report you have saved.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setAnalysisError(null);
            setAnalysisProgress(null);
            setIsPopupOpen(true);
          }}
          className="group flex min-h-[200px] flex-col justify-between rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-sky-400 hover:shadow-xl"
        >
          <div>
            <div className="mb-4 inline-flex rounded-2xl bg-sky-50 p-3 text-sky-700 transition group-hover:bg-sky-100">
              <Plus className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900">Analyze Opponents</h2>
            <p className="mt-2 max-w-sm text-sm text-slate-600">
              Click to open the form, choose a platform, enter a username, and generate an opponent report.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
            Open analysis form
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </div>
        </button>

        {savedReports.map((report) => {
          const isSelected = selectedReport?.id === report.id;

          return (
            <button
              key={report.id}
              type="button"
              onClick={() => setSelectedReport(report)}
              className={`group flex min-h-[200px] flex-col justify-between rounded-3xl border bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${
                isSelected
                  ? 'border-emerald-400 ring-2 ring-emerald-200'
                  : 'border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div>
                <div className="mb-4 inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700 transition group-hover:bg-emerald-100">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">{report.username}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {report.platform} · {report.gameCount} games analyzed
                </p>
                <div className="mt-4 grid gap-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    Win rate: <span className="font-semibold text-slate-900">{report.executiveSummary.winRate}%</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    Accuracy: <span className="font-semibold text-slate-900">{report.executiveSummary.averageAccuracy}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                Open full report
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </div>
            </button>
          );
        })}
      </div>

      {selectedReport ? (
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Saved opponent report</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {selectedReport.username} on {selectedReport.platform}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock3 className="h-4 w-4" />
              {selectedReport.generatedAt.toLocaleDateString()}
            </div>
          </div>
          <ReportDisplay
            report={selectedReport}
            onBack={() => setSelectedReport(null)}
          />
        </div>
      ) : analysisReport ? (
        <Card className="mt-8 border-emerald-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Latest opponent analysis
            </CardTitle>
            <CardDescription>
              {analysisReport.username} on {analysisReport.platform} · {analysisReport.gameCount} games analyzed
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Win rate</div>
              <div className="text-2xl font-bold text-slate-900">{analysisReport.executiveSummary.winRate}%</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Average accuracy</div>
              <div className="text-2xl font-bold text-slate-900">{analysisReport.executiveSummary.averageAccuracy}%</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Key insight</div>
              <div className="text-sm font-medium text-slate-900">
                {analysisReport.executiveSummary.keyInsights[0] || 'Analysis completed successfully.'}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default GameAnalysisPage;