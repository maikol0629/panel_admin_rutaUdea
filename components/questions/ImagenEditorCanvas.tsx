/**
 * ImagenEditorCanvas — Átomo: editor de imagen tipo Paint basado en HTML5 Canvas.
 *
 * Permite editar una imagen directamente en el navegador antes de guardarla:
 * - Cargar archivo de imagen
 * - Dibujo libre (pincel) con color y grosor seleccionables
 * - Borrador (pinta blanco sobre la imagen)
 * - Formas: línea, rectángulo, círculo (con relleno opcional)
 * - Texto
 * - Selección: recortar y mover el contenido dibujado (texto, trazos, formas)
 * - Mover la imagen dentro del lienzo
 * - Filtros: brillo, contraste, saturación, escala de grises
 * - Rotación (izquierda/derecha) y zoom de vista
 * - Deshacer / Rehacer
 * - Exportar como data URL (listo para guardar en la pregunta)
 *
 * Se usan dos capas de canvas:
 * - Capa base: la imagen con sus filtros/rotación.
 * - Capa de dibujo: trazos, formas y texto del usuario.
 * Al exportar se combinan ambas capas.
 *
 * Todo se procesa en el cliente; no se envía nada a un servidor externo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type ModoHerramienta =
  | 'pincel'
  | 'borrador'
  | 'linea'
  | 'rectangulo'
  | 'circulo'
  | 'texto'
  | 'seleccionar'
  | 'mover';

interface FiltrosImagen {
  brillo: number; // -100 a 100
  contraste: number; // -100 a 100
  saturacion: number; // -100 a 100
  gris: boolean;
  rotacion: number; // grados
}

interface ImagenEditorCanvasProps {
  /** Valor inicial (data URL o URL externa o null). */
  valorInicial: string | null;
  /** Callback cuando el usuario confirma la edición. Recibe el data URL o null. */
  onConfirmar: (valor: string | null) => void;
  /** Etiqueta del botón de confirmar. */
  etiquetaConfirmar?: string;
  /** Callback para cancelar sin modificar la imagen. */
  onCancelar?: () => void;
  /** Si está desactivado. */
  desactivado?: boolean;
}

interface Seleccion {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_ANCHO = 1200;
const MAX_ALTO = 800;
const MAX_HISTORIAL = 40;

const CONTROL_CLASSE =
  'w-full rounded-md border-gray-300 shadow-sm py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500';

const BOTON_HERRAMIENTA_ACTIVA =
  'px-3 py-1.5 rounded-md border border-blue-500 bg-blue-50 text-blue-700 text-sm font-medium shadow-sm';
const BOTON_HERRAMIENTA_INACTIVA =
  'px-3 py-1.5 rounded-md border border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm';

const FILTROS_NEUTROS: FiltrosImagen = {
  brillo: 0,
  contraste: 0,
  saturacion: 0,
  gris: false,
  rotacion: 0,
};

/** Crea una copia nueva de los filtros neutros (evita que React omita el cambio). */
function filtrosNeutros(): FiltrosImagen {
  return { ...FILTROS_NEUTROS };
}

export default function ImagenEditorCanvas({
  valorInicial,
  onConfirmar,
  etiquetaConfirmar = 'Aplicar cambios',
  onCancelar,
  desactivado = false,
}: ImagenEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasDibujoRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const ctxDibujoRef = useRef<CanvasRenderingContext2D | null>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const valorCargadoRef = useRef<string | null>(null);

  const dibujandoRef = useRef(false);
  const inicioRef = useRef({ x: 0, y: 0 });
  const finRef = useRef({ x: 0, y: 0 });
  const dibujoInicialRef = useRef<ImageData | null>(null);
  const snapshotMoverRef = useRef<HTMLCanvasElement | null>(null);
  const seleccionBufferRef = useRef<HTMLCanvasElement | null>(null);
  const dibujoFondoSeleccionRef = useRef<HTMLCanvasElement | null>(null);
  const seleccionOriginalRef = useRef<Seleccion | null>(null);
  const inicioMovimientoSeleccionRef = useRef({ x: 0, y: 0 });
  const moviendoSeleccionRef = useRef(false);
  const historialMovimientoSeleccionRef = useRef(false);
  const pilaDeshacerRef = useRef<string[]>([]);
  const pilaRehacerRef = useRef<string[]>([]);

  const [filtros, setFiltros] = useState<FiltrosImagen>(filtrosNeutros);
  const [herramienta, setHerramienta] = useState<ModoHerramienta>('pincel');
  const [color, setColor] = useState('#000000');
  const [grosor, setGrosor] = useState(3);
  const [relleno, setRelleno] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [imagenLista, setImagenLista] = useState(false);
  const [cargandoImagen, setCargandoImagen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const [puedeRehacer, setPuedeRehacer] = useState(false);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [revision, setRevision] = useState(0);
  const [dimensionesCanvas, setDimensionesCanvas] = useState({
    ancho: 0,
    alto: 0,
  });

  /**
   * Construye una URL apta para cargar en el canvas sin problemas de CORS.
   * Si la URL es externa (http/https), usa el proxy local /api/images/proxy.
   */
  const construirUrlCargable = useCallback((urlOriginal: string): string => {
    if (urlOriginal.startsWith('data:') || urlOriginal.startsWith('blob:')) {
      return urlOriginal;
    }
    // El parámetro v evita reutilizar respuestas antiguas cacheadas.
    return `/api/images/proxy?url=${encodeURIComponent(urlOriginal)}&v=2`;
  }, []);

  /**
   * Carga una imagen. Para URLs externas pasa por el proxy y luego usa un
   * blob local, de modo que el canvas nunca queda "tainted".
   */
  const cargarImagenEnElemento = useCallback(
    async (
      url: string,
      onExito: (img: HTMLImageElement) => void,
      onError: (mensaje?: string) => void,
    ) => {
      const urlCargable = construirUrlCargable(url);
      if (urlCargable === url) {
        const img = new Image();
        img.onload = () => onExito(img);
        img.onerror = () => onError('No se pudo leer el archivo de imagen.');
        img.src = url;
        return;
      }

      try {
        const respuesta = await fetch(urlCargable);
        // El proxy responde JSON solo cuando hay error; si viene imagen, se ignora.
        if (!respuesta.ok) {
          const detalle = (await respuesta
            .clone()
            .json()
            .catch(() => null)) as { error?: string } | null;
          onError(
            detalle?.error ?? `No se pudo descargar la imagen (${respuesta.status}).`,
          );
          return;
        }
        const blob = await respuesta.blob();
        const objetoUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objetoUrl);
          onExito(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objetoUrl);
          onError('La respuesta del servidor no es una imagen válida.');
        };
        img.src = objetoUrl;
      } catch {
        onError('No se pudo contactar el proxy de imágenes.');
      }
    },
    [construirUrlCargable],
  );

