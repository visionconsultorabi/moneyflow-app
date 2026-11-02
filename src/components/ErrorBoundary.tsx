import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  private handleReset = () => {
    // Unregister service worker and clear site cache to recover from stale PWA bundles
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const reg of registrations) {
          reg.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then(names => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#0A0E14',
          color: '#F8FAFC',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#EF4444' }}>
            Hubo un problema al cargar la aplicación
          </h2>
          <p style={{ fontSize: 14, color: '#94A3B8', maxWidth: 400, marginBottom: 20 }}>
            {this.state.error?.message || 'Error inesperado'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#0EA5E9',
                color: '#fff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              Reintentar
            </button>
            <button
              onClick={this.handleReset}
              style={{
                background: '#1E293B',
                color: '#94A3B8',
                border: '1px solid #334155',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              Limpiar Caché y Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
