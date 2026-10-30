# Tinta Studio 1.3 — etiquetas térmicas con OpenAI

## Novedades de la versión 1.3 (30 de octubre de 2026)

Interfaz reorganizada para iPhone: el formato de papel, el nombre, las instrucciones y **Generar** quedan primero. El acabado y la calibración se abren bajo **Ajustes avanzados**.

- **Propuestas opcionales:** 1 por defecto, o 2 y 4; el coste de la API aumenta con la cantidad.
- **Refinar con instrucciones:** cambios concretos sobre la ilustración anterior, recordando las indicaciones recientes.
- **Editor por capas:** textos, círculos, estrellas e imágenes; mover, rotar, escalar, duplicar y reordenar; transformar también la ilustración principal.
- **Biblioteca:** categorías, palabras clave de búsqueda, filtros, favoritos e historial de hasta seis versiones anteriores.
- **Enviar a imprimir:** compartir PNG desde iOS cuando esté disponible; no realiza impresión Bluetooth directa en Safari.
- **Calidad:** pruebas de exportación, servidor, variantes y prueba móvil automatizada con IA simulada.

Compatibilidad de perfiles: NIIMBOT D11-H 300 ppp y D11 203 ppp, rectangulares 30×12 mm, soporte 28×14 mm con dos círculos Ø13 mm estimados (ID 10047).

Dirección de producción: https://tinta-studio-public-git-main-lukiguri.vercel.app/

**Privacidad y límites:** los diseños se guardan localmente y no se sincronizan entre dispositivos. Exporta una copia JSON antes de borrar/reinstalar la PWA. La generación IA real requiere claves configuradas en Vercel y facturación API propia; las pruebas no gastan saldo. Safari en iPhone no ofrece Web Bluetooth nativo: la impresión directa requeriría una app iOS y acceso al protocolo/SDK de NIIMBOT.

---

Aplicación web progresiva (PWA) diseñada para funcionar en iPhone como una app instalada desde Safari, sin pasar por la App Store. La versión inicial **no imprime**: el modelo de impresora es informativo y la salida se exporta como PNG.

## Qué puede hacer

- Selección de impresora: **NIIMBOT D11-H (300 ppp, predeterminada)**, **NIIMBOT D11 (203 ppp)**, D110 (203 ppp), B21, B1, Phomemo, Brother y otras. En perfiles conocidos, la resolución de exportación se actualiza al seleccionar el modelo.
- Etiquetas 30×12, 40×12, 50×15, 25×25 mm y medidas personalizadas entre 8 y 100 mm por lado; rotación.
- **Rollo 14×28 mm (ID 10047, D Series): dos pegatinas circulares troqueladas sobre el soporte rectangular.** Vista previa con troqueles, guías de seguridad, exportación PNG de las dos etiquetas sobre el soporte y PNG de un círculo individual, duplicar ilustración o asignar texto distinto al segundo círculo.
- Texto, instrucciones creativas, estilo gráfico y hasta 3 fotografías de referencia desde el iPhone.
- Generación real de imágenes con **GPT Image 2.5 Flare** o **Sunburst**, y tres calidades.
- Revisión de la ilustración previa con nuevas instrucciones usando Image Edits.
- Dos modos de lettering: **texto exacto editable** (superpuesto por el navegador) o **texto artístico** (generado por IA; no siempre acierta con las letras).
- Vista previa a escala proporcional, guía de márgenes, arrastrar el nombre.
- PNG con dimensiones en píxeles calculadas a partir de milímetros y ppp; incluye metadatos físicos PNG `pHYs`. Predeterminada **300 ppp**, con 203 ppp y opción de archivo a 600 ppp. La opción de alta resolución ahora duplica exactamente los ppp seleccionados (en vez de escalar sin un tamaño físico claro).
- B/N sólido, tramado de Bayer o imagen original; biblioteca local en IndexedDB, abrir/editar/borrar, exportar/importar copia completa JSON.
- PWA instalable; los diseños guardados funcionan sin conexión, pero nuevas generaciones necesitan Internet.

**Importante:** la exportación PNG se dimensiona usando el DPI elegido; el PNG no garantiza que otro programa imprima físicamente al tamaño exacto sin configurar su escala. Tampoco se comprueba automáticamente que un modelo de impresora admita una medida determinada.

## Requisitos para activar la generación por IA