  /** Limpia la capa de dibujo. */
  const limpiarCapaDibujo = useCallback(() => {
    const canvas = canvasDibujoRef.current;
    const ctx = ctxDibujoRef.current;
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  /** Devuelve un canvas con la imagen base + los trazos del usuario. */
  const combinarCapas = useCallback((): HTMLCanvasElement | null => {
    const base = canvasRef.current;
    if (!base) return null;
    const combinado = document.createElement('canvas');
    combinado.width = base.width;
    combinado.height = base.height;
    const ctx = combinado.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(base, 0, 0);
    const dibujo = canvasDibujoRef.current;
    if (dibujo) ctx.drawImage(dibujo, 0, 0);
    return combinado;
  }, []);

  /** Reinicia las pilas de deshacer/rehacer. */
  const resetHistorial = useCallback(() => {
    pilaDeshacerRef.current = [];
    pilaRehacerRef.current = [];
    setPuedeDeshacer(false);
    setPuedeRehacer(false);
  }, []);

  /** Guarda el estado combinado *antes* de una edición. */
  const registrarHistorial = useCallback(() => {
    const combinado = combinarCapas();
    if (!combinado) return;
    try {
      pilaDeshacerRef.current.push(combinado.toDataURL('image/png'));
      if (pilaDeshacerRef.current.length > MAX_HISTORIAL) {
        pilaDeshacerRef.current.shift();
      }
      pilaRehacerRef.current = [];
      setPuedeDeshacer(true);
      setPuedeRehacer(false);
    } catch (e) {
      console.warn('[ImagenEditorCanvas] No se pudo guardar historial:', e);
    }
  }, [combinarCapas]);

  /**
   * Calcula el tamaño del lienzo para la imagen y la rotación actuales.
   * Mantiene la imagen dentro de MAX_ANCHO x MAX_ALTO sin ampliarla.
   */
  const calcularDimensiones = useCallback(() => {
    const img = imagenRef.current;
    if (!img) return null;
    const rad = (filtros.rotacion * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const anchoRotado = img.width * cos + img.height * sin;
    const altoRotado = img.width * sin + img.height * cos;
    const escala = Math.min(MAX_ANCHO / anchoRotado, MAX_ALTO / altoRotado, 1);
    return {
      ancho: Math.max(1, Math.round(anchoRotado * escala)),
      alto: Math.max(1, Math.round(altoRotado * escala)),
      escala,
    };
  }, [filtros.rotacion]);

  /** Dibuja la imagen base con filtros y rotación. */
  const dibujarImagenBase = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const img = imagenRef.current;
    const medidas = calcularDimensiones();
    if (!canvas || !ctx || !img || !medidas) return;

    const { ancho, alto, escala } = medidas;

    // Redimensionar solo cuando cambia; redimensionar siempre borraría la capa de dibujo.
    if (canvas.width !== ancho || canvas.height !== alto) {
      canvas.width = ancho;
      canvas.height = alto;
      const dibujo = canvasDibujoRef.current;
      if (dibujo) {
        dibujo.width = ancho;
        dibujo.height = alto;
        const ctxDibujo = ctxDibujoRef.current;
        if (ctxDibujo) ctxDibujo.clearRect(0, 0, ancho, alto);
      }
      setDimensionesCanvas({ ancho, alto });
    }

    ctx.save();
    ctx.clearRect(0, 0, ancho, alto);
    ctx.translate(ancho / 2, alto / 2);
    ctx.rotate((filtros.rotacion * Math.PI) / 180);

    const brillo = 100 + filtros.brillo;
    const contraste = 100 + filtros.contraste;
    const saturacion = 100 + filtros.saturacion;
    const gris = filtros.gris ? 100 : 0;
    ctx.filter = `brightness(${brillo}%) contrast(${contraste}%) saturate(${saturacion}%) grayscale(${gris}%)`;

    const anchoImagen = img.width * escala;
    const altoImagen = img.height * escala;
    ctx.drawImage(img, -anchoImagen / 2, -altoImagen / 2, anchoImagen, altoImagen);
    ctx.restore();
  }, [calcularDimensiones, filtros]);

  // Cargar la imagen inicial (o cuando cambie el valor).
  useEffect(() => {
    if (!valorInicial) {
      imagenRef.current = null;
      valorCargadoRef.current = null;
      setImagenLista(false);
      setCargandoImagen(false);
      setDimensionesCanvas({ ancho: 0, alto: 0 });
      resetHistorial();
      return;
    }
    if (valorCargadoRef.current === valorInicial) return;

    let cancelado = false;
    setError(null);
    setCargandoImagen(true);
    cargarImagenEnElemento(
      valorInicial,
      (img) => {
        if (cancelado) return;
        imagenRef.current = img;
        valorCargadoRef.current = valorInicial;
        limpiarCapaDibujo();
        resetHistorial();
        setSeleccion(null);
        setFiltros(filtrosNeutros());
        setImagenLista(true);
        setCargandoImagen(false);
        setRevision((actual) => actual + 1);
      },
      (mensaje) => {
        if (cancelado) return;
        setError(
          mensaje ??
            'No se pudo cargar esta imagen. Verifica que la URL sea pública o sube el archivo desde el selector.',
        );
        setImagenLista(false);
        setCargandoImagen(false);
      },
    );

    return () => {
      cancelado = true;
    };
  }, [valorInicial, cargarImagenEnElemento, limpiarCapaDibujo, resetHistorial]);

  // Preparar contextos y redibujar cuando cambia la imagen o los filtros.
  useEffect(() => {
    if (!imagenLista) return;
    const frame = window.requestAnimationFrame(() => {
      const base = canvasRef.current;
      const dibujo = canvasDibujoRef.current;
      if (!base || !dibujo) return;
      ctxRef.current ??= base.getContext('2d');
      ctxDibujoRef.current ??= dibujo.getContext('2d');
      dibujarImagenBase();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [imagenLista, filtros, revision, dibujarImagenBase]);

  const cargarImagenDesdeArchivo = useCallback(
    (archivo: File) => {
      setError(null);
      if (!archivo.type.startsWith('image/')) {
        setError('Selecciona un archivo de imagen válido.');
        return;
      }
      setCargandoImagen(true);
      const url = URL.createObjectURL(archivo);
      cargarImagenEnElemento(
        url,
        (img) => {
          URL.revokeObjectURL(url);
          imagenRef.current = img;
          // Forzar recarga aunque el archivo se llame igual que el anterior.
          valorCargadoRef.current = `archivo:${Date.now()}`;
          limpiarCapaDibujo();
          resetHistorial();
          setSeleccion(null);
          setFiltros(filtrosNeutros());
          setImagenLista(true);
          setCargandoImagen(false);
          setRevision((actual) => actual + 1);
        },
        () => {
          URL.revokeObjectURL(url);
          setError('No se pudo cargar la imagen desde el archivo.');
          setCargandoImagen(false);
        },
      );
    },
    [cargarImagenEnElemento, limpiarCapaDibujo, resetHistorial],
  );

  const manejarArchivo = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const archivo = e.target.files?.[0];
      if (archivo) cargarImagenDesdeArchivo(archivo);
      e.target.value = '';
    },
    [cargarImagenDesdeArchivo],
  );

  /** Convierte un evento de puntero a coordenadas internas del canvas. */
  const obtenerPosicion = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasDibujoRef.current ?? canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  /** Indica si un punto cae dentro del rectángulo de selección. */
  const puntoDentroDeSeleccion = useCallback(
    (pos: { x: number; y: number }, sel: Seleccion): boolean => {
      return (
        pos.x >= sel.x &&
        pos.x <= sel.x + sel.w &&
        pos.y >= sel.y &&
        pos.y <= sel.y + sel.h
      );
    },
    [],
  );

  /**
   * "Levanta" los píxeles de la capa de dibujo dentro de la selección y los
   * deja listos para arrastrarse. La imagen base no se toca: así se mueve el
   * texto/trazos sin arrastrar el fondo de la fotografía.
   */
  const iniciarMovimientoSeleccion = useCallback(
    (pos: { x: number; y: number }, sel: Seleccion): boolean => {
      const canvas = canvasDibujoRef.current;
      const ctx = ctxDibujoRef.current;
      if (!canvas || !ctx) return false;

      const x = Math.max(0, Math.floor(sel.x));
      const y = Math.max(0, Math.floor(sel.y));
      const ancho = Math.min(canvas.width - x, Math.floor(sel.w));
      const alto = Math.min(canvas.height - y, Math.floor(sel.h));
      if (ancho < 2 || alto < 2) return false;

      const buffer = document.createElement('canvas');
      buffer.width = ancho;
      buffer.height = alto;
      const ctxBuffer = buffer.getContext('2d');
      if (!ctxBuffer) return false;
      ctxBuffer.drawImage(canvas, x, y, ancho, alto, 0, 0, ancho, alto);

      // Si la zona no tiene nada dibujado, no hay nada que mover.
      const datos = ctxBuffer.getImageData(0, 0, ancho, alto).data;
      let hayContenido = false;
      for (let i = 3; i < datos.length; i += 4) {
        if ((datos[i] ?? 0) > 0) {
          hayContenido = true;
          break;
        }
      }
      if (!hayContenido) return false;

      // Snapshot de la capa ya sin la zona levantada (fondo del arrastre).
      ctx.clearRect(x, y, ancho, alto);
      const fondo = document.createElement('canvas');
      fondo.width = canvas.width;
      fondo.height = canvas.height;
      const ctxFondo = fondo.getContext('2d');
      if (!ctxFondo) return false;
      ctxFondo.drawImage(canvas, 0, 0);

      // Se vuelve a pintar el contenido en su sitio para que un clic sin
      // movimiento no lo haga desaparecer.
      ctx.drawImage(buffer, x, y);

      seleccionBufferRef.current = buffer;
      dibujoFondoSeleccionRef.current = fondo;
      seleccionOriginalRef.current = { x, y, w: ancho, h: alto };
      inicioMovimientoSeleccionRef.current = pos;
      moviendoSeleccionRef.current = true;
      historialMovimientoSeleccionRef.current = false;
      return true;
    },
    [],
  );

  /** Restaura la capa de dibujo al estado previo a una forma en curso. */
  const restaurarDibujoInicial = useCallback(() => {
    const canvas = canvasDibujoRef.current;
    const ctx = ctxDibujoRef.current;
    if (!canvas || !ctx || !dibujoInicialRef.current) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(dibujoInicialRef.current, 0, 0);
  }, []);

  const dibujarForma = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      modo: 'linea' | 'rectangulo' | 'circulo',
      inicio: { x: number; y: number },
      fin: { x: number; y: number },
    ) => {
      const ancho = fin.x - inicio.x;
      const alto = fin.y - inicio.y;
      ctx.beginPath();
      ctx.lineWidth = grosor;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalCompositeOperation = 'source-over';

      if (modo === 'linea') {
        ctx.moveTo(inicio.x, inicio.y);
        ctx.lineTo(fin.x, fin.y);
      } else if (modo === 'rectangulo') {
        ctx.rect(inicio.x, inicio.y, ancho, alto);
      } else {
        ctx.ellipse(
          inicio.x + ancho / 2,
          inicio.y + alto / 2,
          Math.max(Math.abs(ancho) / 2, 1),
          Math.max(Math.abs(alto) / 2, 1),
          0,
          0,
          Math.PI * 2,
        );
      }

      if (modo !== 'linea' && relleno) ctx.fill();
      if (modo === 'linea' || !relleno) ctx.stroke();
    },
    [color, grosor, relleno],
  );

