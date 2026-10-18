/** Utilities shared by the visual editor and the chapters view. */

/** Collects the image file names referenced by stored chapter HTML. */
export function collectImageFileNames(html: string): Set<string> {
  const set = new Set<string>();
  const re = /src=("|')images\/([^"']+)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    set.add(match[2]);
  }
  return set;
}

/** Returns a slug suitable for a file name. */
export function slugify(value: string, fallback = 'documento'): string {
  const slug = (value || fallback)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}
