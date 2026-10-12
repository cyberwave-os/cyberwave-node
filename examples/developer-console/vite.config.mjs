import { defineConfig } from "vite";
import { examples } from "./src/example-catalog.ts";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  build: {
    rolldownOptions: {
      input: Object.fromEntries(
        examples.map((example) => [
          String(example.id),
          example.path === "/" ? "index.html" : example.path.slice(1),
        ]),
      ),
    },
  },
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium") },
  plugins: [
    viteStaticCopy({
      targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map((name) => ({
        src: `node_modules/cesium/Build/Cesium/${name}`,
        dest: "cesium",
        rename: { stripBase: 4 },
      })),
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/gateway": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
