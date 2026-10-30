import type { ReactNode } from 'react';
import Link from 'next/link';
import { signOut, type User } from 'firebase/auth';
import { useRouter } from 'next/router';
import { auth } from '@/lib/firebase';

interface AdminLayoutProps {
  title: string;
  subtitle: string;
  user?: User | null;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  maxWidth?: '4xl' | '5xl' | '7xl';
  contentClassName?: string;
}

const maxWidthClasses = {
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '7xl': 'max-w-7xl',
};

export default function AdminLayout({
  title,
  subtitle,
  user,
  children,
  backHref,
  backLabel = 'Volver al panel',
  maxWidth = '7xl',
  contentClassName = '',
}: AdminLayoutProps) {
  const router = useRouter();

  const cerrarSesion = () => {
    signOut(auth).finally(() => {
      void router.replace('/auth/login');
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                aria-label={backLabel}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                ←
              </Link>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm">
                <span className="text-xs font-bold uppercase text-white">ADM</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                {title}
              </p>
              <p className="truncate text-xs text-slate-500 sm:text-sm">{subtitle}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-slate-600 sm:block">
              {user?.displayName ?? user?.email ?? 'Admin'}
            </span>
            <button
              onClick={cerrarSesion}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto w-full ${maxWidthClasses[maxWidth]} px-4 py-6 sm:px-8 sm:py-8 ${contentClassName}`}
      >
        {children}
      </main>
    </div>
  );
}
