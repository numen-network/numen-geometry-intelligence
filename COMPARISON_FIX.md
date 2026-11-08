# 3D Comparison Viewer Fix

The previous AI Lab response used `Content-Security-Policy: script-src 'self'`, which blocked the external Three.js ES module imports used by `comparison-lab.js`. This build permits `https://esm.sh` for scripts and connections on `/ai-lab`. The viewer now reports initialization and unhandled errors instead of silently remaining blank.

**Dependency:** This fix still requires the browser to access `https://esm.sh`. For an offline deployment, vendor Three.js and its loaders and serve them locally with an import map.

**Test:** Visit `/ai-lab`, confirm the status reads `3D viewer ready`, enter an existing indexed object ID, and press `Load / Refresh 3D Models`. Check the browser developer console for network/CSP errors if the model remains blank.
