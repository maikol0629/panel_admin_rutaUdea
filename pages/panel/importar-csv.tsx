/**
 * Página /panel/importar-csv
 *
 * Importación masiva de preguntas y contextos.
 * - JSONL: formato canónico v2 (`questions_v2.jsonl` / `contexts_v2.jsonl`).
 * - CSV: planilla simple con validación por fila.
 *
 * Ambas vías escriben en el contrato v2 y dejan las preguntas en
 * `pendiente` por defecto (D-08).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import CsvImportForm from '@/components/import/CsvImportForm';
import JsonlImportForm from '@/components/import/JsonlImportForm';
import AdminLayout from '@/components/layout/AdminLayout';

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

  return (
    <AdminLayout
      title="Importar datos del banco"
      subtitle="Preguntas y contextos · contrato v2"
      user={usuario}
      backHref="/panel"
      maxWidth="5xl"
      contentClassName="space-y-8"
    >
      <h1 className="text-3xl font-bold text-gray-900">Importar datos del banco</h1>

      <JsonlImportForm />

      <div className="border-t border-gray-200 pt-8">
        <h2 className="text-lg font-medium text-gray-900 mb-1">
          Importar desde CSV (alternativa)
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Para planillas simples. Las opciones se guardan como objeto
          <code className="mx-1">A–D</code> y toda fila entra en
          <code className="mx-1">pendiente</code>.
        </p>
        <CsvImportForm />
      </div>
    </AdminLayout>
  );
}
