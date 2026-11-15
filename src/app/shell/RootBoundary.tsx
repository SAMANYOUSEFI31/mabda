/**
 * ARCH-03: an error while drawing never leaves a white page. What happened, that nothing written is lost (everything is on the
 * server already), «دوباره» to draw again, and a page reload as the second way out. The error is reported (no user text).
 */
import React from 'react';
import { Button, ErrorState } from '../../ui';
import { reportError } from '../../services/errorReport';

interface State { error: Error | null; attempt: number }

export class RootBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) { reportError(error, { componentStack: info.componentStack ?? undefined }); }

  render() {
    if (!this.state.error) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    return (
      <div className="min-h-screen bg-surface-page text-text-default">
        <main className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl flex flex-col gap-stack-md">
          <ErrorState
            title="این صفحه درست نمایش داده نشد"
            description="چیزی از نوشته‌هایت پاک نشده است: همه‌چیز پیش از این روی سرور ذخیره شده بود. گزارش این خطا خودکار فرستاده شد (بدون متن‌های تو). «تلاش دوباره» را بزن؛ اگر باز هم شد، صفحه را از نو باز کن."
            onRetry={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
            details={`${this.state.error.name}: ${this.state.error.message}`}
          />
          <div className="flex justify-center">
            <Button variant="ghost" iconStart="RefreshCw" onClick={() => window.location.reload()}>باز کردن دوبارهٔ صفحه</Button>
          </div>
        </main>
      </div>
    );
  }
}
