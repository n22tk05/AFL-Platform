/** App Router route groups do not add URL segments. */
export const APP_ROUTES = Object.freeze({
  home: '/', scan: '/citizen/scan', guide: '/citizen/guide', scanDocument: '/scan-document',
  admin: '/admin', library: '/admin/library', documentTest: '/document-test', opencvTest: '/opencv-test',
  review: (id: string) => `/review/${encodeURIComponent(id)}`,
});
