# BeyondRead

Un experimento artístico minimalista. Elegís un poema, activás tu cámara, y lo leés
mientras las palabras se van iluminando a tu ritmo. Detrás tuyo, ves al lector
anterior leyendo el mismo poema — tu lectura queda grabada para el próximo.

Una posta infinita de gente reaccionando al mismo texto.

## Cómo funciona

1. **Elegís un poema** en la pantalla de inicio (tres poemas cortos en `poems/`).
2. **Activás la cámara.** Tu video se atenúa para que el texto resalte.
3. **Leés** mientras las palabras se iluminan una por una — modo automático al
   ritmo de lectura, o navegación manual con las flechas.
4. Detrás tuyo se reproduce **la lectura anterior de ese mismo poema** (si existe
   una — la primera persona en leer un poema no ve nada detrás, solo su cámara).
5. Al terminar, tu lectura se graba y queda disponible para el próximo lector.
   Volvés a la pantalla de inicio.

## Controles durante la lectura

| Tecla | Efecto |
|---|---|
| `→` | Palabra siguiente (pasa a modo manual) |
| `←` | Palabra anterior (pasa a modo manual) |
| `espacio` | Pausa / retoma el modo automático |

## Almacenamiento efímero y auto-balanceado

Los videos no se guardan indefinidamente. Cada video grabado tiene un número
limitado de reproducciones (1 a 3) antes de borrarse, calculado según la demanda
actual de ese poema — cuantos más lectores activos tenga un poema, menos
reproducciones se le asignan a cada video nuevo. Esto mantiene el almacenamiento
acotado sin necesidad de un límite fijo ni de un cron externo:

- Máximo 5 videos activos por poema (el más viejo se evict-ea si se supera).
- Cada video nuevo recibe `clamp(4 − videos_activos, 1, 3)` reproducciones.
- Al agotarse las vistas, el video entra en un período de gracia de 10 minutos
  (por si el lector actual todavía lo está viendo) y luego se borra.
- Un respaldo por edad máxima (24hs) limpia cualquier video huérfano.

Toda esta lógica vive detrás de una interfaz `VideoStorage` (`lib/storage/`) con
una única implementación local (sistema de archivos, en `data/videos/` +
`data/meta.json`, ambos gitignored). Para producción en Vercel, la investigación
apunta a **Cloudflare R2** (egress gratis, ideal para reproducciones repetidas)
en vez de Vercel Blob (sin expiración nativa) — pero esa integración todavía no
está implementada; solo se dejó la interfaz lista para el swap.

## Stack

Next.js (App Router) + TypeScript. Sin librerías de UI. Tipografía Cormorant
Garamond autohospedada vía `next/font`. Grabación con `MediaRecorder`
(`video/webm`, códecs `vp8`/`opus`). Sin autenticación, sin cuentas — todo es
anónimo y efímero por diseño.

## Correr localmente

```bash
npm install
npm run dev
```

Por defecto usa el puerto reservado para este agente en el registro de puertos
del Local Agent Society (`las ports claim`). Para forzar un puerto específico:

```bash
PORT=9005 npm run dev
```

Abrí `http://localhost:9005` (o el puerto que hayas elegido) y concedé permisos
de cámara cuando el navegador lo pida.

## Tests

```bash
npm test
```

Cubre la tokenización de poemas, el algoritmo de timing de la lectura automática,
y la lógica de reclamo/evicción/expiración de videos (la parte más delicada del
sistema, dado que corre con escrituras concurrentes).

## Estructura

```
poems/                  poemas fuente (texto plano, se tokenizan al vuelo)
lib/
  tokenize.ts            texto -> palabras con metadata de línea/estrofa
  timing.ts               algoritmo de duración por palabra (lectura automática)
  poems.ts                 lectura de poems/*.txt
  meta.ts                  registro de videos: reclamo, evicción, sweep
  storage/                 interfaz VideoStorage + implementación en filesystem
app/
  page.tsx                 selector de poemas
  read/[poemId]/page.tsx   página de lectura
  api/sessions             reclama un video de posta para la sesión
  api/recordings           sube la grabación al terminar de leer
  api/videos/[id]          sirve el video (con soporte de Range)
components/               UI cliente: escenario de lectura, texto karaoke,
                           fondo de video relay, hooks de cámara/grabación/ritmo
```

## Qué falta para producción

- Integración real con Cloudflare R2 (o equivalente) para reemplazar el
  filesystem local.
- Configuración de deploy en Vercel.
- Nada de esto está hecho todavía — el proyecto corre solo local por ahora,
  a propósito.
