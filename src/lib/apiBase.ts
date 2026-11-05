// In the browser (Vite dev/build), '/api/...' works because the Express
// server in server.ts sits behind the same origin.
//
// In the Android app there is no Express server on the device, so every
// '/api/...' call must point at your deployed backend instead (e.g. the
// Cloud Run URL AI Studio gave this app, or wherever you deploy server.ts).
//
// Set VITE_API_BASE_URL in a .env.production file before running
// `npm run build` for the mobile app, e.g.:
//   VITE_API_BASE_URL=https://your-app-xxxxx.run.app
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '';
