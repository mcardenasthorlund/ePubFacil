import { createProject, replaceProjectChapters } from '../db/db';
import { generateCoverBlob } from './cover';
import type { ProjectRecord } from '../types';

const SAMPLE_CHAPTERS: { title: string; html: string }[] = [
  {
    title: 'Bienvenido a ePubFacil',
    html: `<p>Este es un libro de ejemplo generado automáticamente para que veas cómo funciona <strong>ePubFacil</strong>. Puedes convertirlo a ePub y abrirlo en cualquier lector de libros electrónicos.</p>
<p>La aplicación convierte tus documentos (PDF, Word, OpenOffice, HTML, texto y Markdown) en libros ePub con índice, carátula e imágenes, y todo ocurre dentro de tu navegador.</p>
<h2>Qué incluye este ejemplo</h2>
<ul>
  <li>Varios capítulos con estructura de títulos.</li>
  <li>Una carátula generada automáticamente.</li>
  <li>Metadatos editables (autor, idioma, editorial).</li>
</ul>`,
  },
  {
    title: 'Cómo convertir un documento',
    html: `<p>Para crear tu propio libro, pulsa <em>Convertir documento</em> y elige un archivo. ePubFacil detecta los capítulos a partir de los títulos del documento.</p>
<h2>Ajustes de conversión</h2>
<p>Si importas un PDF, puedes elegir entre <strong>texto reflowable</strong> (recomendado para leer) o <strong>páginas de imagen</strong> (fiel a la maquetación original). También puedes activar el OCR para documentos escaneados.</p>
<h2>Editor de capítulos</h2>
<p>Tras la conversión puedes renombrar, reordenar, fusionar o excluir capítulos antes de exportar. El índice del ePub se genera automáticamente.</p>`,
  },
  {
    title: 'Exportar y leer',
    html: `<p>Cuando el libro esté listo, exporta el ePub 3 (o ePub 2 para lectores antiguos) y ábrelo en tu dispositivo.</p>
<h2>Formatos de salida</h2>
<p>ePubFacil genera archivos válidos con carátula, índice (TOC) e imágenes incrustadas. También puedes crear una variante Kepub para lectores Kobo.</p>
<p>¡Feliz lectura!</p>`,
  },
];

export async function seedSampleProject(folderId: number | null = null): Promise<number> {
  const title = 'Libro de ejemplo';
  const author = 'Manuel Cárdenas Thorlund';
  const description =
    'Proyecto de demostración de ePubFacil con varios capítulos y carátula generada automáticamente.';

  const cover = await generateCoverBlob({
    title,
    author,
    brandName: 'ePubFacil',
    primaryColor: '#2563EB',
  });

  const now = Date.now();
  const project: ProjectRecord = {
    title,
    author,
    description,
    language: 'es',
    publisher: 'ePubFacil',
    series: '',
    isbn: '',
    rights: `© ${new Date().getFullYear()} ${author}`,
    primaryColor: '#2563EB',
    brandName: 'ePubFacil',
    sourceName: 'libro-de-ejemplo',
    sourceKind: 'txt',
    importMode: 'reflow',
    chapterCount: SAMPLE_CHAPTERS.length,
    wordCount: SAMPLE_CHAPTERS.reduce(
      (sum, c) => sum + c.html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length,
      0
    ),
    folderId,
    coverBlob: cover.blob,
    createdAt: now,
    updatedAt: now,
  };

  const id = await createProject(project);
  await replaceProjectChapters(
    id,
    SAMPLE_CHAPTERS.map((c) => ({ title: c.title, html: c.html, include: true, order: 0 }))
  );
  return id;
}
