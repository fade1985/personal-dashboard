# Mi dashboard personal

Dashboard para llevar la vida en general: calendario, correo, tiempo y colección de amiibos.
Hecho con Vite + React + TypeScript; todo corre en el navegador, los datos se guardan en `localStorage`
y, si conectas Google, se sincronizan entre dispositivos con tu Google Drive.

## Arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:5173

## Secciones

| Sección | Qué hace | Fuente |
| --- | --- | --- |
| **Inicio** | Reloj, tiempo en Madrid y donde estés, agenda de 7 días, Gmail y progreso de amiibos | — |
| **Calendario** | Vista mensual con eventos de Google Calendar + eventos, cumpleaños (anuales) y avisos locales | Google Calendar API |
| **El tiempo** | Actual, 7 días y gráfico hora a hora. Madrid, tu ubicación y ciudades que añadas | [Open-Meteo](https://open-meteo.com) (sin key) |
| **Bancos y gastos** | Patrimonio neto, ingresos/gastos por mes, gasto por categoría, cuentas e inversiones, movimientos con reglas de categorías | CSV/Excel exportado por cada banco |
| **Juegos** | Juegos pasados (por año, con nota y horas), pendientes, jugando y por salir; los lanzamientos van al calendario y avisan al salir | [RAWG](https://rawg.io/apidocs) (key gratis) |
| **Amiibos** | Catálogo completo, marcar los que tienes / deseas, en caja, precio y notas, progreso por serie, exportar/importar JSON | [AmiiboAPI](https://www.amiiboapi.org) |

Próximamente: gym, recetas, tareas del hogar.

## Bancos y gastos

Descarga los movimientos desde la web de cada banco (Excel o CSV) y arrástralos a la sección.
El importador detecta la fila de cabeceras, la cuenta (por el nombre del archivo) y qué columna es cada dato;
el mapeo se recuerda por cuenta y reimportar el mismo archivo no duplica movimientos.

- Las categorías se ponen solas con reglas por palabra clave. Al cambiar una a mano puedes guardar una regla
  ("si contiene *zara* → Ocio") que se aplica a los parecidos y a los que importes después.
- *Traspasos* e *Inversión* no cuentan como gasto (pagar la tarjeta, mandar dinero a Trade Republic…).
- Para inversiones (Wise, Trade Republic) anota el valor y lo aportado en el lápiz de la cuenta; cada actualización
  queda en el histórico.
- El ojo de arriba difumina los importes.

## Juegos

Sin configurar nada puedes apuntar juegos a mano (con fecha de salida opcional). Para buscar con portada,
plataformas y fechas de lanzamiento automáticas:

1. Crea una cuenta en https://rawg.io/apidocs y pide una API key (gratis, 20.000 peticiones/mes).
2. Añádela a `.env.local` **sin** prefijo `VITE_` (la usa el proxy del servidor de Vite y no llega al navegador):
   ```
   RAWG_KEY=tu_clave
   ```
3. Reinicia `npm run dev`.

Los juegos que apuntas antes de que salgan aparecen en el calendario el día de su lanzamiento. Una vez al día
se vuelve a consultar su fecha en RAWG (cambian a menudo), y cuando salen verás un aviso en Inicio y en Juegos
(y una notificación del navegador si la activas).

## Conectar Google (Calendar, Gmail y Drive)

Sin backend: el token OAuth vive en la sesión del navegador. Calendar y Gmail son solo lectura; de Drive solo se usa
la carpeta oculta de la app (no puede ver el resto de tus archivos).

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto.
2. **APIs y servicios → Biblioteca**: habilita **Google Calendar API**, **Gmail API** y **Google Drive API**.
3. Abre **Google Auth Platform** (menú ☰ → *APIs y servicios* → *Pantalla de consentimiento de OAuth*, o directamente
   https://console.cloud.google.com/auth/overview) y pulsa **Comenzar**:
   - Información de la app: un nombre (p. ej. "Mi dashboard") y tu email de asistencia.
   - Público: **Externo**.
   - Información de contacto: tu email → acepta y **Crear**.
4. En el menú izquierdo, **Público** (https://console.cloud.google.com/auth/audience) → *Usuarios de prueba* → **Add users** → tu Gmail.
5. **Clientes** (https://console.cloud.google.com/auth/clients) → **Crear cliente** → tipo *Aplicación web*.
   - Orígenes de JavaScript autorizados: `http://localhost:5173`
   - URI de redireccionamiento autorizados: `http://localhost:5173` (exactamente así, sin barra final)
6. Copia `.env.example` a `.env.local` y pega el Client ID:
   ```
   VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```
7. Reinicia `npm run dev` y pulsa **Conectar Google** en la barra lateral.

> Mientras la app esté en modo "Prueba" en Google, el permiso caduca cada 7 días y habrá que volver a conectar.

## Desplegar en Vercel

1. **Variables de entorno** (Project → Settings → Environment Variables), para *Production* y *Preview*:
   - `VITE_GOOGLE_CLIENT_ID`: el mismo Client ID que en local.
   - `RAWG_KEY`: la clave de RAWG. La usa la función `api/rawg.ts`, que hace de proxy como el servidor de Vite en local.
2. **Redeploy** (Deployments → ⋯ → Redeploy): las variables se aplican al compilar, así que un deploy anterior no las ve.
3. **Google Cloud** → Clientes → tu cliente web: añade la URL de Vercel (p. ej. `https://mi-dashboard.vercel.app`)
   en *Orígenes de JavaScript autorizados* **y** en *URI de redireccionamiento autorizados*, sin barra final.
   Los cambios pueden tardar unos minutos en aplicarse.

Los datos de `localStorage` son por dominio, pero con Google conectado en los dos sitios se sincronizan solos por Drive
(ver [Datos y sincronización](#datos-y-sincronización)). Sin Google: **Exportar** en `localhost` → **Importar** en Vercel.

## Datos y sincronización

Todo se guarda en `localStorage` con prefijo `pd:`. Con Google conectado, los datos también se guardan en un archivo
(`mi-dashboard.json`) en la carpeta privada de la app en tu Google Drive, y así los ves igual en el PC, el móvil, `localhost` y Vercel.

- Se sincroniza al abrir el dashboard, unos segundos después de cada cambio, al volver a la pestaña y cada 5 minutos.
  El estado aparece debajo del botón de Google, con un botón para sincronizar a mano.
- Cada dato (colección de amiibos, movimientos, reglas, juegos, eventos, ciudades…) se sincroniza por separado y gana
  la versión que se cambió más tarde. Si editas lo mismo en dos sitios a la vez, se queda la última.
- Sin conexión no se pierde nada: los cambios esperan y se suben en la siguiente sincronización.
- La primera vez que sincronizas un navegador que ya tenía datos distintos de los de Drive, te pregunta con cuáles quedarte.
- No viajan la sesión de Google, las cachés ni las preferencias de vista (filtros de amiibos, ciudad seleccionada, tu ubicación).
- Si ya tenías Google conectado de antes, pulsa **reconecta** debajo del botón de Google para dar el permiso de Drive.

**Exportar / Importar** (abajo en la barra lateral) siguen sirviendo como copia de seguridad manual: lo que importas
cuenta como cambio nuevo y se sube a Drive. También hay copias propias en **Amiibos → Exportar** y en el botón de descarga
de **Bancos y gastos**.
