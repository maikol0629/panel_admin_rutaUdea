/**
 * Página /panel/reportesPreguntas
 *
 * Gestión general de los reportes de inconsistencia de preguntas que los
 * aspirantes envían desde la app móvil (simulacro o práctica). Permite al
 * admin revisar, descartar o reabrir cada reporte y agregar notas de
 * seguimiento.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import ReportesPreguntasManager from '@/components/reports/ReportesPreguntasManager';
import AdminLayout from '@/components/layout/AdminLayout';

export default function ReportesPreguntasPage() {
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
      title="Gestión de reportes de preguntas"
      subtitle="Reporte de inconsistencias enviados desde la app móvil"
      user={usuario}
      backHref="/panel"
    >
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Reportes de Preguntas</h1>

      <ReportesPreguntasManager />
    </AdminLayout>
  );
}
