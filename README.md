<p align="center">
  <img src="public/icon.svg" alt="ePubFacil" width="120" height="120" />
</p>

<h1 align="center">ePubFacil</h1>

<p align="center">
  Convierte PDFs y documentos (Word, OpenOffice, HTML, texto, Markdown) en libros ePub con carátula, índice e imágenes. Todo en tu navegador, sin servidores.
</p>

<p align="center">
  <a href="https://appepubfacil.ideasypruebas2.es"><img alt="App" src="https://img.shields.io/badge/App-online-2563EB" /></a>
  <img alt="PWA" src="https://img.shields.io/badge/PWA-instalable-2563EB" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue.svg" />
</p>

---

## 🌐 Aplicación en línea

Puedes **verla e instalarla** como aplicación (PWA) desde:

**https://appepubfacil.ideasypruebas2.es**

Es instalable en escritorio, Android e iOS (en iOS: *Compartir → Añadir a pantalla de inicio*), y funciona sin conexión una vez cargada.

## 📖 Descripción

**ePubFacil** es una aplicación web progresiva (PWA) que convierte documentos en libros **ePub** con carátula, tabla de contenidos (TOC) e imágenes incrustadas. **Todo el procesado ocurre en tu dispositivo**: los archivos nunca se suben a ningún servidor. Es offline-first y respeta tu privacidad.

## ✨ Funcionalidades

### Importación de documentos
- **PDF** con dos estrategias:
  - **Texto reflowable** (recomendado): reconstruye párrafos y detecta títulos por tamaño de fuente y por los marcadores del PDF.
  - **Páginas de imagen**: rasteriza cada página para reproducir fielmente el diseño original.
- **DOCX** (Word) mediante conversión semántica (títulos, listas, tablas e imágenes).
- **ODT** (OpenOffice / LibreOffice): parseo de `content.xml`.
- **HTML**, **TXT** y **Markdown**.
- **OCR** opcional (es/en) para PDF escaneados, con motor de reconocimiento en el navegador.

### Limpieza automática del texto
- **Eliminación de cabeceras y pies de página** y de **números de página** en PDF (detección por posición en el margen y por repetición).
- Saneado del HTML (lista blanca de etiquetas y atributos seguros).

### Editor de capítulos
- **Editor visual propio (WYSIWYG)** con barra de herramientas: párrafos, títulos H1–H3, negrita, cursiva, subrayado, tachado, listas, citas, enlaces, deshacer/rehacer.
- **Tablas**: insertar y añadir/quitar filas y columnas, fila de encabezado.
- **Imágenes**: insertar desde la galería del libro, subir, arrastrar y soltar o pegar; **pie de foto**, **tamaño** (pequeña/mediana/grande/completa) y **alineación**.
- **Modo HTML avanzado** para editar el código directamente.
- Reordenar capítulos (arrastrar), renombrar, fusionar, excluir y **autoguardado**.

### Carátula y metadatos
- Carátula **generada automáticamente**, **subida** por ti o usando la **primera imagen** del libro.
- Metadatos: título, autor, idioma, editorial, colección/serie, ISBN, derechos y marca/sello.

### Exportación
- **EPUB 3** (por defecto) con `nav.xhtml`, o **EPUB 2** para lectores antiguos.
- Variante **Kepub** para lectores Kobo.
- Descarga directa o **compartir** con el sistema (móvil).
- Genera un ePub válido con `mimetype` sin comprimir, `container.xml`, `content.opf`, `toc.ncx` e imágenes incrustadas.

### Biblioteca y organización
- **Biblioteca local** con **carpetas** y búsqueda.
- **Copia de seguridad y restauración** de toda la biblioteca en un ZIP.

### Conversión por lotes
- **Cola**: convierte varios documentos en varios ePub independientes.
- **Fusión**: une varios documentos en un único libro con un índice común.

### Otros
- **Previsualización de lectura** integrada.
- **PWA instalable** con **aviso de actualización** cuando hay una nueva versión, y soporte sin conexión.

## 📄 Formatos soportados

