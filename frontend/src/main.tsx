import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App'
import { LandingPage } from './components/landing'

// ============================================================================
// Global Error Boundary - prevents "all black" screen on React errors
// ============================================================================
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[CivicSim] Unhandled React error:', error);
    console.error('[CivicSim] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Use inline styles as fallback in case CSS fails
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0a0a0b',
          color: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <div style={{
            maxWidth: '28rem',
            width: '100%',
            backgroundColor: '#111113',
            border: '1px solid #27272a',
            borderRadius: '0.5rem',
            padding: '1.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              <h1 style={{ fontSize: '1.125rem', fontWeight: 500, margin: 0 }}>Something went wrong</h1>
            </div>
            
            <p style={{ fontSize: '0.875rem', color: '#a1a1aa', marginBottom: '1rem' }}>
              An error occurred while rendering the application. Check the browser console for details.
            </p>
            
            {this.state.error && (
              <div style={{
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '0.25rem',
                padding: '0.75rem',
                marginBottom: '1rem',
              }}>
                <p style={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: '#ef4444',
                  margin: 0,
                  wordBreak: 'break-all',
                }}>
                  {this.state.error.message}
                </p>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#27272a',
                  color: '#fafafa',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Global error handlers for unhandled promise rejections and errors
// ============================================================================
window.addEventListener('error', (event) => {
  console.error('[CivicSim] Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[CivicSim] Unhandled promise rejection:', event.reason);
});

// ============================================================================
// Simple App Router (no auth)
// ============================================================================
function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/app"
        element={<App />}
      />
      {/* Catch-all: redirect to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ============================================================================
// App Wrapper (no Clerk)
// ============================================================================
function AppWithRouter() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppWithRouter />
    </ErrorBoundary>
  </StrictMode>,
)
