import type { ReactNode } from 'react';

export interface LayoutProps {
  titulo: string;
  headerDerecha?: ReactNode;
  children: ReactNode;
}

export function Layout({ titulo, headerDerecha, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-fondo">
      <header className="flex items-center justify-between border-b border-borde bg-superficie px-4 py-3">
        <h1 className="text-lg font-semibold text-texto">{titulo}</h1>
        {headerDerecha !== undefined && <div>{headerDerecha}</div>}
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
