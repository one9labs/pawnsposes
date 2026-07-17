import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type CachedPdf = {
  blob: Blob;
  filename: string;
  url: string;
};

/** Keep built PDFs across reopen so Download is instant the second time. */
const pdfCache = new Map<string, CachedPdf>();

function reportCacheKey(report: ChessReport): string {
  const generatedAt =
    report.generatedAt instanceof Date
      ? report.generatedAt.toISOString()
      : String(report.generatedAt);
  return `${report.userId || ''}:${report.username}:${report.gameCount}:${generatedAt}`;
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
  const reportRef = useRef<HTMLDivElement>(null);
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
  const [cachedPdfUrl, setCachedPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPdfError(null);
      setIsBuildingPdf(false);
      setViewMode('viewer');
      setValidationResult(null);
      setIsValidating(false);
      setCachedPdfUrl(null);
      return;
    }

    if (!report) {
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
      setCachedPdfUrl(null);
      return;
    }

    // Instant open: show HTML report immediately. PDF is built only on Download.
    setPdfError(null);
    setIsBuildingPdf(false);
    setViewMode('viewer');
    setFormData({
      platform: report.platform,
      username: report.username,
      gameCount: report.gameCount,
      rated: undefined,
    });

    const cached = pdfCache.get(reportCacheKey(report));
    if (cached) {
      setPdfFilename(cached.filename);
      setCachedPdfUrl(cached.url);
    } else {
      setPdfFilename(`${report.username}-chess-report.pdf`);
      setCachedPdfUrl(null);
    }
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
      return `Report for ${report.username}`;
    }

    return 'Create Your Report';
  }, [report, viewMode]);

  const openNewReportForm = () => {
    setPdfError(null);
    setIsBuildingPdf(false);
    setViewMode('form');
  };

  const showViewer = viewMode === 'viewer' && !!report;

  const ensurePdf = useCallback(async (): Promise<CachedPdf> => {
    if (!report) {
      throw new Error('No report available to export.');
    }

    const key = reportCacheKey(report);
    const existing = pdfCache.get(key);
    if (existing) {
      return existing;
    }

    const captureElement = reportRef.current;
    if (!captureElement) {
      throw new Error('The report is still loading. Try again in a moment.');
    }

    const result = await reportService.generateReportPdfBlob(captureElement, report);
    const url = URL.createObjectURL(result.blob);
    const cached: CachedPdf = {
      blob: result.blob,
      filename: result.filename,
      url,
    };
    pdfCache.set(key, cached);
    setPdfFilename(cached.filename);
    setCachedPdfUrl(cached.url);
    return cached;
  }, [report]);

  const handleDownloadPdf = async () => {
    if (!report || isBuildingPdf) return;

    setPdfError(null);
    setIsBuildingPdf(true);
    try {
      const cached = await ensurePdf();
      const anchor = document.createElement('a');
      anchor.href = cached.url;
      anchor.download = cached.filename;
      anchor.click();
    } catch (generationError) {
      setPdfError(
        generationError instanceof Error
          ? generationError.message
          : 'Failed to generate the PDF.'
      );
    } finally {
      setIsBuildingPdf(false);
    }
  };

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
      <div className="relative flex max-h-[95vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              <Sparkles className="h-4 w-4" />
              Report viewer
            </div>
            <h2 className="mt-1 truncate text-xl font-extrabold text-slate-900 sm:text-2xl">{previewTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {viewMode === 'form'
                ? 'Generate a fresh report from this popup.'
                : 'Report opens instantly · PDF is built only when you download.'}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {showViewer && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isBuildingPdf}
                className="inline-flex cursor-pointer items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
              >
                {isBuildingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isBuildingPdf ? 'Preparing PDF…' : cachedPdfUrl ? 'Download PDF' : 'Download PDF'}
              </button>
            )}

            {report && (
              <button
                type="button"
                onClick={openNewReportForm}
                className="inline-flex cursor-pointer items-center rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
              >
                <FileText className="mr-2 h-4 w-4" />
                Generate new report
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close report popup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {viewMode === 'form' || !report ? (
            <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
                Report Setup
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  Enter your chess account details. When the report is ready, it opens instantly in this viewer.
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

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Username
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => handleFormChange('username', e.target.value)}
                      placeholder="Enter chess username"
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      disabled={isRefreshing}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={validateUsername}
                      disabled={!formData.username || isValidating || isRefreshing}
                      className="cursor-pointer"
                    >
                      {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validate'}
                    </Button>
                  </div>
                  {validationResult === true && (
                    <p className="mt-2 text-xs text-emerald-700">Username found.</p>
                  )}
                  {validationResult === false && (
                    <p className="mt-2 text-xs text-rose-700">Username not found.</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Games to analyze (1-100)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.gameCount}
                    onChange={(event) => handleFormChange('gameCount', parseInt(event.target.value, 10) || 1)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    disabled={isRefreshing}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Recommended: 20–50 games · estimated ~{Math.ceil(estimatedTime / 60)} min
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Game type
                  </label>
                  <select
                    value={formData.rated === undefined ? 'all' : formData.rated ? 'rated' : 'unrated'}
                    onChange={(event) => {
                      const value = event.target.value;
                      handleFormChange('rated', value === 'all' ? undefined : value === 'rated');
                    }}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                    disabled={isRefreshing}
                  >
                    <option value="all">All Games</option>
                    <option value="rated">Rated Games Only</option>
                    <option value="unrated">Unrated Games Only</option>
                  </select>
                </div>

                <Button
                  type="button"
                  onClick={generateReport}
                  disabled={isRefreshing || !formData.username.trim() || validationResult === false}
                  className="w-full cursor-pointer"
                >
                  {isRefreshing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Generate report
                    </>
                  )}
                </Button>

                {isRefreshing && progress && (
                  <div className="space-y-2">
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
                {pdfError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{pdfError}</p>}
              </div>
            </div>
          ) : (
            <div className="mx-auto overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  Report
                </div>
                <div className="text-xs font-medium text-slate-500">{pdfFilename}</div>
              </div>

              <div className="bg-white p-3 sm:p-4">
                {pdfError && (
                  <div className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {pdfError}
                  </div>
                )}
                {isBuildingPdf && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building PDF for download…
                  </div>
                )}
                <div ref={reportRef} className="report-viewer-root">
                  <ReportDisplay report={report} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReportPopup;
