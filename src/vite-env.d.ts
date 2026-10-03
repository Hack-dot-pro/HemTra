/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

// Build id do vite.config.ts nhúng (define) — đối chiếu với GET /version.json
// để biết tab đang chạy bản cũ sau khi deploy (design §8.6).
declare const __BUILD_ID__: string
