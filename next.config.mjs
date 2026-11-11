// BUILD_TARGET=app makes a plain static site in out/ for the Android app (Capacitor).
// The website on Vercel builds as usual, with the security headers below.
const app = process.env.BUILD_TARGET === "app";

// Content-Security-Policy: what the page may load and talk to.
//  - scripts, styles, fonts and workers only from this site (Next.js needs inline scripts/styles)
//  - pictures: this site, stored files (blob:/data:) and the web (web pictures still wait for the user's OK in the app)
//  - connections: this site plus any https address, because the AI assistant talks straight to the provider
//    the user picks (Anthropic, OpenAI, OpenRouter, Gemini, Groq, custom), and localhost for Ollama / LM Studio
//  - never framed by other sites, no plugins, forms only to this site
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: blob: data: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self' blob:",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

export default app
  ? { output: "export", images: { unoptimized: true }, trailingSlash: true }
  : { poweredByHeader: false, async headers() { return [{ source: "/:path*", headers: securityHeaders }]; } };