  const comenzarTrazo = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (desactivado || !imagenLista) return;
      const pos = obtenerPosicion(e);
      inicioRef.current = pos;
      finRef.current = pos;

      if (herramienta === 'texto') {
        const texto = window.prompt('Texto para insertar en la imagen:');
        const ctx = ctxDibujoRef.current;
        if (texto?.trim() && ctx) {
          registrarHistorial();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = color;
          ctx.font = `bold ${Math.max(grosor * 6, 14)}px sans-serif`;
          ctx.textBaseline = 'top';
          ctx.fillText(texto.trim(), pos.x, pos.y);
        }
        return;
      }

      if (herramienta === 'seleccionar') {
        // Si el clic cae dentro de una selección existente y hay contenido
        // dibujado, se arrastra esa selección. Si no, se crea una nueva.
        if (
          seleccion &&
          puntoDentroDeSeleccion(pos, seleccion) &&
          iniciarMovimientoSeleccion(pos, seleccion)
        ) {
          dibujandoRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        setSeleccion({ x: pos.x, y: pos.y, w: 0, h: 0 });
        dibujandoRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      const ctx = ctxDibujoRef.current;
      const canvas = canvasDibujoRef.current;
      if (!ctx || !canvas) return;

      if (herramienta === 'mover') {
        registrarHistorial();
        snapshotMoverRef.current = combinarCapas();
        limpiarCapaDibujo();
      } else {
        // Guardar el estado previo (para deshacer) y la imagen de la capa.
        registrarHistorial();
        dibujoInicialRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      dibujandoRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);

      if (herramienta === 'pincel' || herramienta === 'borrador') {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = grosor;
        // El borrador pinta blanco para tapar contenido sobre fondos claros.
        ctx.strokeStyle = herramienta === 'borrador' ? '#ffffff' : color;
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    [
      desactivado,
      imagenLista,
      obtenerPosicion,
      herramienta,
      color,
      grosor,
      registrarHistorial,
      combinarCapas,
      limpiarCapaDibujo,
      seleccion,
      puntoDentroDeSeleccion,
      iniciarMovimientoSeleccion,
    ],
  );

  const moverTrazo = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dibujandoRef.current || desactivado || !imagenLista) return;
      const pos = obtenerPosicion(e);
      finRef.current = pos;

      if (herramienta === 'seleccionar') {
        if (moviendoSeleccionRef.current) {
          const original = seleccionOriginalRef.current;
          const fondo = dibujoFondoSeleccionRef.current;
          const buffer = seleccionBufferRef.current;
          const canvas = canvasDibujoRef.current;
          const ctx = ctxDibujoRef.current;
          if (original && fondo && buffer && canvas && ctx) {
            const dx = pos.x - inicioMovimientoSeleccionRef.current.x;
            const dy = pos.y - inicioMovimientoSeleccionRef.current.y;
            if (!historialMovimientoSeleccionRef.current && (dx !== 0 || dy !== 0)) {
              registrarHistorial();
              historialMovimientoSeleccionRef.current = true;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(fondo, 0, 0);
            ctx.drawImage(buffer, original.x + dx, original.y + dy);
            setSeleccion({
              x: original.x + dx,
              y: original.y + dy,
              w: original.w,
              h: original.h,
            });
          }
          return;
        }

        const inicio = inicioRef.current;
        setSeleccion({
          x: Math.min(inicio.x, pos.x),
          y: Math.min(inicio.y, pos.y),
          w: Math.abs(pos.x - inicio.x),
          h: Math.abs(pos.y - inicio.y),
        });
        return;
      }

      if (herramienta === 'mover') {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        const snapshot = snapshotMoverRef.current;
        if (!canvas || !ctx || !snapshot) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(snapshot, pos.x - inicioRef.current.x, pos.y - inicioRef.current.y);
        return;
      }

      const ctx = ctxDibujoRef.current;
      if (!ctx) return;

      if (herramienta === 'pincel' || herramienta === 'borrador') {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (
        herramienta === 'linea' ||
        herramienta === 'rectangulo' ||
        herramienta === 'circulo'
      ) {
        restaurarDibujoInicial();
        dibujarForma(ctx, herramienta, inicioRef.current, pos);
      }
    },
    [
      desactivado,
      imagenLista,
      obtenerPosicion,
      herramienta,
      restaurarDibujoInicial,
      dibujarForma,
      registrarHistorial,
    ],
  );

  const terminarTrazo = useCallback(
    (e?: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dibujandoRef.current) return;
      dibujandoRef.current = false;
      if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const ctx = ctxDibujoRef.current;
      if (ctx) ctx.globalCompositeOperation = 'source-over';

      if (herramienta === 'seleccionar') {
        if (moviendoSeleccionRef.current) {
          // El contenido ya quedó dibujado en su nueva posición: solo se
          // limpian los buffers temporales y se conserva la selección.
          moviendoSeleccionRef.current = false;
          historialMovimientoSeleccionRef.current = false;
          seleccionBufferRef.current = null;
          dibujoFondoSeleccionRef.current = null;
          seleccionOriginalRef.current = null;
        } else {
          // Descarta selecciones accidentales de menos de 2px.
          setSeleccion((actual) =>
            actual && actual.w >= 2 && actual.h >= 2 ? actual : null,
          );
        }
        return;
      }

      if (herramienta === 'mover') {
        snapshotMoverRef.current = null;
        // Fijar el resultado del desplazamiento como imagen base.
        const canvas = canvasRef.current;
        if (canvas) {
          const dataUrl = canvas.toDataURL('image/png');
          const img = new Image();
          img.onload = () => {
            imagenRef.current = img;
            limpiarCapaDibujo();
            setSeleccion(null);
            setFiltros(filtrosNeutros());
            setImagenLista(true);
            setRevision((actual) => actual + 1);
          };
          img.src = dataUrl;
        }
      }
    },
    [herramienta, limpiarCapaDibujo],
  );

