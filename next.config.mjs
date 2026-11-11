// BUILD_TARGET=app makes a plain static site in out/ for the Android app (Capacitor).
// The website on Vercel builds as usual.
const app = process.env.BUILD_TARGET === "app";
export default app ? { output: "export", images: { unoptimized: true }, trailingSlash: true } : {};
