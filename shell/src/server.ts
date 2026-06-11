import { initNodeFederation } from '@softarc/native-federation-node';

console.log('Starting SSR for Shell');

(async () => {

  try {
    await initNodeFederation({
      remotesOrManifestUrl: '../browser/federation.manifest.json',
      relBundlePath: '../browser/',
    });
  } catch (e) {
    console.warn('Could not initialize node federation. This is expected during build/prerender.');
  }

  await import('./bootstrap-server');

})();