1. Cuenta en [OpenAI Platform](https://platform.openai.com/) con facturación de API activada (se cobra **aparte** del plan de ChatGPT).
2. Crear una clave de API en https://platform.openai.com/api-keys.
3. Una contraseña privada para acceder al generador de la app (diferente de la API key).
4. Publicar la PWA con HTTPS. El proyecto se ha preparado para Vercel.

**Nunca introduzcas la API key en el formulario del iPhone ni la subas a un repositorio.** Las dos variables del servidor son:

```
OPENAI_API_KEY=sk-...
APP_PASSWORD=contraseña-larga-y-privada
```

## Publicar para usarla en iPhone (Vercel)

**Para instrucciones paso a paso, lee [`GUIA_INSTALACION_IPHONE.md`](./GUIA_INSTALACION_IPHONE.md).**

1. Desde tu ordenador, descomprime el ZIP. Debes ver `api/`, `public/`, `package.json` y `vercel.json` en la misma carpeta.
2. Si usas GitHub, sube **el contenido** de la carpeta a un nuevo repositorio privado e impórtalo en https://vercel.com/new. Elige el preset **Other** (sin framework) y deja los valores de compilación por defecto. Alternativa por terminal desde esa carpeta: `npx vercel` y luego `npx vercel --prod`.
3. En Vercel abre **Project → Settings → Environment Variables**, crea `OPENAI_API_KEY` y `APP_PASSWORD` (para el entorno Production; añade Preview si lo utilizas). Guarda y vuelve a **desplegar** el proyecto para aplicar las variables.
4. Abre la dirección `https://tu-proyecto.vercel.app` en **Safari del iPhone**. Ve a **Ajustes**, introduce la contraseña de la app y pulsa **Comprobar conexión**.
5. En Safari pulsa **Compartir → Añadir a pantalla de inicio**. Ya tendrás un icono de Tinta Studio como otra app.

**Vercel** debe recibir una carpeta de proyecto, no un HTML suelto. La función de servidor se publica en `/api/generate` y utiliza OpenAI sin revelar su clave al navegador.

### Desarrollo local en Windows 11

Se necesita Node.js 20 o superior. Abre una terminal en la carpeta y ejecuta:

```
copy .env.example .env.local
```

Edita `.env.local` con los valores reales. Después:

```
npm run dev
```

Abre `http://localhost:4173` en el ordenador. Para que funcione como app en el iPhone debes publicar con HTTPS; abrir `localhost` del ordenador desde el iPhone no basta.

## Costes y seguridad

- Las peticiones solo se realizan al pulsar **Generar** o **Refinar**; guardar, editar y exportar son locales, sin coste de OpenAI.
- GPT Image se factura por tokens de texto, imágenes de entrada y salida. Consulta el precio y la calculadora oficial: https://developers.openai.com/api/docs/guides/image-generation.
- La contraseña de la app protege el endpoint. **Está orientado a un uso personal**, no a miles de usuarios ni a una web pública comercial. Para difusión masiva añade autenticación real por usuario, limitación de peticiones compartida y presupuesto de uso.
- Configura límites de presupuesto en OpenAI Platform y mantén `APP_PASSWORD` en secreto; el código abierto no incluye secretos.
- Las fotografías de referencia y la descripción se mandan a OpenAI al generar. La biblioteca de diseños permanece en tu navegador; **exporta una copia JSON** para proteger tus etiquetas frente a limpieza de datos, reinstalación o cambio de iPhone.

## Pruebas técnicas

```
npm run check
npm run test
```

Las pruebas no realizan peticiones reales de OpenAI. Se necesita una API key propia para confirmar el resultado visual del modelo y la generación extremo a extremo.

## Rollo de dos círculos 14 × 28 mm (ID 10047)

El texto **14 × 28 mm** de la caja describe el **soporte rectangular**, no el diámetro de las pegatinas. Las imágenes de la caja muestran dos círculos troquelados. Por eso selecciona el formato rápido «2 círculos · 14 × 28» en Tinta Studio: soporte **28 mm ancho × 14 mm alto**, y **dos círculos de diámetro nominal 13 mm** en la vista previa, colocados en paralelo. El diámetro de 13 mm es **estimado a partir de las fotos**, no está declarado en el envase; debe confirmarse con regla/calibre y editarse en la app si es distinto.

El diseño para IA se genera en un lienzo **cuadrado**, pensado para caber dentro de un círculo, y luego se duplica mediante máscara circular. El fondo fuera del troquel se mantiene blanco en la exportación, pues es la parte del soporte que **no debe imprimir tinta**. Las guías de seguridad y la línea del troquel solo se ven en la app, **no se imprimen**. Al exportar el soporte a 300 ppp, su archivo mide **331 × 165 px** (el modelo D11-H usa 300 ppp); a 203 ppp mide **224 × 112 px** (D11 convencional). El botón «Exportar solo el primer círculo» genera un PNG cuadrado para reutilizar en otros programas, sin sustituir la imposición de dos círculos.

La impresión física no está implementada y por ahora no hay garantía de alineación con el sistema de avance/sensor de NIIMBOT: la posición final deberá calibrarse en la app de impresión cuando esa capacidad se desarrolle. El código 205 del envase es la cantidad rotulada de etiquetas por rollo; no se presupone si el fabricante cuenta círculos o secciones de soporte. Para dos nombres diferentes usa el modo de texto editable; **la ilustración se repite en ambos**. La generación de dos ilustraciones distintas es una mejora futura.

## Limitaciones v1.2

No imprime por Bluetooth; no tiene usuarios o sincronización en nube; no valida anchos soportados por cada impresora; no ofrece un editor vectorial avanzado. La IA puede equivocarse al dibujar letras en el modo artístico, razón por la que se incluye la superposición editable exacta. Los diseños con proporción más extrema que 3:1 deben comprobarse especialmente porque el modelo tiene una limitación de proporción y el lienzo añade espacio blanco para preservar la ilustración.


## Cambios v1.2 — 300 ppp

- El modelo seleccionado inicialmente pasa a NIIMBOT D11-H, con salida a **300 ppp**.
- Elegir D11 original configura **203 ppp**. Verifica la referencia exacta impresa en tu equipo; el rollo por sí solo no identifica la resolución de la impresora.
- Exportación normal a los ppp elegidos y archivo con metadatos `pHYs` de densidad.
- «Doble resolución» ahora usa el doble de puntos por pulgada solicitados, sin cambiar el tamaño físico de la etiqueta.
- Añadida guía de instalación para iPhone y pruebas de tamaños a 300 ppp.
