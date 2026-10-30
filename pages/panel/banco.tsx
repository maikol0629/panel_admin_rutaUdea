/**
 * Página /panel/banco — Publicación del banco (D-02).
 *
 * Muestra el manifiesto activo, las verificaciones previas y permite
 * publicar una versión como activa. La publicación exige confirmación
 * explícita y solo pasa si el lote cumple el contrato v2.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';
import AdminLayout from '@/components/layout/AdminLayout';

interface Manifiesto {
  bank_version?: string;
  schema_version?: number;
  status?: string;
  hash?: string;
  published_at?: string;
  published_by?: string;
  min_app_version?: number;
  image_base_url?: string;
  counts?: Record<string, number>;
}

interface Verificacion {
  listaParaPublicar: boolean;
  motivos: string[];
  totalMotivos: number;
  preguntasDeLaVersion: number;
  aprobadasDeLaVersion: number;
  contextos: number;
  imagenes: number;
  imagenesConUrl: number;
  hashCalculado: string;
}

interface RespuestaEstado {
  success?: boolean;
  activo?: Manifiesto | null;
  versionActiva?: string;
  verificacion?: Verificacion;
  error?: string;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{etiqueta}</p>
      <p className="text-sm font-semibold text-gray-800 break-all">{valor}</p>
    </div>
  );
}

export default function BancoPage() {
  const router = useRouter();
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [estado, setEstado] = useState<RespuestaEstado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [bankVersion, setBankVersion] = useState('udea-2026-10-v1');
  const [minAppVersion, setMinAppVersion] = useState(0);
  const [imageBaseUrl, setImageBaseUrl] = useState('');
  const [notas, setNotas] = useState('');
  const [confirmar, setConfirmar] = useState(false);

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

  const cargar = useCallback(async () => {
    if (!idToken) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/bank/manifest', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json()) as RespuestaEstado;
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'No se pudo cargar el estado del banco');
      }
      setEstado(data);
      if (data.versionActiva) setBankVersion(data.versionActiva);
      if (data.activo?.image_base_url) setImageBaseUrl(data.activo.image_base_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setCargando(false);
    }
  }, [idToken]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const publicar = async () => {
    if (!idToken) return;
    if (!confirmar) {
      setError('Marque la casilla de confirmación para publicar.');
      return;
    }
    setPublicando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch('/api/bank/manifest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          bank_version: bankVersion.trim(),
          schema_version: 2,
          min_app_version: minAppVersion,
          image_base_url: imageBaseUrl.trim() || undefined,
          notas: notas.trim() || undefined,
          confirmar: true,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        mensaje?: string;
        error?: string;
        motivos?: string[];
      };
      if (!res.ok || !data.success) {
        const detalle = data.motivos?.length
          ? ` Motivos: ${data.motivos.slice(0, 8).join(', ')}`
          : '';
        throw new Error(`${data.error ?? 'No se pudo publicar'}${detalle}`);
      }
      setAviso(data.mensaje ?? 'Banco publicado.');
      setConfirmar(false);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setPublicando(false);
    }
  };

  const v = estado?.verificacion;

  return (
    <AdminLayout
      title="Publicación del banco"
      subtitle="Verificación, manifiesto activo y activación"
      user={usuario}
      backHref="/panel"
      maxWidth="5xl"
      contentClassName="space-y-6"
    >
      {cargando && <p className="text-sm text-gray-500">Consultando banco…</p>}
      {error && (
        <div className="p-3 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
      {aviso && (
        <div className="p-3 bg-green-50 rounded border border-green-200 text-green-700 text-sm">
          {aviso}
        </div>
      )}

      {estado?.activo ? (
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Manifiesto activo</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Dato etiqueta="Versión" valor={estado.activo.bank_version ?? '—'} />
            <Dato etiqueta="Estado" valor={estado.activo.status ?? '—'} />
            <Dato etiqueta="Schema" valor={estado.activo.schema_version ?? '—'} />
            <Dato etiqueta="Aprobadas" valor={estado.activo.counts?.aprobadas ?? '—'} />
            <Dato etiqueta="Total" valor={estado.activo.counts?.total ?? '—'} />
            <Dato etiqueta="Contextos" valor={estado.activo.counts?.contextos ?? '—'} />
            <Dato etiqueta="Publicado" valor={estado.activo.published_at ?? '—'} />
            <Dato etiqueta="Por" valor={estado.activo.published_by ?? '—'} />
            <Dato etiqueta="min_app_version" valor={estado.activo.min_app_version ?? 0} />
          </div>
          <p className="mt-3 text-xs text-gray-500 font-mono break-all">
            hash: {estado.activo.hash ?? '—'}
          </p>
        </section>
      ) : (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-900 text-sm">
          Todavía no hay `bank_manifest/active`. La app sigue usando el asset embebido y
          la sincronización se activa cuando publique una versión.
        </section>
      )}

      {v && (
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">
            Verificación de {estado?.versionActiva}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Dato etiqueta="Preguntas" valor={v.preguntasDeLaVersion} />
            <Dato etiqueta="Aprobadas" valor={v.aprobadasDeLaVersion} />
            <Dato etiqueta="Contextos" valor={v.contextos} />
            <Dato etiqueta="Imágenes" valor={`${v.imagenesConUrl}/${v.imagenes}`} />
          </div>
          {v.listaParaPublicar ? (
            <p className="mt-4 p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
              El lote cumple el contrato y puede publicarse.
              {estado?.activo &&
              estado.activo.hash &&
              estado.activo.hash !== v.hashCalculado
                ? ' Hay cambios locales respecto al manifiesto activo: publique para distribuirlos.'
                : ''}
            </p>
          ) : (
            <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">
              <p className="font-medium">
                El lote no puede publicarse ({v.totalMotivos} motivos).
              </p>
              <ul className="list-disc ml-5 mt-2 space-y-0.5">
                {v.motivos.slice(0, 20).map((motivo) => (
                  <li key={motivo} className="font-mono text-xs">
                    {motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500 font-mono break-all">
            hash calculado: {v.hashCalculado}
          </p>
        </section>
      )}

      <section className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Publicar versión</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              bank_version
            </label>
            <input
              value={bankVersion}
              onChange={(e) => setBankVersion(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              min_app_version
            </label>
            <input
              type="number"
              value={minAppVersion}
              onChange={(e) => setMinAppVersion(Number(e.target.value) || 0)}
              className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              image_base_url
            </label>
            <input
              value={imageBaseUrl}
              onChange={(e) => setImageBaseUrl(e.target.value)}
              placeholder="https://rutaudea-25fe0.web.app/questions/udea-2026-10-v1"
              className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas de la publicación
            </label>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700 mb-4">
          <input
            type="checkbox"
            checked={confirmar}
            onChange={(e) => setConfirmar(e.target.checked)}
            className="h-4 w-4 mt-0.5"
          />
          <span>
            Confirmo publicar esta versión como activa. Los dispositivos con la app v2
            descargarán el lote en su próxima sincronización.
          </span>
        </label>

        <button
          onClick={publicar}
          disabled={publicando || !v?.listaParaPublicar}
          className="py-2 px-5 rounded-md font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40"
        >
          {publicando ? 'Publicando…' : 'Publicar banco'}
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Solo se publican preguntas `aprobado` y `aprobado_con_imagen` que cumplan el
          contrato y cuyos contextos existan.
        </p>
      </section>
    </AdminLayout>
  );
}
