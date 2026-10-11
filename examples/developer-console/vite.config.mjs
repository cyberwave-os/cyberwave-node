import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  build: { rolldownOptions: { input: {
    assetOperations: 'asset-operations.html', inspectionAtlas: 'inspection-atlas.html',
    sensorVideo: 'sensor-video.html', sensorTelemetry: 'sensor-telemetry.html',
    maintenance: 'maintenance-planning.html', verification: 'maintenance-verification.html',
    library: 'mission-library.html',
    annotation: 'image-annotation.html', humanEvidence: 'human-evidence.html', aerial: 'aerial-inspection.html', inspection: 'inspection-workbench.html', recordings: 'recording-review.html',
    environments: 'environments.html', catalog: 'asset-catalog.html', cesium: 'index.html', mission: 'mission-simulation.html', keyboard: 'keyboard-telecontrol.html', monitor: 'twin-monitor.html', robot: 'robot-environment.html',
  } } },
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium') },
  plugins: [viteStaticCopy({
    targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map(name => ({
      src: `node_modules/cesium/Build/Cesium/${name}`, dest: 'cesium',
      rename: { stripBase: 4 },
    })),
  })],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/gateway': { target: 'http://127.0.0.1:8787', changeOrigin: true }, '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
});
