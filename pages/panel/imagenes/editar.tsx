import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import AdminLayout from '@/components/layout/AdminLayout';
import ImagenEditorCanvas from '@/components/questions/ImagenEditorCanvas';
import { auth } from '@/lib/firebase';

interface EditorPayload {
  valor: string | null;
  returnTo: string;
  indice: number;
}

export default function EditarImagenPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        void router.replace('/auth/login');
        return;
      }
      setUsuario(user);
    });
    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!router.isReady) return;
    const clave = Array.isArray(router.query.clave)
      ? router.query.clave[0]
      : router.query.clave;
    if (!clave) {
      setError('No se encontró la imagen que se desea editar.');
      return;
    }
    try {
      const almacenado = sessionStorage.getItem(clave);
      if (!almacenado) throw new Error('La sesión de edición expiró.');
      const valor = JSON.parse(almacenado) as Partial<EditorPayload>;
      if (typeof valor.returnTo !== 'string' || typeof valor.indice !== 'number') {
        throw new Error('Los datos de edición no son válidos.');
      }
      setPayload({
        valor: typeof valor.valor === 'string' ? valor.valor : null,
        returnTo: valor.returnTo,
        indice: valor.indice,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el editor.');
    }
  }, [router.isReady, router.query.clave]);

  const volver = () => {
    if (payload) void router.push(payload.returnTo);
    else void router.back();
  };

  const confirmar = (valor: string | null) => {
    if (!payload) return;
    const resultado = `imagen-editor-resultado-${Date.now()}-${payload.indice}`;
    sessionStorage.setItem(resultado, valor ?? '');
    const url = new URL(payload.returnTo, window.location.origin);
    url.searchParams.set('editorResultado', resultado);
    url.searchParams.set('indiceImagen', String(payload.indice));
    void router.push(`${url.pathname}${url.search}`);
  };

  return (
    <AdminLayout
      title="Editor de imagen"
      subtitle="Edita la imagen y aplica los cambios cuando estés listo"
      user={usuario}
      backHref={payload?.returnTo ?? '/panel'}
      backLabel="Volver sin guardar"
      maxWidth="7xl"
      contentClassName="py-4 sm:py-6"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {payload && (
        <ImagenEditorCanvas
          valorInicial={payload.valor}
          onConfirmar={confirmar}
          onCancelar={volver}
          etiquetaConfirmar="Aplicar cambios"
        />
      )}
    </AdminLayout>
  );
}
