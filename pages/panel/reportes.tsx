/**
 * Página /panel/reportes
 *
 * Panel de indicadores y reportes del banco de preguntas: estadísticas
 * agregadas, distribuciones y estado del banco.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import ReportsDashboard from '@/components/reports/ReportsDashboard';
import AdminLayout from '@/components/layout/AdminLayout';

export default function ReportesPage() {
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
      title="Reportes"
      subtitle="Indicadores y estadísticas del banco de preguntas"
      user={usuario}
      backHref="/panel"
    >
      <h1 className="text-3xl font-bold text-slate-900 mb-6">
        Reportes del Banco de Preguntas
      </h1>

      <ReportsDashboard />

      <div className="mt-8 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          ¿Necesitas un reporte personalizado? Contacta al equipo de desarrollo o utiliza
          los filtros en la sección de preguntas para generar análisis específicos.
        </p>
      </div>
    </AdminLayout>
  );
}
