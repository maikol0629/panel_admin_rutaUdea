/**
 * Página /panel/preguntas
 *
 * Lista avanzada de preguntas con filtros interactivos, búsqueda textual,
 * ordenamiento y paginación. Acciones rápidas: ver, editar, cambiar estado.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import QuestionsList from '@/components/questions/QuestionsList';
import AdminLayout from '@/components/layout/AdminLayout';

export default function PreguntasPage() {
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
      title="Gestión de preguntas"
      subtitle="Revisión, búsqueda y administración del banco"
      user={usuario}
      backHref="/panel"
    >
        <h1 className="text-3xl font-bold text-slate-900 mb-6">
          Gestión de Preguntas
        </h1>

        <QuestionsList />
    </AdminLayout>
  );
}
