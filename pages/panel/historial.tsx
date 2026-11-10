/**
 * Página /panel/historial — Auditoría global de cambios de preguntas.
 *
 * Requiere sesión admin y consume GET /api/historial. El historial es una
 * funcionalidad exclusiva del panel; la app móvil no lo usa.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AdminLayout from '@/components/layout/AdminLayout';
import HistorialGlobal from '@/components/history/HistorialGlobal';

export default function HistorialPage() {
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
      title="Historial de cambios"
      subtitle="Trazabilidad de preguntas: quién, cuándo y desde qué reporte"
      user={usuario}
      backHref="/panel"
    >
      <HistorialGlobal />
    </AdminLayout>
  );
}