  const cancelarTrazo = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dibujandoRef.current) return;
      dibujandoRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (herramienta === 'seleccionar') {
        if (moviendoSeleccionRef.current) {
          const original = seleccionOriginalRef.current;
          const buffer = seleccionBufferRef.current;
          const fondo = dibujoFondoSeleccionRef.current;
          const canvas = canvasDibujoRef.current;
          const ctx = ctxDibujoRef.current;
          if (original && buffer && fondo && canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(fondo, 0, 0);
            ctx.drawImage(buffer, original.x, original.y);
            setSeleccion(original);
          }
          moviendoSeleccionRef.current = false;
          historialMovimientoSeleccionRef.current = false;
          seleccionBufferRef.current = null;
          dibujoFondoSeleccionRef.current = null;
          seleccionOriginalRef.current = null;
        } else {
          setSeleccion(null);
        }
        return;
      }

      if (herramienta === 'mover' && snapshotMoverRef.current) {
        // Restaurar la imagen previa al desplazamiento.
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        const snapshot = snapshotMoverRef.current;
        if (canvas && ctx && snapshot) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(snapshot, 0, 0);
        }
        snapshotMoverRef.current = null;
      } else if (
        herramienta === 'linea' ||
        herramienta === 'rectangulo' ||
        herramienta === 'circulo'
      ) {
        restaurarDibujoInicial();
      }
    },
    [herramienta, restaurarDibujoInicial],
  );

  const recortarSeleccion = useCallback(() => {
    const combinado = combinarCapas();
    if (!combinado || !seleccion) return;
    const x = Math.max(0, Math.floor(seleccion.x));
    const y = Math.max(0, Math.floor(seleccion.y));
    const ancho = Math.min(combinado.width - x, Math.floor(seleccion.w));
    const alto = Math.min(combinado.height - y, Math.floor(seleccion.h));
    if (ancho < 2 || alto < 2) return;

    registrarHistorial();

    const recorte = document.createElement('canvas');
    recorte.width = ancho;
    recorte.height = alto;
    const ctx = recorte.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(combinado, x, y, ancho, alto, 0, 0, ancho, alto);

    const img = new Image();
    img.onload = () => {
      imagenRef.current = img;
      valorCargadoRef.current = null;
      limpiarCapaDibujo();
      setSeleccion(null);
      setFiltros(filtrosNeutros());
      setRevision((actual) => actual + 1);
    };
    img.src = recorte.toDataURL('image/png');
  }, [combinarCapas, seleccion, registrarHistorial, limpiarCapaDibujo]);

  /** Aplica una captura combinada como nuevo estado (deshacer/rehacer). */
  const aplicarEstado = useCallback(
    (dataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        imagenRef.current = img;
        limpiarCapaDibujo();
        setSeleccion(null);
        setFiltros(filtrosNeutros());
        setImagenLista(true);
        setRevision((actual) => actual + 1);
      };
      img.src = dataUrl;
    },
    [limpiarCapaDibujo],
  );

  const deshacer = useCallback(() => {
    if (pilaDeshacerRef.current.length === 0) return;
    const actual = combinarCapas();
    if (actual) {
      try {
        pilaRehacerRef.current.push(actual.toDataURL('image/png'));
      } catch {
        // Si el canvas estuviera "tainted", se ignora el rehacer.
      }
    }
    const anterior = pilaDeshacerRef.current.pop();
    if (anterior) {
      aplicarEstado(anterior);
      setPuedeDeshacer(pilaDeshacerRef.current.length > 0);
      setPuedeRehacer(true);
    }
  }, [aplicarEstado, combinarCapas]);

  const rehacer = useCallback(() => {
    if (pilaRehacerRef.current.length === 0) return;
    const actual = combinarCapas();
    if (actual) {
      try {
        pilaDeshacerRef.current.push(actual.toDataURL('image/png'));
      } catch {
        // Ignorar si no se puede capturar.
      }
    }
    const siguiente = pilaRehacerRef.current.pop();
    if (siguiente) {
      aplicarEstado(siguiente);
      setPuedeRehacer(pilaRehacerRef.current.length > 0);
      setPuedeDeshacer(true);
    }
  }, [aplicarEstado, combinarCapas]);

  const aplicarCambios = useCallback(() => {
    if (!imagenLista) {
      onConfirmar(null);
      return;
    }
    try {
      const combinado = combinarCapas();
      if (!combinado) {
        onConfirmar(null);
        return;
      }
      onConfirmar(combinado.toDataURL('image/png'));
    } catch (e) {
      console.warn('[ImagenEditorCanvas] No se pudo exportar:', e);
      setError(
        'No se puede exportar la imagen editada. Intenta subir el archivo directamente.',
      );
    }
  }, [imagenLista, onConfirmar, combinarCapas]);

  const rotar = useCallback((grados: number) => {
    setFiltros((prev) => ({
      ...prev,
      rotacion: (prev.rotacion + grados) % 360,
    }));
  }, []);

  const ajusteFiltro = useCallback(
    <K extends keyof FiltrosImagen>(clave: K, valor: FiltrosImagen[K]) => {
      setFiltros((prev) => ({ ...prev, [clave]: valor }));
    },
    [],
  );

  const alternarGris = useCallback(() => {
    setFiltros((prev) => ({ ...prev, gris: !prev.gris }));
  }, []);

  const cambiarHerramienta = useCallback((clave: ModoHerramienta) => {
    setHerramienta(clave);
    if (clave !== 'seleccionar') setSeleccion(null);
  }, []);

  const botonHerramienta = (
    clave: ModoHerramienta,
    etiqueta: string,
    icono: React.ReactNode,
  ) => {
    const activa = herramienta === clave;
    return (
      <button
        type="button"
        onClick={() => cambiarHerramienta(clave)}
        disabled={desactivado || !imagenLista}
        className={activa ? BOTON_HERRAMIENTA_ACTIVA : BOTON_HERRAMIENTA_INACTIVA}
        title={etiqueta}
        aria-pressed={activa}
      >
        {icono}
      </button>
    );
  };

  const estiloSeleccion =
    seleccion && dimensionesCanvas.ancho > 0 && dimensionesCanvas.alto > 0
      ? {
          left: `${(seleccion.x / dimensionesCanvas.ancho) * 100}%`,
          top: `${(seleccion.y / dimensionesCanvas.alto) * 100}%`,
          width: `${(seleccion.w / dimensionesCanvas.ancho) * 100}%`,
          height: `${(seleccion.h / dimensionesCanvas.alto) * 100}%`,
        }
      : undefined;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      {/* Barra de herramientas principal */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-gray-600 uppercase">
          Editor Paint
        </label>

        <input
          type="file"
          accept="image/*"
          onChange={manejarArchivo}
          disabled={desactivado}
          className="block w-full text-sm text-gray-700
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100
            cursor-pointer"
        />

        <div className="flex flex-wrap gap-1">
          {botonHerramienta(
            'pincel',
            'Pincel',
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>,
          )}
          {botonHerramienta(
            'borrador',
            'Borrador (pinta blanco)',
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>,
          )}
          {botonHerramienta(
            'linea',
            'Línea',
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M4 20L20 4"
              />
            </svg>,
          )}
          {botonHerramienta(
            'rectangulo',
            'Rectángulo',
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M4 7v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2z"
              />
            </svg>,
          )}
          {botonHerramienta(
            'circulo',
            'Círculo',
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M3 12a9 9 0 1118 0 9 9 0 01-18 0z"
              />
            </svg>,
          )}
          {botonHerramienta(
            'texto',
            'Texto',
            <span className="text-sm font-bold">T</span>,
          )}
          {botonHerramienta(
            'mover',
            'Mover imagen',
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M12 3v18m0-18l-3 3m3-3l3 3M12 21l-3-3m3 3l3-3M3 12h18m-18 0l3-3m-3 3l3 3m15-3l-3-3m3 3l-3 3"
              />
            </svg>,
          )}
          {botonHerramienta(
            'seleccionar',
            'Seleccionar y mover texto/trazos',
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M4 4h6M4 4v6m16-6h-6m6 0v6M4 20h6m-6 0v-6m16 6h-6m6 0v-6"
              />
            </svg>,
          )}
        </div>

        <div className="flex items-center gap-2 border-l border-gray-200 pl-2">
          <button
            type="button"
            onClick={() => recortarSeleccion()}
            disabled={desactivado || !imagenLista || !seleccion}
            className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm"
            title="Recortar la selección"
          >
            ✂ Recortar
          </button>
          {seleccion && (
            <span className="text-[10px] text-gray-500">
              Arrastra dentro de la selección para moverla
            </span>
          )}
        </div>

        <div className="flex gap-1 border-l border-gray-200 pl-2">
          <button
            type="button"
            onClick={deshacer}
            disabled={desactivado || !puedeDeshacer}
            className="px-3 py-1.5 rounded-md border border-transparent text-gray-600 hover:bg-gray-100 disabled:opacity-50 text-sm"
            title="Deshacer"
            aria-label="Deshacer"
          >
            ↩
          </button>
          <button
            type="button"
            onClick={rehacer}
            disabled={desactivado || !puedeRehacer}
            className="px-3 py-1.5 rounded-md border border-transparent text-gray-600 hover:bg-gray-100 disabled:opacity-50 text-sm"
            title="Rehacer"
            aria-label="Rehacer"
          >
            ↪
          </button>
        </div>
      </div>

      {/* Color, grosor, relleno y filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">
            Color
          </label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={desactivado || !imagenLista}
            className="w-12 h-10 rounded-md border-none bg-transparent cursor-pointer"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">
            Grosor
          </label>
          <input
            type="range"
            min="1"
            max="80"
            value={grosor}
            onChange={(e) => setGrosor(Number(e.target.value))}
            disabled={desactivado || !imagenLista}
            className={CONTROL_CLASSE}
          />
          <span className="text-[10px] text-gray-500">{grosor} px</span>
        </div>
        <div>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase">
            <input
              type="checkbox"
              checked={relleno}
              onChange={(e) => setRelleno(e.target.checked)}
              disabled={
                desactivado ||
                !imagenLista ||
                (herramienta !== 'rectangulo' && herramienta !== 'circulo')
              }
              className="rounded border-gray-300 text-blue-600"
            />
            Relleno de figuras
          </label>
          <p className="text-[10px] text-gray-500 mt-1">Rectángulos y círculos</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">
            Filtros
          </label>
          <button
            type="button"
            onClick={() => setFiltros(filtrosNeutros())}
            disabled={desactivado || !imagenLista}
            className="w-full py-1.5 rounded-md border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Restablecer filtros
          </button>
        </div>
      </div>

      {/* Sliders de filtros de imagen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-gray-700">Brillo</span>
            <span className="text-gray-500">{filtros.brillo}</span>
          </div>
          <input
            type="range"
            min="-100"
            max="100"
            value={filtros.brillo}
            onChange={(e) => ajusteFiltro('brillo', Number(e.target.value))}
            disabled={desactivado || !imagenLista}
            className={CONTROL_CLASSE}
          />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-gray-700">Contraste</span>
            <span className="text-gray-500">{filtros.contraste}</span>
          </div>
          <input
            type="range"
            min="-100"
            max="100"
            value={filtros.contraste}
            onChange={(e) => ajusteFiltro('contraste', Number(e.target.value))}
            disabled={desactivado || !imagenLista}
            className={CONTROL_CLASSE}
          />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-gray-700">Saturación</span>
            <span className="text-gray-500">{filtros.saturacion}</span>
          </div>
          <input
            type="range"
            min="-100"
            max="100"
            value={filtros.saturacion}
            onChange={(e) => ajusteFiltro('saturacion', Number(e.target.value))}
            disabled={desactivado || !imagenLista}
            className={CONTROL_CLASSE}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={filtros.gris}
            onChange={alternarGris}
            disabled={desactivado || !imagenLista}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Escala de grises
        </label>

        <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-xs font-semibold uppercase text-gray-600">Zoom</span>
          <button
            type="button"
            onClick={() => setZoom((actual) => Math.max(50, actual - 10))}
            disabled={desactivado || !imagenLista}
            className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            aria-label="Alejar"
          >
            −
          </button>
          <span className="min-w-12 text-center text-xs text-gray-600">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((actual) => Math.min(300, actual + 10))}
            disabled={desactivado || !imagenLista}
            className="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
            aria-label="Acercar"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            disabled={desactivado || !imagenLista}
            className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 disabled:opacity-50"
          >
            Restablecer
          </button>
        </div>
      </div>

      {/* Botones de rotación */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => rotar(-90)}
          disabled={desactivado || !imagenLista}
          className="flex-1 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          title="Rotar izquierda"
        >
          ↺ Rotar izquierda
        </button>
        <button
          type="button"
          onClick={() => rotar(90)}
          disabled={desactivado || !imagenLista}
          className="flex-1 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          title="Rotar derecha"
        >
          ↻ Rotar derecha
        </button>
      </div>

      {/* Lienzo */}
      <div className="flex items-start justify-center bg-gray-100 rounded-xl border border-gray-200 min-h-[400px] p-3 overflow-auto">
        {imagenLista ? (
          <div
            className="relative mx-auto bg-white shadow-lg"
            style={{
              width: `${zoom}%`,
              aspectRatio:
                dimensionesCanvas.ancho > 0 && dimensionesCanvas.alto > 0
                  ? `${dimensionesCanvas.ancho} / ${dimensionesCanvas.alto}`
                  : '4 / 3',
            }}
          >
            <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
            <canvas
              ref={canvasDibujoRef}
              className="absolute inset-0 block h-full w-full touch-none cursor-crosshair"
              onPointerDown={comenzarTrazo}
              onPointerMove={moverTrazo}
              onPointerUp={terminarTrazo}
              onPointerCancel={cancelarTrazo}
            />
            {seleccion && estiloSeleccion && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-blue-600 bg-blue-500/10"
                style={estiloSeleccion}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
            {cargandoImagen ? (
              <>
                <p className="text-sm">Cargando imagen…</p>
                <p className="text-[10px]">Preparando el lienzo</p>
              </>
            ) : (
              <>
                <p className="text-sm">Sin imagen cargada</p>
                <p className="text-[10px]">Selecciona una imagen para editarla</p>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Leyenda de herramienta activa */}
      {!desactivado && imagenLista && (
        <p className="text-[10px] text-gray-500 italic text-center">
          {herramienta === 'pincel' && 'Pincel: arrastra para dibujar'}
          {herramienta === 'borrador' && 'Borrador: arrastra para tapar con blanco'}
          {herramienta === 'linea' && 'Línea: clic y arrastra'}
          {herramienta === 'rectangulo' && 'Rectángulo: clic y arrastra'}
          {herramienta === 'circulo' && 'Círculo: clic y arrastra'}
          {herramienta === 'texto' && 'Texto: haz clic donde quieras insertarlo'}
          {herramienta === 'mover' && 'Mover: arrastra la imagen dentro del lienzo'}
          {herramienta === 'seleccionar' &&
            'Seleccionar: arrastra para marcar un área. Arrastra dentro de la selección para mover el texto o los trazos; usa "Recortar" para recortar la imagen.'}
        </p>
      )}

      {/* Acciones */}
      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={() => {
            if (onCancelar) onCancelar();
            else onConfirmar(null);
          }}
          disabled={desactivado}
          className="flex-1 py-2 px-4 rounded-md font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={aplicarCambios}
          disabled={desactivado || !imagenLista}
          className="flex-1 py-2 px-4 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {etiquetaConfirmar}
        </button>
      </div>
    </div>
  );
}
