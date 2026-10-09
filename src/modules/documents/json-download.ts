export function safeJsonFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return (base || 'document') + '.json';
}
