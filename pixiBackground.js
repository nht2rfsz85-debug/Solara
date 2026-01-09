// pixiBackground.js
// Implements the dynamic background effect used in the html‑music project.
// This script converts the original TypeScript LyricsScene class into a
// plain JavaScript implementation that works with Pixi.js and the
// optional pixi‑filters package. It exposes two global functions:
//   initPixiBackground(imageUrl)    – create the swirling background from an image
//   destroyPixiBackground()         – destroy the Pixi application and free memory
// An additional helper updatePixiArtwork(newUrl) is available to change
// the artwork while preserving the current animation state.

(function () {
  let pixiApp = null;
  let container = null;
  let sprites = [];
  let twistFilter = null;
  let adjustmentFilter = null;
  let blurFilters = [];
  let currentTexture = null;

  /**
   * Load an image from a URL with CORS enabled and convert it to a PIXI texture.
   * If loading fails, a white texture is returned instead. This helper avoids
   * the black background issue when images are served from remote domains.
   * @param {string} url The URL of the image to load.
   * @returns {Promise<PIXI.Texture>} A promise that resolves to the loaded texture.
   */
  function loadTexture(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(PIXI.Texture.WHITE);
        return;
      }
      const img = new Image();
      // Enable CORS to allow loading images from different origins. The remote
      // server must send appropriate CORS headers for this to succeed.
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const tex = PIXI.Texture.from(img);
          resolve(tex);
        } catch (e) {
          resolve(PIXI.Texture.WHITE);
        }
      };
      img.onerror = () => {
        // Log an error to the browser console so developers can diagnose why
        // the dynamic background is showing a black screen. This may happen
        // when the image server does not permit CORS or the URL is invalid.
        console.error('[PixiBackground] 图片加载失败，无法作为背景纹理:', url);
        resolve(PIXI.Texture.WHITE);
      };
      img.src = url;
    });
  }

  // Create and initialize the Pixi background. If already running, it will
  // destroy the previous instance before creating a new one. The imageUrl
  // argument should be a valid URL or data URI of the album artwork.
  async function initPixiBackground(imageUrl) {
    const canvas = document.getElementById('pixiBackgroundCanvas');
    if (!canvas) {
      return;
    }

    // Destroy any existing application to avoid memory leaks
    destroyPixiBackground();

    // Use the canvas dimensions for the Pixi application. The width/height
    // are derived from the canvas’s client bounding box, ensuring that
    // resizing the window does not distort the effect.
    const rect = canvas.getBoundingClientRect();
    pixiApp = new PIXI.Application({
      view: canvas,
      width: rect.width,
      height: rect.height,
      backgroundAlpha: 0,
      powerPreference: 'low-power'
    });

    // Create a container to hold the sprites. All filters will be applied
    // to this container rather than individual sprites, mirroring the
    // original LyricsScene implementation.
    container = new PIXI.Container();
    pixiApp.stage.addChild(container);

    // Start with a white texture; we'll update it once the image loads.
    currentTexture = PIXI.Texture.WHITE;

    // Create four sprites of the same artwork. Their sizes and positions
    // correspond to the TypeScript implementation from html‑music.
    sprites = new Array(4).fill(null).map(() => new PIXI.Sprite(currentTexture));
    const screenW = pixiApp.screen.width;
    const screenH = pixiApp.screen.height;
    // Destructure the sprites for clearer assignment. Names t, s, i, r come
    // from the original code (t=large, s=second layer, i=third, r=fourth).
    const [t, s, i, r] = sprites;
    [t, s, i, r].forEach(sprite => {
      sprite.anchor.set(0.5);
    });
    t.position.set(screenW / 2, screenH / 2);
    s.position.set(screenW / 2.5, screenH / 2.5);
    i.position.set(screenW / 2, screenH / 2);
    r.position.set(screenW / 2, screenH / 2);
    // Set sizes relative to screen width, matching the original code
    t.width = screenW * 1.25;
    t.height = t.width;
    s.width = screenW * 0.8;
    s.height = s.width;
    i.width = screenW * 0.5;
    i.height = i.width;
    r.width = screenW * 0.25;
    r.height = r.width;
    container.addChild(t, s, i, r);

    // Create Kawase blur filters with increasing kernel sizes. These
    // blur filters approximate the soft glow seen in the html‑music demo.
    blurFilters = [
      new PIXI.filters.KawaseBlurFilter(5, 1),
      new PIXI.filters.KawaseBlurFilter(10, 1),
      new PIXI.filters.KawaseBlurFilter(20, 2),
      new PIXI.filters.KawaseBlurFilter(40, 2),
      new PIXI.filters.KawaseBlurFilter(80, 2)
    ];
    // Create a twist filter that slightly distorts the image around the
    // centre of the screen. This matches the `TwistFilter` usage in
    // LyricsScene, with a negative angle for a subtle swirl.
    twistFilter = new PIXI.filters.TwistFilter({
      angle: -3.25,
      radius: 900,
      offset: new PIXI.Point(screenW / 2, screenH / 2)
    });
    // Increase saturation to make colours pop. AdjustmentFilter is part
    // of pixi‑filters; if the filter isn’t available, gracefully fall
    // back to no saturation change.
    if (PIXI.filters && PIXI.filters.AdjustmentFilter) {
      adjustmentFilter = new PIXI.filters.AdjustmentFilter({
        saturation: 2.75
      });
    } else {
      adjustmentFilter = null;
    }
    // Apply the filters to the entire container. Only defined filters
    // are included in the list to avoid null values.
    const filtersList = [twistFilter, ...blurFilters];
    if (adjustmentFilter) filtersList.push(adjustmentFilter);
    container.filters = filtersList;

    // Animation ticker. Each frame rotates and moves the sprites
    // relative to the elapsed time. This replicates the behaviour of
    // LyricsScene’s ticker callback.
    pixiApp.ticker.add(() => {
      if (!pixiApp || !container) return;
      // Compute delta factor similar to the TS code
      const n = pixiApp.ticker.deltaMS / 33.333333;
      // Sprite 0 (largest)
      t.rotation += 0.003 * n;
      // Sprite 1
      s.rotation -= 0.008 * n;
      // Sprite 2
      i.rotation -= 0.006 * n;
      i.x = screenW / 2 + (screenW / 4) * Math.cos(i.rotation * 0.75);
      i.y = screenH / 2 + (screenW / 4) * Math.sin(i.rotation * 0.75);
      // Sprite 3
      r.rotation += 0.004 * n;
      r.x = screenW / 2 + (screenW / 2) * 0.1 + (screenW / 4) * Math.cos(r.rotation * 0.75);
      r.y = screenH / 2 + (screenW / 2) * 0.1 + (screenW / 4) * Math.sin(r.rotation * 0.75);
    });

    // Once the application is set up, asynchronously load the provided image
    // and update the sprites’ textures when it’s ready.
    if (imageUrl) {
      const tex = await loadTexture(imageUrl);
      sprites.forEach(sprite => {
        sprite.texture = tex;
      });
      currentTexture = tex;
    }
  }

  // Update the artwork without resetting positions or rotations. This
  // function can be called whenever the album art changes.
  async function updatePixiArtwork(imageUrl) {
    if (!pixiApp || !container) return;
    if (!imageUrl) return;
    const tex = await loadTexture(imageUrl);
    sprites.forEach(sprite => {
      sprite.texture = tex;
    });
    currentTexture = tex;
  }

  // Clean up the Pixi application and release resources.
  function destroyPixiBackground() {
    if (pixiApp) {
      pixiApp.destroy(true);
      pixiApp = null;
      container = null;
      sprites = [];
      twistFilter = null;
      adjustmentFilter = null;
      blurFilters = [];
    }
  }

  // Expose the functions globally so the main page can control the effect.
  window.initPixiBackground = initPixiBackground;
  window.destroyPixiBackground = destroyPixiBackground;
  window.updatePixiArtwork = updatePixiArtwork;
})();
