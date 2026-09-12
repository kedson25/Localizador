import React, { type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Falha ao renderizar a aplicação:', error.name, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <section className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-gray-900">Não foi possível carregar o sistema</h1>
          <p className="mt-2 text-sm text-gray-600">Atualize a página para tentar conectar novamente.</p>
          <button type="button" onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            Atualizar página
          </button>
        </section>
      </main>
    );
  }
}
