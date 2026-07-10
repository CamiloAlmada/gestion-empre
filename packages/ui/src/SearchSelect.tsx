import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { normalizarBusqueda as normalizar } from './normalizarBusqueda';

export interface OpcionSearchSelect {
  id: string;
  etiqueta: string;
}

export interface SearchSelectProps {
  label: string;
  opciones: OpcionSearchSelect[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

function idOpcion(baseId: string, opcionId: string): string {
  return `${baseId}-opcion-${opcionId}`;
}

/**
 * Combobox accesible (patrón WAI-ARIA combobox + listbox, filtrado, un solo
 * valor). El input funciona como buscador: filtra `opciones` por texto
 * (case/acentos-insensible), navega con flechas, confirma con Enter, cierra
 * con Escape o al hacer click afuera.
 *
 * `onChange` se dispara al confirmar una opción (`id`) o al vaciar el campo
 * de texto por completo (`null`, limpia la selección). Mientras el usuario
 * está tipeando para filtrar sin haber confirmado nada, no se dispara
 * `onChange` — recién al seleccionar.
 */
export function SearchSelect({
  label,
  opciones,
  value,
  onChange,
  placeholder,
  disabled = false,
}: SearchSelectProps) {
  const id = useId();
  const listboxId = `${id}-listbox`;
  const contenedorRef = useRef<HTMLDivElement>(null);
  const enfocadoRef = useRef(false);

  const opcionSeleccionada = useMemo(
    () => opciones.find((o) => o.id === value) ?? null,
    [opciones, value],
  );

  const [texto, setTexto] = useState(opcionSeleccionada?.etiqueta ?? '');
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const opcionesRef = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (enfocadoRef.current) return;
    setTexto(opcionSeleccionada?.etiqueta ?? '');
  }, [opcionSeleccionada]);

  const opcionesFiltradas = useMemo(() => {
    const consulta = normalizar(texto);
    if (consulta === '') return opciones;
    return opciones.filter((o) => normalizar(o.etiqueta).includes(consulta));
  }, [opciones, texto]);

  useEffect(() => {
    function alClickAfuera(e: MouseEvent) {
      if (!contenedorRef.current?.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', alClickAfuera);
    return () => document.removeEventListener('mousedown', alClickAfuera);
  }, []);

  // Mantiene visible la opción activa cuando se navega con flechas en listas
  // largas (max-h-64 + overflow-y-auto): sin esto, bajar con ArrowDown puede
  // dejar la opción resaltada fuera del área visible.
  useEffect(() => {
    if (!abierto || indiceActivo < 0) return;
    const opcionActiva = opcionesFiltradas[indiceActivo];
    if (!opcionActiva) return;
    // Optional chaining también sobre la llamada: jsdom (entorno de test) no
    // implementa `scrollIntoView` en todas sus versiones; no debe romper.
    opcionesRef.current.get(opcionActiva.id)?.scrollIntoView?.({ block: 'nearest' });
  }, [abierto, indiceActivo, opcionesFiltradas]);

  function seleccionar(opcion: OpcionSearchSelect) {
    onChange(opcion.id);
    setTexto(opcion.etiqueta);
    setAbierto(false);
    setIndiceActivo(-1);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nuevo = e.target.value;
    setTexto(nuevo);
    setAbierto(true);
    setIndiceActivo(nuevo.trim() === '' ? -1 : 0);
    if (nuevo.trim() === '') {
      onChange(null);
    }
  }

  function handleFocus() {
    enfocadoRef.current = true;
    setAbierto(true);
  }

  function handleBlur() {
    enfocadoRef.current = false;
    // El cierre real ocurre por el listener de click afuera (para no correr
    // antes que el click/mousedown de una opción registre la selección);
    // acá solo revertimos el texto si quedó una búsqueda sin confirmar.
    setTexto(opcionSeleccionada?.etiqueta ?? '');
    setAbierto(false);
    setIndiceActivo(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
      }
      setIndiceActivo((i) => (opcionesFiltradas.length === 0 ? -1 : Math.min(i + 1, opcionesFiltradas.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceActivo((i) => (opcionesFiltradas.length === 0 ? -1 : Math.max(i - 1, 0)));
    } else if (e.key === 'Enter') {
      if (abierto && indiceActivo >= 0 && indiceActivo < opcionesFiltradas.length) {
        e.preventDefault();
        seleccionar(opcionesFiltradas[indiceActivo]!);
      }
    } else if (e.key === 'Escape') {
      if (abierto) {
        // Escape con la lista abierta la cierra a ELLA, nada más: no debe
        // burbujear ni disparar el cierre de un contenedor ancestro (ej. un
        // <Modal> basado en <dialog>, que escucha Escape para cerrarse).
        // stopPropagation frena listeners JS en ancestros (React o DOM);
        // preventDefault frena además el "cancel" nativo del <dialog>, que
        // el user agent asocia al keydown de Escape vía CloseWatcher (si el
        // keydown que lo originó llega con defaultPrevented, no cancela).
        // Si la lista YA está cerrada, Escape no hace nada acá y sigue su
        // curso normal (ej. para que el Modal sí pueda cerrarse).
        e.stopPropagation();
        e.preventDefault();
      }
      setAbierto(false);
      setIndiceActivo(-1);
      setTexto(opcionSeleccionada?.etiqueta ?? '');
    }
  }

  const activeDescendant =
    abierto && indiceActivo >= 0 && opcionesFiltradas[indiceActivo]
      ? idOpcion(id, opcionesFiltradas[indiceActivo]!.id)
      : undefined;

  return (
    <div className="relative flex flex-col gap-1" ref={contenedorRef}>
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        type="text"
        autoComplete="off"
        value={texto}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-control border border-borde bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:bg-fondo disabled:text-texto-secundario"
      />
      {abierto && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-control border border-borde bg-superficie py-1 shadow-flotante"
        >
          {opcionesFiltradas.length === 0 ? (
            <li className="px-3 py-2 text-sm text-texto-secundario">Sin resultados.</li>
          ) : (
            opcionesFiltradas.map((opcion, i) => (
              <li
                key={opcion.id}
                ref={(el) => {
                  if (el) opcionesRef.current.set(opcion.id, el);
                  else opcionesRef.current.delete(opcion.id);
                }}
                id={idOpcion(id, opcion.id)}
                role="option"
                aria-selected={opcion.id === value}
                // onMouseDown (no onClick) + preventDefault: evita que el
                // blur del input cierre la lista antes de registrar el click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  seleccionar(opcion);
                }}
                className={`min-h-11 cursor-pointer px-3 py-2 text-texto ${
                  i === indiceActivo ? 'bg-primary-600 text-white' : ''
                } ${opcion.id === value && i !== indiceActivo ? 'font-semibold' : ''}`}
              >
                {opcion.etiqueta}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
