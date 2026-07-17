import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Download, FileText, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from './ui/Button';
import { ChessReport, GameReportRequest, ReportGenerationProgress } from '../types/report';
import { reportService } from '../services/reportService';
import ReportDisplay from './ReportDisplay';

interface ReportPopupProps {
  isOpen: boolean;
  onClose: () => void;
  report: ChessReport | null;
  initialPlatform: 'lichess' | 'chess.com';
  initialUsername: string;
  onSaveAndAnalyze: (request: GameReportRequest) => Promise<void>;
  isRefreshing: boolean;
  progress: ReportGenerationProgress | null;
  message: string | null;
  error: string | null;
}

const ReportPopup: React.FC<ReportPopupProps> = ({
  isOpen,
  onClose,
  report,
  initialPlatform,
  initialUsername,
  onSaveAndAnalyze,
  isRefreshing,
  progress,
  message,
  error,
}) => {
  const hiddenReportRef = useRef<HTMLDivElement>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('chess-report.pdf');
  const [isBuildingPdf, setIsBuildingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'viewer' | 'form'>('viewer');
  const [formData, setFormData] = useState<GameReportRequest>({
    platform: initialPlatform,
    username: initialUsername,
    gameCount: report?.gameCount || 20,
    rated: undefined,
  });
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPdfUrl(null);
      setPdfFilename('chess-report.pdf');
      setPdfError(null);
      setIsBuildingPdf(false);
      setViewMode('viewer');
      setValidationResult(null);
      setIsValidating(false);
      return;
    }

    if (!report) {
      setPdfUrl(null);
      setPdfFilename('chess-report.pdf');
      setPdfError(null);
      setIsBuildingPdf(false);
      setViewMode('form');
      setFormData({
        platform: initialPlatform,
        username: initialUsername,
        gameCount: 20,
        rated: undefined,
      });
      setValidationResult(null);
      setIsValidating(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfUrl(null);
    setPdfFilename('chess-report.pdf');
    setPdfError(null);
    setIsBuildingPdf(true);
    setViewMode('viewer');
    setFormData({
      platform: report.platform,
      username: report.username,
      gameCount: report.gameCount,
      rated: undefined,
    });
    const timer = window.setTimeout(async () => {
      const captureElement = hiddenReportRef.current;
      if (!captureElement) {
        if (!cancelled) {
          setPdfError('The report preview is still loading. Try opening the viewer again.');
          setIsBuildingPdf(false);
        }
        return;
      }

      try {
        const result = await reportService.generateReportPdfBlob(captureElement, report);
        if (cancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(result.blob);
        setPdfUrl(objectUrl);
        setPdfFilename(result.filename);
      } catch (generationError) {
        if (!cancelled) {
          setPdfError(generationError instanceof Error ? generationError.message : 'Failed to generate the PDF viewer.');
        }
      } finally {
        if (!cancelled) {
          setIsBuildingPdf(false);
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isOpen, report, initialPlatform, initialUsername]);

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

  const previewTitle = useMemo(() => {
    if (viewMode === 'form') {
      return 'Create Your Report';
    }

    if (report) {
      return `PDF Viewer for ${report.username}`;
    }

    return 'Create Your Report';
  }, [report, viewMode]);

  const openNewReportForm = () => {
    setPdfUrl(null);
    setPdfFilename('chess-report.pdf');
    setPdfError(null);
    setIsBuildingPdf(false);
    setViewMode('form');
  };

  const showViewer = viewMode === 'viewer' && !!report;

  const handleFormChange = (field: keyof GameReportRequest, value: GameReportRequest[keyof GameReportRequest]) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
    setValidationResult(null);
    setPdfError(null);
  };

  const validateUsername = async () => {
    if (!formData.username) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const isValid = await reportService.validateUserExists(formData.platform, formData.username);
      setValidationResult(isValid);
      if (!isValid) {
        setPdfError(`User "${formData.username}" not found on ${formData.platform}`);
      }
    } catch (validationError) {
      console.error('Username validation error:', validationError);
      setPdfError('Failed to validate username');
    } finally {
      setIsValidating(false);
    }
  };

  const generateReport = async () => {
    if (!formData.username || formData.gameCount < 1 || formData.gameCount > 100) {
      setPdfError('Please enter a valid username and game count (1-100)');
      return;
    }

    await onSaveAndAnalyze(formData);
  };

  const estimatedTime = reportService.estimateGenerationTime(formData.gameCount);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-[96vw] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              <Sparkles className="h-4 w-4" />
              Special Viewer
            </div>
            <h2 className="mt-1 truncate text-xl font-extrabold text-slate-900 sm:text-2xl">{previewTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {viewMode === 'form'
                ? 'Generate a fresh report from this popup.'
                : 'Your generated report is rendered here as a PDF preview.'}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {showViewer && pdfUrl && (
              <a
                href={pdfUrl}
                download={pdfFilename}
                className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            )}

            {report && (
              <button
                type="button"
                onClick={openNewReportForm}
                className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
              >
                <FileText className="mr-2 h-4 w-4" />
                Generate new report
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close report popup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {viewMode === 'form' || !report ? (
            <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
                Report Setup
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  Enter your chess account details. The popup will stay open and switch to the PDF viewer as soon as the report is ready.
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Chess Platform
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="platform"
                        value="lichess"
                        checked={formData.platform === 'lichess'}
                        onChange={(e) => handleFormChange('platform', e.target.value as 'lichess' | 'chess.com')}
                        className="mr-2"
                        disabled={isRefreshing}
                      />
                      <span className="text-sm">Lichess</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="platform"
                        value="chess.com"
                        checked={formData.platform === 'chess.com'}
                        onChange={(e) => handleFormChange('platform', e.target.value as 'lichess' | 'chess.com')}
                        className="mr-2"
                        disabled={isRefreshing}
                      />
                      <span className="text-sm">Chess.com</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr]">
                  <input
                    value={formData.username}
                    onChange={(event) => handleFormChange('username', event.target.value)}
                    placeholder="Enter your username"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    disabled={isRefreshing}
                  />

                  <button
                    type="button"
                    onClick={validateUsername}
                    disabled={!formData.username || isValidating || isRefreshing}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {isValidating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Validate
                  </button>
                </div>

                {validationResult !== null && (
                  <div className={`rounded-2xl px-4 py-3 text-sm ${validationResult ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {validationResult ? `User found on ${formData.platform}` : `User not found on ${formData.platform}`}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Number of Games to Analyze
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.gameCount}
                    onChange={(event) => handleFormChange('gameCount', parseInt(event.target.value, 10) || 1)}
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    disabled={isRefreshing}
                  />
                  <p className="mt-1 text-sm text-gray-500">Recommended: 20-50 games for comprehensive analysis</p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Game Type
                  </label>
                  <select
                    value={formData.rated === undefined ? 'all' : formData.rated ? 'rated' : 'unrated'}
                    onChange={(event) => {
                      const value = event.target.value;
                      handleFormChange('rated', value === 'all' ? undefined : value === 'rated');
                    }}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    disabled={isRefreshing}
                  >
                    <option value="all">All Games</option>
                    <option value="rated">Rated Games Only</option>
                    <option value="unrated">Unrated Games Only</option>
                  </select>
                </div>

                <div className="rounded-2xl bg-primary-50 p-3 text-sm text-primary-700">
                  <strong>Estimated Generation Time:</strong> {Math.ceil(estimatedTime / 60)} minutes
                </div>

                <Button
                  type="button"
                  onClick={generateReport}
                  disabled={isRefreshing || !formData.username.trim() || validationResult === false}
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Generate Report
                </Button>

                {progress && (
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <span>{progress.message}</span>
                      <span>{progress.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-emerald-600 transition-all" style={{ width: `${progress.progress}%` }} />
                    </div>
                  </div>
                )}

                {message && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
                {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
              </div>
            </div>
          ) : (
            <div className="mx-auto overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  PDF Preview
                </div>
                <div className="text-xs font-medium text-slate-500">{pdfFilename}</div>
              </div>

              <div className="bg-slate-100 p-3">
                {isBuildingPdf && (
                  <div className="flex min-h-[75vh] items-center justify-center rounded-2xl bg-white">
                    <div className="text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
                      <p className="mt-3 text-sm font-medium text-slate-700">Building the PDF viewer...</p>
                    </div>
                  </div>
                )}

                {pdfError && (
                  <div className="flex min-h-[75vh] items-center justify-center rounded-2xl bg-white p-6 text-center">
                    <div>
                      <p className="text-base font-semibold text-slate-900">Viewer error</p>
                      <p className="mt-2 text-sm text-slate-600">{pdfError}</p>
                    </div>
                  </div>
                )}

                {pdfUrl && !isBuildingPdf && !pdfError && (
                  <iframe
                    title="Chess report PDF viewer"
                    src={pdfUrl}
                    className="h-[78vh] w-full rounded-2xl border border-slate-200 bg-white"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {report && (
          <div className="pointer-events-none absolute -left-[10000px] top-0 w-[1120px] bg-white">
            <div ref={hiddenReportRef}>
              <ReportDisplay report={report} onBack={() => undefined} />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ReportPopup;