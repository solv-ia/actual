import { pathToFileURL } from 'node:url';

export function resolve(specifier, context, nextResolve) {
  if (specifier === '@actual-app/api') {
    const entry = process.env.HTECH_ACTUAL_API_ENTRY;
    if (!entry) throw new Error('HTECH_ACTUAL_API_ENTRY is required');
    return { url: pathToFileURL(entry).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
