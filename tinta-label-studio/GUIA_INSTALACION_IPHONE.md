# Tinta Studio 1.2 — Guía de instalación en iPhone

## Antes de nada

**Tinta Studio es una app web instalable (PWA), no un archivo `.ipa` de iOS.**
El ZIP contiene el código de la app; no se abre directamente en el iPhone como una aplicación.
Hay que publicarlo **una vez** en una dirección HTTPS. Después podrás abrirlo desde Safari y añadirlo a la pantalla de inicio, sin App Store ni jailbreak. La primera publicación se hace cómodamente desde un ordenador Windows.

La versión 1.2 incluye perfil **NIIMBOT D11-H a 300 ppp** por defecto, perfil **D11 tradicional a 203 ppp**, papel rectangular de 30 × 12 mm y dos círculos troquelados sobre soporte de 28 × 14 mm (rollo 10047). El diámetro circular de 13 mm es una estimación ajustable. **No imprime por Bluetooth**; genera y guarda los diseños, y exporta PNG.

## Paso 1. Descargar y descomprimir

1. Descarga el ZIP `Tinta_Studio_iPhone_v1.2_300ppp.zip` desde ChatGPT en tu **ordenador**.
2. En Windows 11, clic derecho sobre el archivo → **Extraer todo**.
3. Entra en la carpeta `tinta-label-studio`. Verás, entre otros: `api`, `public`, `package.json`, `vercel.json` y `GUIA_INSTALACION_IPHONE.md`. **No subas el ZIP cerrado a GitHub**.

## Paso 2. Publicar el código con GitHub

