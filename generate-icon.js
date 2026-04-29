/**
 * Yfiten launcher-icon generator.
 *
 * Source: www/img/small-logo.png (1024×1024 black Y on white) — taken as
 * the SHAPE master. We rebuild colour from scratch (white Y on dark navy
 * for legacy, white Y on transparent for adaptive foreground) so the
 * pixels stay pristine, and downsample with Lanczos3 + a mild unsharp
 * pass for crisp edges at every density.
 *
 * Outputs (overwrites in place):
 *   android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher.png
 *   android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher_round.png
 *   android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher_foreground.png
 *
 * Why we re-derive the alpha channel:
 *   small-logo.png has a white background instead of a transparent one,
 *   so we can't just composite it. We negate to brighten the Y, take the
 *   greyscale luminance as the alpha mask, and emit pure-white RGB. That
 *   skips colour-bleed artefacts you'd get from key-out/threshold tricks.
 *
 * Why the foreground sizes look "huge":
 *   Adaptive icons (Android 8+) define a 108dp viewport — only the inner
 *   72dp is the safe area; everything outside can be cropped by the
 *   launcher's mask. So foreground PNG must be 108dp × density (mdpi
 *   108 → xxxhdpi 432). The previous foregrounds were 48–192 px,
 *   forcing the launcher to upscale them — which is the blur the user
 *   was seeing. Now they ship at the spec sizes.
 */

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const ROOT = __dirname;
const SRC = path.join(ROOT, "www", "img", "small-logo.png");
const RES = path.join(ROOT, "android", "app", "src", "main", "res");

const BG_HEX = "#0F172A"; // matches values/ic_launcher_background.xml

// Density tables.
// Legacy ic_launcher.png / ic_launcher_round.png — sized to dp × density.
const LEGACY = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};
// Adaptive-icon foreground — 108dp × density (Android 8+ spec).
const ADAPTIVE_FG = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

// Y coverage on the legacy bitmap — kept generous-margined so the
// letter reads at small sizes without crowding the rounded square.
const LEGACY_Y_RATIO = 0.5;
// Y coverage on the adaptive foreground — well inside the 72dp safe
// zone (72/108 ≈ 0.667). Going below the safe-zone limit makes the Y
// look "zoomed out" relative to the launcher's circle/squircle mask,
// which is the look the user wants.
const ADAPTIVE_Y_RATIO = 0.42;
// Corner radius (legacy bitmaps), as a fraction of icon side. Matches
// the rounded-square look of the existing 512 master.
const CORNER_RADIUS_RATIO = 0.18;

// Generate the master "white Y on transparent" once, at high resolution.
// All downstream outputs scale from this — Lanczos3 from a 1024px master
// produces noticeably sharper edges than scaling from 192px.
//
// small-logo.png ships as a black Y on a transparent canvas, so the
// alpha channel already encodes the letter shape with antialiasing. We
// just recolour the RGB to pure white and keep the existing alpha — no
// keying, no thresholding, no luma tricks (any of which would either
// fringe the edges or eat into thin curves).
async function buildWhiteYMaster() {
  const meta = await sharp(SRC).metadata();
  const W = meta.width || 1024;
  const H = meta.height || 1024;

  const alpha = await sharp(SRC)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer();

  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4 + 0] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = alpha[i];
  }

  // Trim the transparent padding around the Y so the source's empty
  // margin doesn't dominate downstream sizing decisions. The trim is
  // alpha-aware (Sharp uses the alpha channel by default for RGBA).
  const trimmed = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .trim({ threshold: 5 })
    .toBuffer();

  return trimmed;
}

// Returns an SVG buffer for a centred, rounded-square mask of given size
// and corner radius. Used to clip the navy background of legacy icons.
function roundedSquareMaskSvg(size, radius) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/>` +
    `</svg>`,
  );
}

// Returns an SVG buffer for a centred circular mask. Used for the legacy
// ic_launcher_round.png since older launchers honour that drawable.
function circleMaskSvg(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>` +
    `</svg>`,
  );
}

async function legacyIcon(size, master, shape /* 'square' | 'round' */) {
  const yPx = Math.round(size * LEGACY_Y_RATIO);

  // Resize the white Y master to the target letter size with Lanczos3.
  const yLayer = await sharp(master)
    .resize(yPx, yPx, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.5, m1: 0.4, m2: 0.6 }) // mild unsharp for crisp edges
    .toBuffer();

  // Solid navy canvas at full size.
  const canvas = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_HEX,
    },
  })
    .png()
    .toBuffer();

  // Apply the shape mask via dest-in compositing.
  const maskSvg = shape === "round"
    ? circleMaskSvg(size)
    : roundedSquareMaskSvg(size, Math.round(size * CORNER_RADIUS_RATIO));
  const masked = await sharp(canvas)
    .composite([{ input: maskSvg, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Place the Y centred on the navy background.
  return sharp(masked)
    .composite([{ input: yLayer, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function adaptiveForeground(size, master) {
  const yPx = Math.round(size * ADAPTIVE_Y_RATIO);

  const yLayer = await sharp(master)
    .resize(yPx, yPx, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.5, m1: 0.4, m2: 0.6 })
    .toBuffer();

  // Transparent canvas — the navy comes from values/ic_launcher_background.xml
  // when the launcher composes the adaptive icon.
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: yLayer, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Source logo not found: ${SRC}`);
  }
  const master = await buildWhiteYMaster();

  for (const [density, size] of Object.entries(LEGACY)) {
    const dir = path.join(RES, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const square = await legacyIcon(size, master, "square");
    const round = await legacyIcon(size, master, "round");
    fs.writeFileSync(path.join(dir, "ic_launcher.png"), square);
    fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), round);
    console.log(`legacy ${density}: ic_launcher.png + ic_launcher_round.png @ ${size}px`);
  }

  for (const [density, size] of Object.entries(ADAPTIVE_FG)) {
    const dir = path.join(RES, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const fg = await adaptiveForeground(size, master);
    fs.writeFileSync(path.join(dir, "ic_launcher_foreground.png"), fg);
    console.log(`adaptive ${density}: ic_launcher_foreground.png @ ${size}px`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
