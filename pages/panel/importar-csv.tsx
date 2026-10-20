/**
 * Página /panel/importar-csv
 *
 * Permite a los administradores importar preguntas desde un archivo CSV.
 * Valida encabezados, tipos de datos y detecta duplicados por fila.
 * Las preguntas válidas se insertan en Firestore con estado "pendiente".
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import CsvImportForm from '@/components/import/CsvImportForm';

export default function ImportarCsvPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        void router.replace('/auth/login');
        return;
      }
      setUsuario(user);
    });

    return () => unsub();
  }, [router]);

  const cerrarSesion = () => {
    signOut(auth).finally(() => {
      void router.replace('/auth/login');
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold uppercase text-xs">ADM</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Panel Admin</h2>
              <p className="text-sm text-gray-500">Importar preguntas CSV</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {usuario?.displayName ?? usuario?.email ?? 'Admin'}
            </span>

            <button
              onClick={cerrarSesion}
              className="text-sm text-red-600 hover:underline"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </nav>

      <main className="p-6 sm:p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Importar Preguntas desde CSV
        </h1>

        <CsvImportForm />
      </main>
    </div>
  );
}