1. Entra en [github.com](https://github.com), inicia sesión o crea una cuenta.
2. Crea un repositorio nuevo (**New repository**), por ejemplo `tinta-studio-iphone`, y selecciona **Private**.
3. Abre el repositorio nuevo y busca **uploading an existing file** o **Add file → Upload files**.
4. Arrastra allí **el contenido de la carpeta `tinta-label-studio`**, incluyendo las carpetas `public` y `api`. Es importante que `package.json` y `vercel.json` queden en la raíz del repositorio, no dentro de una carpeta extra.
5. Pulsa **Commit changes** para guardar la subida.

## Paso 3. Conectar el repositorio a Vercel

1. Entra en [vercel.com/new](https://vercel.com/new). Crea una cuenta o inicia sesión con GitHub.
2. En **Import Git Repository**, elige `tinta-studio-iphone` y pulsa **Import**.
3. Selecciona **Framework Preset → Other**.
4. Deja **Root Directory** en la raíz (`./`), **Build Command** vacío y **Output Directory** en `public` (normalmente se detecta).
5. Pulsa **Deploy**. Vercel mostrará tu propia dirección HTTPS, por ejemplo `https://nombre-elegido.vercel.app` (el nombre real lo da Vercel).

## Paso 4. Activar la creación de imágenes con OpenAI

Si solo quieres abrir la interfaz, usar la biblioteca y componer diseños desde imágenes previas, puedes consultar la app sin clave. Para **Generar con IA** necesitas:

1. Una cuenta con facturación API habilitada en [platform.openai.com](https://platform.openai.com). La API de OpenAI se factura **aparte de ChatGPT Pro**.
2. Crear tu clave en [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Guárdala en privado.
3. En Vercel abre el proyecto → **Settings → Environment Variables**.
4. Añade una variable llamada **`OPENAI_API_KEY`** y como valor pega tu clave (entorno **Production**).
5. Añade otra variable llamada **`APP_PASSWORD`** y como valor escribe una **contraseña privada y larga** que tú elijas (también en Production).
6. Guarda. Después ve a **Deployments → ··· → Redeploy**, para activar ambas variables en el servidor.

**Nunca pongas `OPENAI_API_KEY` en GitHub, en el formulario de contraseña de Tinta Studio ni en un mensaje.** Solo se guarda como variable privada del servidor en Vercel.

## Paso 5. Instalarla en el iPhone (Safari)

1. En el iPhone abre **Safari**.
2. Escribe la dirección `https://...vercel.app` que te facilitó Vercel.
3. Abre la página de Tinta Studio y verifica que la interfaz funciona.
4. Pulsa el botón de **Compartir** de Safari (cuadrado con flecha hacia arriba, o primero el menú de página).
5. Busca **Añadir a pantalla de inicio**. Si no aparece, al final de la lista pulsa **Editar acciones** para mostrarla.
6. Si aparece, activa **Abrir como app web** y pulsa **Añadir**.
7. Verás un icono llamado **Tinta Studio** en la pantalla de inicio. Tócalo para abrir la app.

> No es una instalación nativa desde App Store: es una web app que funciona a pantalla completa. Sin conexión puedes consultar diseños guardados en ese dispositivo; para nuevas imágenes hace falta Internet.

## Paso 6. Primer uso

1. Abre **Ajustes** en Tinta Studio, escribe la contraseña de `APP_PASSWORD` y pulsa **Comprobar conexión**.
2. Vuelve a **Diseñar**.
3. En modelo de impresora elige **D11-H (300 ppp)** si ese es el modelo que tienes. Si la etiqueta de tu impresora indica **D11** sin H, revisa la resolución; el modelo convencional es de **203 ppp**.
4. Selecciona el papel **30 × 12 mm** o **2 círculos · 14 × 28 mm (ID 10047)**. En el segundo caso, la zona útil son **dos círculos** sobre un soporte rectangular, no dos rectángulos.
5. Escribe lo que quieres crear y pulsa **Generar con IA**.
6. Modifica el diseño, toca **Guardar diseño** para conservarlo en tu biblioteca y **Exportar PNG** para guardarlo en Archivos.
7. Usa **Exportar copia** desde la biblioteca periódicamente, pues los datos locales pueden perderse si borras la web app o sus datos.

## Resolución y tamaños

Las impresoras térmicas se especifican en **ppp / DPI (puntos por pulgada)**, no en megapíxeles.

| Papel | 203 ppp | 300 ppp |
| --- | ---: | ---: |
| 30 × 12 mm | 240 × 96 px | 354 × 142 px |
| 28 × 14 mm, dos círculos | 224 × 112 px | 331 × 165 px |
| Círculo Ø 13 mm | 104 × 104 px aprox. | 154 × 154 px aprox. |

El PNG exportado incluye el metadato de densidad del estándar PNG (`pHYs`). La opción **doble resolución** exporta el doble de ppp solo para archivo/edición: **no convierte una D11-H de 300 en una impresora de 600 ppp**. Cuando más adelante se añada la impresión habrá que calibrar los márgenes, el troquel y el posicionamiento del rollo.

## ¿Puedo abrirla solo en el ordenador, sin publicarla?

Sí, para probarla localmente:

1. Instala [Node.js 20 o superior](https://nodejs.org/) en Windows.
2. Abre la carpeta que contiene `package.json` en el Explorador y escribe `cmd` en la barra de dirección para abrir una terminal allí.
3. Ejecuta `npm run dev`.
4. Abre `http://localhost:4173` en el navegador del ordenador.

La interfaz funcionará, pero la IA requiere configurar antes el archivo `.env.local` con `OPENAI_API_KEY` y `APP_PASSWORD` siguiendo `.env.example`.

## Si la instalación falla

- **Safari no ve la web:** revisa que hayas abierto la dirección HTTPS real facilitada por Vercel y que el desplegado se haya completado correctamente.
- **No funciona Generar con IA:** revisa la clave, la facturación API, `APP_PASSWORD` y que hayas hecho **Redeploy** después de guardar las variables.
- **No aparece Añadir a pantalla de inicio:** usa Safari, no el navegador integrado de otra app. Revisa **Compartir → Editar acciones**.
- **No se ven cambios tras actualizar la app:** cierra Tinta Studio y vuelve a abrirla; con la versión 1.2 se invalida la caché anterior.
- **La imagen queda borrosa o se corta:** confirma tamaño, DPI del modelo real y diámetro del troquel. Exportar un PNG a más ppp no mejora una impresora con cabezal de menor resolución.
