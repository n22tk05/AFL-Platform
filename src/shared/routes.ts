/** App Router route groups do not add URL segments. */
export const APP_ROUTES = Object.freeze({
  home: '/citizen', scan: '/citizen/scan', guide: '/citizen/guide', scanDocument: '/scan-document',
  admin: '/admin', library: '/admin/library', upload: '/admin/upload', documentTest: '/document-test', opencvTest: '/opencv-test',
  review: (formCode: string) => `/admin/review/${encodeURIComponent(formCode)}`,
  citizenGuide: (formCode: string) => `/citizen/guide?formCode=${encodeURIComponent(formCode)}`,
});
