/**
 * The resolver itself. See `ts-resolve.mjs`, which registers it.
 *
 * Tries the extensions Metro would try, in the order Metro tries them, for
 * relative specifiers that do not already name a file type.
 */
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, next) {
  if (/^\.{1,2}\//.test(specifier) && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
    for (const ext of EXTENSIONS) {
      try {
        return await next(specifier + ext, context);
      } catch {
        // Next extension. A genuine miss falls through to the plain attempt
        // below, so the error the caller sees is about the real specifier.
      }
    }
  }
  return next(specifier, context);
}
