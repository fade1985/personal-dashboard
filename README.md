# Mi dashboard personal

Dashboard para llevar la vida en general: calendario, correo, tiempo y colección de amiibos.
Hecho con Vite + React + TypeScript; todo corre en el navegador y los datos se guardan en `localStorage`.

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

## Conectar Google (Calendar + Gmail)

Solo lectura, sin backend: el token OAuth vive en la sesión del navegador.

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto.
2. **APIs y servicios → Biblioteca**: habilita **Google Calendar API** y **Gmail API**.
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

## Datos

Todo lo local (colección de amiibos, eventos, ciudades) se guarda en `localStorage` con prefijo `pd:`.
Haz copias de la colección con **Amiibos → Exportar** y de las finanzas con el botón de descarga de **Bancos y gastos**.
