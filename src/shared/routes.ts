/** App Router route groups do not add URL segments. */
export const APP_ROUTES = Object.freeze({
  home: '/', scan: '/scan', guide: '/guide', scanDocument: '/scan-document',
  admin: '/admin', library: '/library', documentTest: '/document-test', opencvTest: '/opencv-test',
  review: (id: string) => `/review/${encodeURIComponent(id)}`,
});