| Entrada | Extensión | Motor | Notas |
|---|---|---|---|
| PDF | `.pdf` | `pdfjs-dist` | Reflow o imagen; OCR opcional; extracción de imágenes y marcadores |
| Word | `.docx` | `mammoth` | Títulos, listas, tablas e imágenes |
| OpenDocument | `.odt` | parser propio | `content.xml` → HTML |
| HTML | `.html`, `.htm` | parser propio | Saneado y captura de imágenes incrustadas |
| Texto | `.txt` | propio | Detección heurística de capítulos |
| Markdown | `.md`, `.markdown` | `marked` | Títulos → capítulos |

Salida: **`.epub`** (y `.kepub.epub` opcional) · EPUB 3 / EPUB 2.

## 🔍 Particularidades técnicas

- **100 % en el navegador**: sin backend, sin base de datos remota, sin subir ficheros. La persistencia usa **IndexedDB** (Dexie).
- **Arquitectura ligera**: TypeScript “vanilla” con clases que devuelven `HTMLElement`, y **Tailwind CSS v4**. El editor visual es propio, sin dependencias de terceros.
- **Motores pesados con carga diferida**: `pdfjs-dist` y `mammoth` se cargan bajo demanda (code-splitting) y `tesseract.js` solo cuando se usa OCR.
- **Rutas de imagen coherentes**: en el editor las imágenes se muestran con URLs `blob:` y, al guardar/exportar, se referencian como `images/…` (el generador de ePub añade el prefijo relativo `../` correspondiente).
- **Normalización de imágenes**: PNG/JPEG/GIF/SVG pasan tal cual; WebP/TIFF/BMP se reconvierten a PNG; formatos no decodificables se descartan.

### Limitaciones conocidas
- El **OCR** descarga los datos de idioma en el primer uso (requiere conexión puntual).
- El **modo imagen** rasteriza cada página: es más lento y produce ePub más pesados.
- La extracción de **imágenes embebidas en PDF** es *best-effort*.
- La conversión se orquesta en el hilo principal, aunque `pdf.js` y `tesseract.js` usan sus propios workers.

## 🛠️ Tecnologías

Vite 6 · TypeScript · Tailwind CSS v4 · `vite-plugin-pwa` · Dexie (IndexedDB) · JSZip · pdfjs-dist · mammoth · marked · tesseract.js · SortableJS.

## 📁 Estructura del proyecto

```
src/
  App.ts                 Controlador principal y navegación
  main.ts                Punto de entrada
  pwa.ts                 Registro del Service Worker y aviso de actualización
  index.css              Tokens de diseño y estilos
  types.ts               Modelos de datos
  components/            Navbar, Toast, StepNav, WelcomeModal,
                         RichTextEditor, AssetPicker
  views/                 LibraryView, ConvertView, ChaptersView,
                         MetaCoverView, ExportView, PreviewView
  convert/               detect, pdf, ocr, docx, odt, html, text,
                         toChapters, clean, images, index
  epub/                  builder, opf, ncx, styles
  db/db.ts               Persistencia local (Dexie) y copia de seguridad
  utils/                 cover, imageOptim, backup, share, htmlAssets, sample
public/                  icon.svg, iconos PWA, LICENSE, privacidad.html
scripts/gen-icons.mjs    Generación de los iconos PNG de la PWA
```

## 🚀 Desarrollo

Requisitos: **Node.js 20+** y npm.

```bash
npm install       # instalar dependencias
npm run dev       # servidor de desarrollo en http://localhost:3000
npm run build      # compilación de producción en dist/
npm run preview    # previsualizar la compilación
npm run lint       # comprobación de tipos (tsc --noEmit)

node scripts/gen-icons.mjs   # regenerar los iconos PNG de la PWA
```

## 🔒 Privacidad

ePubFacil no envía tus documentos ni tu contenido a ningún servidor, no usa cookies de seguimiento ni analítica. Los proyectos se guardan únicamente en el almacenamiento local de tu navegador. Puedes consultar la política en [`public/privacidad.html`](public/privacidad.html).

## 📜 Licencia

Este proyecto se distribuye bajo la **licencia MIT**. Consulta el archivo [`public/LICENSE`](public/LICENSE).

## 👤 Autor

Creado por **Manuel Cárdenas Thorlund** — [nuevasideas.es](https://nuevasideas.es)
