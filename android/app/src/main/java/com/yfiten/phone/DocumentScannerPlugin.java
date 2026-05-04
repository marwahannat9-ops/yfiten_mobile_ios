package com.yfiten.phone;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "DocumentScanner")
public class DocumentScannerPlugin extends Plugin {

    public static final int REQ_CODE = 9821;
    // Saved-call id stays in process memory when alive; on MIUI the process may
    // be killed while the ML Kit scanner activity is foregrounded, so we ALSO
    // hand the call to the bridge via saveCall(). bridge.getSavedCall(id) keeps
    // working after the bridge is recreated on the new process.
    private String pendingCallId;

    @PluginMethod
    public void scan(PluginCall call) {
        // Keep the call alive across process death — MIUI kills us while the
        // scanner activity is up. Without saveCall(), pendingCall is null on
        // recovery and the captured doc is silently dropped.
        bridge.saveCall(call);
        pendingCallId = call.getCallbackId();

        int pageLimit = call.getInt("pageLimit", 1);
        boolean galleryImport = call.getBoolean("galleryImport", false);

        // SCANNER_MODE_FULL_WITH_FILTER doesn't exist; FULL gives the user filter choices.
        // We always run our own enhancement pass on the result so output is consistent.
        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(galleryImport)
            .setPageLimit(pageLimit)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build();

        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        scanner.getStartScanIntent(getActivity())
            .addOnSuccessListener(intentSender -> {
                try {
                    getActivity().startIntentSenderForResult(intentSender, REQ_CODE, null, 0, 0, 0);
                } catch (IntentSender.SendIntentException e) {
                    PluginCall c = currentCall();
                    if (c != null) {
                        c.reject("Failed to start scanner: " + e.getMessage());
                        clearCall();
                    }
                }
            })
            .addOnFailureListener(e -> {
                PluginCall c = currentCall();
                if (c != null) {
                    c.reject("Scanner unavailable: " + e.getMessage());
                    clearCall();
                }
            });
    }

    /**
     * Called from MainActivity.onActivityResult — Capacitor's bridge only routes
     * Activity results for request codes it registered itself, so we dispatch from
     * the host Activity directly into the plugin instance.
     *
     * On MIUI / low-memory devices the OS sometimes kills our process while the
     * ML Kit scanner activity is foregrounded. Android then creates a fresh
     * process just to deliver the result here — at that point the JS Promise is
     * gone and pendingCallId is null. We detect that case and persist the
     * captured bytes to internal storage; JS picks them up via consumePending()
     * on the next app launch.
     */
    public void handleScanResult(int resultCode, Intent data) {
        PluginCall call = currentCall();
        boolean haveLiveCall = call != null;
        if (haveLiveCall) clearCall();

        if (resultCode != Activity.RESULT_OK || data == null) {
            if (haveLiveCall) call.reject("cancelled");
            return;
        }

        ScanResultPayload payload = decodeAndEnhance(data);
        if (payload == null) {
            if (haveLiveCall) call.reject("Failed to read scan result");
            return;
        }

        if (haveLiveCall) {
            call.resolve(buildResultJSObject(payload));
        } else {
            // Process-death recovery path: stash bytes on disk so the JS layer
            // can pick them up after Capacitor and app.js finish booting.
            try {
                writePendingPayload(payload);
            } catch (Throwable t) {
                // Nothing to surface — JS will simply not see a pending scan.
            }
        }
    }

    /**
     * JS calls this once on app boot / resume. If a scan completed while the
     * process was dead, the bytes are returned (and consumed). Otherwise an
     * empty object is returned so JS can short-circuit cheaply.
     */
    @PluginMethod
    public void consumePending(PluginCall call) {
        try {
            File dir = pendingDir();
            File img = new File(dir, "pending.jpg");
            File meta = new File(dir, "pending.meta");
            if (!img.exists()) {
                JSObject empty = new JSObject();
                empty.put("hasPending", false);
                call.resolve(empty);
                return;
            }

            byte[] bytes = readAllBytes(img);
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

            float blurScore = 0f, brightness = 128f, contrast = 50f;
            String warning = null;
            if (meta.exists()) {
                String[] parts = new String(readAllBytes(meta)).split("\\|");
                try {
                    if (parts.length >= 1) blurScore = Float.parseFloat(parts[0]);
                    if (parts.length >= 2) brightness = Float.parseFloat(parts[1]);
                    if (parts.length >= 3) contrast = Float.parseFloat(parts[2]);
                    if (parts.length >= 4 && !"null".equals(parts[3])) warning = parts[3];
                } catch (NumberFormatException ignored) {}
            }

            // Consume — delete files so we don't double-process on next resume.
            //noinspection ResultOfMethodCallIgnored
            img.delete();
            //noinspection ResultOfMethodCallIgnored
            meta.delete();

            JSObject ret = new JSObject();
            ret.put("hasPending", true);
            ret.put("base64", base64);
            ret.put("format", "jpeg");
            ret.put("pageCount", 1);
            ret.put("blurScore", blurScore);
            ret.put("brightness", brightness);
            ret.put("contrast", contrast);
            if (warning != null) ret.put("qualityWarning", warning);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("consumePending failed: " + e.getMessage());
        }
    }

    private ScanResultPayload decodeAndEnhance(Intent data) {
        try {
            GmsDocumentScanningResult result = GmsDocumentScanningResult.fromActivityResultIntent(data);
            if (result == null || result.getPages() == null || result.getPages().isEmpty()) return null;

            Uri imageUri = result.getPages().get(0).getImageUri();
            Bitmap bmp;
            try (InputStream is = getContext().getContentResolver().openInputStream(imageUri)) {
                bmp = BitmapFactory.decodeStream(is);
            }
            if (bmp == null) return null;

            // Apply EXIF orientation. ML Kit's GmsDocumentScanner often
            // carries the rotation in the JPEG metadata; BitmapFactory.decodeStream
            // ignores that, so without this fix the bitmap can come out
            // 180° upside-down on some Samsung devices. We use androidx
            // ExifInterface (more reliable on content:// URIs) and read
            // from a fresh stream because the decoder consumed the first.
            int orientation = ExifInterface.ORIENTATION_NORMAL;
            try (InputStream is2 = getContext().getContentResolver().openInputStream(imageUri)) {
                if (is2 != null) {
                    ExifInterface exif = new ExifInterface(is2);
                    orientation = exif.getAttributeInt(
                            ExifInterface.TAG_ORIENTATION,
                            ExifInterface.ORIENTATION_NORMAL);
                }
            } catch (Throwable t) {
                Log.w("DocumentScanner", "EXIF read failed: " + t.getMessage());
            }
            Log.i("DocumentScanner",
                    "Decoded bitmap " + bmp.getWidth() + "x" + bmp.getHeight()
                            + " EXIF orientation=" + orientation);
            bmp = applyExifOrientation(bmp, orientation);
            if (bmp != null) {
                Log.i("DocumentScanner",
                        "After EXIF rotate " + bmp.getWidth() + "x" + bmp.getHeight());
            }

            Quality quality = assessQuality(bmp);
            // First: remove shadows / dark bands / glare via local-background
            // subtraction. Critical for thermal-printed receipts where the
            // top/bottom can be a thick dark stripe with reflections — the
            // global tone curve in enhanceForOcr() can't recover digits in
            // those zones, but background subtraction does.
            Bitmap deshadowed = removeShadowsForOcr(bmp);
            if (deshadowed != bmp) bmp.recycle();
            Bitmap enhanced = enhanceForOcr(deshadowed);
            if (enhanced != deshadowed) deshadowed.recycle();
            // Final pass: light unsharp mask on the levelled image so text
            // edges read crisp like a real flatbed-scanner output rather
            // than a blurry phone photo.
            Bitmap sharpened = sharpenForScan(enhanced);
            if (sharpened != enhanced) enhanced.recycle();

            // Cap the long edge at 1800 px before encoding so the upload
            // stays small enough for the OCR API. Any wider is wasted —
            // OCR engines don't need more than ~1500 px on the long edge
            // for receipt-scale text. Downscale with bilinear filtering.
            final int MAX_LONG_EDGE = 1800;
            int sw = sharpened.getWidth(), sh = sharpened.getHeight();
            int longEdge = Math.max(sw, sh);
            Bitmap toEncode = sharpened;
            if (longEdge > MAX_LONG_EDGE) {
                float scale = (float) MAX_LONG_EDGE / longEdge;
                int newW = Math.max(1, Math.round(sw * scale));
                int newH = Math.max(1, Math.round(sh * scale));
                Bitmap resized = Bitmap.createScaledBitmap(sharpened, newW, newH, true);
                if (resized != sharpened) sharpened.recycle();
                toEncode = resized;
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            // JPEG 90 — keeps payload small for the OCR API. The crispness
            // we want comes from the sharpenForScan + shadow-removal passes,
            // not from raw JPEG quality.
            toEncode.compress(Bitmap.CompressFormat.JPEG, 90, baos);
            byte[] jpeg = baos.toByteArray();
            toEncode.recycle();

            ScanResultPayload p = new ScanResultPayload();
            p.jpegBytes = jpeg;
            p.pageCount = result.getPages().size();
            p.blurScore = quality.blurScore;
            p.brightness = quality.brightness;
            p.contrast = quality.contrast;
            p.warning = quality.warning;
            return p;
        } catch (Exception e) {
            return null;
        }
    }

    private JSObject buildResultJSObject(ScanResultPayload p) {
        JSObject ret = new JSObject();
        ret.put("base64", Base64.encodeToString(p.jpegBytes, Base64.NO_WRAP));
        ret.put("format", "jpeg");
        ret.put("pageCount", p.pageCount);
        ret.put("blurScore", p.blurScore);
        ret.put("brightness", p.brightness);
        ret.put("contrast", p.contrast);
        if (p.warning != null) ret.put("qualityWarning", p.warning);
        return ret;
    }

    private File pendingDir() {
        File dir = new File(getContext().getFilesDir(), "scanner");
        if (!dir.exists()) //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        return dir;
    }

    private void writePendingPayload(ScanResultPayload p) throws Exception {
        File dir = pendingDir();
        File img = new File(dir, "pending.jpg");
        File meta = new File(dir, "pending.meta");
        try (FileOutputStream fos = new FileOutputStream(img)) {
            fos.write(p.jpegBytes);
        }
        String metaStr = p.blurScore + "|" + p.brightness + "|" + p.contrast + "|" + (p.warning == null ? "null" : p.warning);
        try (FileOutputStream fos = new FileOutputStream(meta)) {
            fos.write(metaStr.getBytes());
        }
    }

    private byte[] readAllBytes(File f) throws Exception {
        try (FileInputStream fis = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = fis.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static class ScanResultPayload {
        byte[] jpegBytes;
        int pageCount;
        float blurScore;
        float brightness;
        float contrast;
        String warning;
    }

    /**
     * Applies an OCR-friendly enhancement:
     *  1. Auto-levels — stretch luminance so the 1st percentile becomes black and the
     *     99th percentile becomes white. This neutralises shadows/yellow paper tint
     *     without crushing detail.
     *  2. Slight desaturation — colour casts (yellow paper, blue light) hurt OCR.
     *  3. Mild contrast boost — sharpens edges of text strokes.
     */
    /**
     * Rotate / flip the bitmap so its on-screen orientation matches the
     * EXIF tag the camera (or ML Kit) wrote. Returns the same bitmap if
     * no transform is required; otherwise allocates a new bitmap and
     * recycles the input.
     */
    private static Bitmap applyExifOrientation(Bitmap src, int orientation) {
        if (src == null) return null;
        Matrix m = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90:
                m.postRotate(90);
                break;
            case ExifInterface.ORIENTATION_ROTATE_180:
                m.postRotate(180);
                break;
            case ExifInterface.ORIENTATION_ROTATE_270:
                m.postRotate(270);
                break;
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                m.postScale(-1f, 1f);
                break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                m.postScale(1f, -1f);
                break;
            case ExifInterface.ORIENTATION_TRANSPOSE:
                m.postRotate(90);
                m.postScale(-1f, 1f);
                break;
            case ExifInterface.ORIENTATION_TRANSVERSE:
                m.postRotate(270);
                m.postScale(-1f, 1f);
                break;
            case ExifInterface.ORIENTATION_NORMAL:
            case ExifInterface.ORIENTATION_UNDEFINED:
            default:
                return src;
        }
        try {
            Bitmap rotated = Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
            if (rotated != src) src.recycle();
            return rotated;
        } catch (OutOfMemoryError oom) {
            // Best-effort: rather than crash on a low-memory device, ship
            // the un-rotated bitmap.
            return src;
        }
    }

    /**
     * Local-background subtraction for OCR. Recovers digits printed inside
     * dark bands and under reflections — exactly the receipt failure mode
     * the global tone curve in enhanceForOcr() can't fix.
     *
     * Algorithm (per pixel):
     *   1. Convert to grayscale luminance.
     *   2. Estimate the local background as a heavily-blurred copy of the
     *      grayscale image (downscaled 8× then box-blurred several times,
     *      effective σ ≈ 60 px in the original frame).
     *   3. Subtract: out = clamp(gray - blurredBackground + WHITE_BIAS).
     *      Pixels where the local background is ≈ original (paper) snap to
     *      white; pixels where ink darkens the local average stay below.
     *   4. Mild S-curve to push the result towards crisp black-on-white.
     *
     * Output is grayscale-on-white in an ARGB bitmap (R=G=B). OCR engines
     * read this best, and the downstream `enhanceForOcr` auto-levels still
     * works as a safety net.
     */
    private Bitmap removeShadowsForOcr(Bitmap src) {
        try {
            int w = src.getWidth(), h = src.getHeight();
            if (w < 32 || h < 32) return src;

            int[] pixels = new int[w * h];
            src.getPixels(pixels, 0, w, 0, 0, w, h);

            // Grayscale luminance (Rec.601 coefficients).
            byte[] gray = new byte[w * h];
            for (int i = 0; i < w * h; i++) {
                int p = pixels[i];
                int r = (p >> 16) & 0xff;
                int g = (p >> 8) & 0xff;
                int b = p & 0xff;
                gray[i] = (byte) ((r * 299 + g * 587 + b * 114) / 1000);
            }

            // Downscale 8× by averaging — gives us a small image to blur
            // cheaply. ~1080×1440 → ~135×180 ≈ 24 K pixels.
            int dw = Math.max(8, w / 8);
            int dh = Math.max(8, h / 8);
            int[] small = new int[dw * dh];
            int[] count = new int[dw * dh];
            for (int y = 0; y < h; y++) {
                int dy = (y * dh) / h;
                if (dy >= dh) dy = dh - 1;
                int srcRow = y * w;
                int dstRow = dy * dw;
                for (int x = 0; x < w; x++) {
                    int dx = (x * dw) / w;
                    if (dx >= dw) dx = dw - 1;
                    int idx = dstRow + dx;
                    small[idx] += gray[srcRow + x] & 0xff;
                    count[idx]++;
                }
            }
            for (int i = 0; i < dw * dh; i++) {
                small[i] = count[i] > 0 ? small[i] / count[i] : 128;
            }

            // Background estimate via morphological MAX (dilate), not
            // mean. Paper is brighter than ink, so the local-max in a
            // wide-enough window snaps to the paper level even when the
            // window is centered on a dark band — provided the window
            // reaches at least one paper pixel. Mean fails this case
            // because in a thick dark band the average IS the band, and
            // digits inside the band aren't darker than the average,
            // so they bleach away with the band itself.
            //
            // Two-pass separable max-filter (dilate) with radius 12 in
            // 1/8 space ≈ 96 px in original. Bands narrower than this
            // get fully neutralised; ink inside them survives.
            int dilR = 12;
            int[] tmp = new int[dw * dh];
            // Horizontal max
            for (int y = 0; y < dh; y++) {
                int rowOff = y * dw;
                for (int x = 0; x < dw; x++) {
                    int x0 = Math.max(0, x - dilR);
                    int x1 = Math.min(dw - 1, x + dilR);
                    int mx = 0;
                    for (int xi = x0; xi <= x1; xi++) {
                        int v = small[rowOff + xi];
                        if (v > mx) mx = v;
                    }
                    tmp[rowOff + x] = mx;
                }
            }
            // Vertical max
            for (int x = 0; x < dw; x++) {
                for (int y = 0; y < dh; y++) {
                    int y0 = Math.max(0, y - dilR);
                    int y1 = Math.min(dh - 1, y + dilR);
                    int mx = 0;
                    for (int yi = y0; yi <= y1; yi++) {
                        int v = tmp[yi * dw + x];
                        if (v > mx) mx = v;
                    }
                    small[y * dw + x] = mx;
                }
            }
            // Now smooth the max-filter result with a light 2-pass box
            // blur (radius 4) so the background doesn't have block-y
            // step edges where the dilate window boundary fell.
            int blurR = 4;
            for (int pass = 0; pass < 2; pass++) {
                for (int y = 0; y < dh; y++) {
                    int rowOff = y * dw;
                    for (int x = 0; x < dw; x++) {
                        int x0 = Math.max(0, x - blurR);
                        int x1 = Math.min(dw - 1, x + blurR);
                        int sum = 0;
                        for (int xi = x0; xi <= x1; xi++) sum += small[rowOff + xi];
                        tmp[rowOff + x] = sum / (x1 - x0 + 1);
                    }
                }
                for (int x = 0; x < dw; x++) {
                    for (int y = 0; y < dh; y++) {
                        int y0 = Math.max(0, y - blurR);
                        int y1 = Math.min(dh - 1, y + blurR);
                        int sum = 0;
                        for (int yi = y0; yi <= y1; yi++) sum += tmp[yi * dw + x];
                        small[y * dw + x] = sum / (y1 - y0 + 1);
                    }
                }
            }

            // Global paper-level fallback. The local dilate above can
            // only reach `dilR * 8` pixels in original space (~96 px) —
            // bands wider than that have no paper-bright pixel inside
            // the window, so the local-max collapses to the band's own
            // dark luminance and the subtraction would also bleach away
            // any ink printed inside the band.
            //
            // To prevent that, we compute the paper level globally from
            // the grayscale histogram (the 85th percentile is robust:
            // ink is < 50 % of pixels on a typical receipt, so anything
            // beyond the 80-th is the paper cluster). The per-pixel
            // background is the MAX of the local estimate and this
            // global floor — so a pixel inside a wide dark band still
            // gets compared against paper-level brightness, and ink
            // inside the band stays dark in the output.
            int[] gHist = new int[256];
            for (int i = 0; i < w * h; i++) gHist[gray[i] & 0xff]++;
            int target85 = (int) (((long) w * h * 85L) / 100L);
            int paperGlobal = 240;
            int cumG = 0;
            for (int i = 0; i < 256; i++) {
                cumG += gHist[i];
                if (cumG >= target85) { paperGlobal = i; break; }
            }
            // Sanity floor — never let paper drop below mid-grey, even
            // if the entire image is dim (e.g. dark restaurant lighting).
            if (paperGlobal < 150) paperGlobal = 150;

            // Per-pixel shadow removal + white-bias. We push the bias up
            // to 240 so the paper looks crisp-white in the final output
            // (a scanner ships ~248–252 for paper). Auto-levels still has
            // 15-pt headroom to push genuine paper to 255.
            final int whiteBias = 240;
            final float contrast = 1.30f; // S-curve — moderate, not punchy
            int[] out = new int[w * h];
            for (int y = 0; y < h; y++) {
                int dy = (y * dh) / h;
                if (dy >= dh) dy = dh - 1;
                int srcRow = y * w;
                int dyRow = dy * dw;
                for (int x = 0; x < w; x++) {
                    int dx = (x * dw) / w;
                    if (dx >= dw) dx = dw - 1;
                    int localBg = small[dyRow + dx];
                    // Floor at the global paper level — see comment above
                    // the histogram pass. This is what saves ink that's
                    // sitting inside a wide dark band: deep in the band
                    // localBg collapses to the band's own darkness, and
                    // without this floor the subtraction would bleach
                    // away the digits along with the band.
                    int bg = localBg > paperGlobal ? localBg : paperGlobal;
                    int g = gray[srcRow + x] & 0xff;
                    int v = g - bg + whiteBias;
                    if (v < 0) v = 0; else if (v > 255) v = 255;
                    // Contrast around the bias point.
                    int v2 = (int) ((v - whiteBias) * contrast + whiteBias);
                    if (v2 < 0) v2 = 0; else if (v2 > 255) v2 = 255;
                    out[srcRow + x] = 0xff000000 | (v2 << 16) | (v2 << 8) | v2;
                }
            }

            Bitmap dst = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            dst.setPixels(out, 0, w, 0, 0, w, h);
            return dst;
        } catch (Throwable t) {
            // Anything goes wrong → ship the original. The next stage's
            // auto-levels still cleans up reasonably well.
            return src;
        }
    }

    /**
     * Light unsharp mask — gives the post-processed image the crisp edge
     * profile of a flatbed-scanner JPEG. We use a soft 3×3 kernel:
     *   center = 1 + 4·k
     *   N/S/E/W = -k
     * with k = 0.45 — strong enough to make digits pop, soft enough to
     * avoid the ringing halos heavier kernels (k=1, "5/-1") leave around
     * text. Output is clamped per channel.
     */
    private Bitmap sharpenForScan(Bitmap src) {
        try {
            int w = src.getWidth(), h = src.getHeight();
            if (w < 3 || h < 3) return src;
            int[] in = new int[w * h];
            src.getPixels(in, 0, w, 0, 0, w, h);
            int[] out = new int[w * h];
            // Border pass-through (avoids index-out-of-range on the edge row/col).
            for (int x = 0; x < w; x++) { out[x] = in[x]; out[(h - 1) * w + x] = in[(h - 1) * w + x]; }
            for (int y = 0; y < h; y++) { out[y * w] = in[y * w]; out[y * w + w - 1] = in[y * w + w - 1]; }
            // 3×3 cross sharpen — soft unsharp.
            // out[c] = clamp(centerWeight*in[c] - k*(N+S+E+W))
            final int K = 45;       // 0.45 in fixed-point /100
            final int CENTER = 280; // 1 + 4*0.45 = 2.80
            for (int y = 1; y < h - 1; y++) {
                int rowOff = y * w;
                for (int x = 1; x < w - 1; x++) {
                    int idx = rowOff + x;
                    int c = in[idx];
                    int up = in[idx - w];
                    int dn = in[idx + w];
                    int lt = in[idx - 1];
                    int rt = in[idx + 1];
                    int rO = (((c >> 16) & 0xff) * CENTER
                            - (((up >> 16) & 0xff) + ((dn >> 16) & 0xff)
                                + ((lt >> 16) & 0xff) + ((rt >> 16) & 0xff)) * K) / 100;
                    int gO = (((c >> 8) & 0xff) * CENTER
                            - (((up >> 8) & 0xff) + ((dn >> 8) & 0xff)
                                + ((lt >> 8) & 0xff) + ((rt >> 8) & 0xff)) * K) / 100;
                    int bO = ((c & 0xff) * CENTER
                            - ((up & 0xff) + (dn & 0xff)
                                + (lt & 0xff) + (rt & 0xff)) * K) / 100;
                    if (rO < 0) rO = 0; else if (rO > 255) rO = 255;
                    if (gO < 0) gO = 0; else if (gO > 255) gO = 255;
                    if (bO < 0) bO = 0; else if (bO > 255) bO = 255;
                    out[idx] = 0xff000000 | (rO << 16) | (gO << 8) | bO;
                }
            }
            Bitmap dst = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            dst.setPixels(out, 0, w, 0, 0, w, h);
            return dst;
        } catch (Throwable t) {
            return src;
        }
    }

    private Bitmap enhanceForOcr(Bitmap src) {
        try {
            int w = src.getWidth(), h = src.getHeight();
            int total = w * h;
            if (total == 0) return src;

            // Sample histogram (every 4th pixel keeps it fast on big scans without
            // changing the percentile estimates meaningfully).
            int[] pixels = new int[total];
            src.getPixels(pixels, 0, w, 0, 0, w, h);
            int[] hist = new int[256];
            int sampled = 0;
            for (int i = 0; i < pixels.length; i += 4) {
                int p = pixels[i];
                int r = (p >> 16) & 0xff;
                int g = (p >> 8) & 0xff;
                int b = p & 0xff;
                int lum = (r * 299 + g * 587 + b * 114) / 1000;
                hist[lum]++;
                sampled++;
            }

            int low = percentile(hist, sampled, 0.01);
            int high = percentile(hist, sampled, 0.99);
            // Safety: don't over-amplify near-uniform images.
            if (high - low < 40) {
                low = Math.max(0, low - 8);
                high = Math.min(255, high + 8);
            }
            float levelScale = 255f / Math.max(1, high - low);
            float levelTrans = -low * levelScale;

            ColorMatrix cm = new ColorMatrix(new float[] {
                levelScale, 0, 0, 0, levelTrans,
                0, levelScale, 0, 0, levelTrans,
                0, 0, levelScale, 0, levelTrans,
                0, 0, 0, 1, 0,
            });

            // Slight desaturation (0 = grayscale, 1 = unchanged).
            ColorMatrix sat = new ColorMatrix();
            sat.setSaturation(0.85f);
            cm.postConcat(sat);

            // Mild contrast bump around mid-grey.
            float c = 1.10f;
            float t = (1 - c) * 128;
            ColorMatrix contrast = new ColorMatrix(new float[] {
                c, 0, 0, 0, t,
                0, c, 0, 0, t,
                0, 0, c, 0, t,
                0, 0, 0, 1, 0,
            });
            cm.postConcat(contrast);

            Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            Paint paint = new Paint();
            paint.setAntiAlias(true);
            paint.setFilterBitmap(true);
            paint.setColorFilter(new ColorMatrixColorFilter(cm));
            canvas.drawBitmap(src, 0, 0, paint);
            return out;
        } catch (Throwable t) {
            // If anything fails, return the original; we'd rather upload an unenhanced
            // image than fail the scan.
            return src;
        }
    }

    private int percentile(int[] hist, int total, double pct) {
        int target = Math.max(1, (int) (total * pct));
        int cum = 0;
        for (int i = 0; i < hist.length; i++) {
            cum += hist[i];
            if (cum >= target) return i;
        }
        return 255;
    }

    /**
     * Computes blur, brightness and contrast metrics on a centre crop of the scan, and
     * picks the most actionable warning string if any threshold is exceeded. The thresholds
     * below are tuned for receipts/A4 photographed with a phone — they accept anything OCR
     * can plausibly handle, and only flag images that *will* hurt OCR accuracy.
     */
    private Quality assessQuality(Bitmap bmp) {
        Quality q = new Quality();
        int w = bmp.getWidth(), h = bmp.getHeight();
        if (w < 4 || h < 4) return q;

        // Centre crop (50%) — edges of a doc photo often include borders/shadows that
        // skew the metrics; the centre is where the text lives and what OCR cares about.
        int sx = w / 4, sy = h / 4;
        int sw = w / 2, sh = h / 2;
        int[] pixels = new int[sw * sh];
        bmp.getPixels(pixels, 0, sw, sx, sy, sw, sh);

        int[] lum = new int[sw * sh];
        long sumLum = 0;
        for (int i = 0; i < pixels.length; i++) {
            int p = pixels[i];
            int r = (p >> 16) & 0xff;
            int g = (p >> 8) & 0xff;
            int b = p & 0xff;
            int l = (r * 299 + g * 587 + b * 114) / 1000;
            lum[i] = l;
            sumLum += l;
        }
        q.brightness = (float)(sumLum / (double)pixels.length);

        long sqDiff = 0;
        for (int i = 0; i < lum.length; i++) {
            long d = lum[i] - (long)q.brightness;
            sqDiff += d * d;
        }
        q.contrast = (float) Math.sqrt(sqDiff / (double)lum.length);

        // Laplacian variance — classic blur metric. Higher = sharper. Below ~80 on a
        // real document photo means visibly blurry to a human.
        double lapSum = 0, lapSqSum = 0;
        int n = 0;
        for (int y = 1; y < sh - 1; y++) {
            for (int x = 1; x < sw - 1; x++) {
                int idx = y * sw + x;
                int lap = 4 * lum[idx] - lum[idx - 1] - lum[idx + 1] - lum[idx - sw] - lum[idx + sw];
                lapSum += lap;
                lapSqSum += (double) lap * lap;
                n++;
            }
        }
        if (n > 0) {
            double mean = lapSum / n;
            q.blurScore = (float)(lapSqSum / n - mean * mean);
        }

        // Warning priority — pick the most actionable single issue, not a list of them.
        if (q.blurScore < 80) q.warning = "blur";
        else if (q.brightness < 55) q.warning = "dark";
        else if (q.brightness > 235) q.warning = "bright";
        else if (q.contrast < 18) q.warning = "lowContrast";

        return q;
    }

    private static class Quality {
        float blurScore = 0f;
        float brightness = 128f;
        float contrast = 50f;
        String warning = null;
    }

    private PluginCall currentCall() {
        if (pendingCallId == null) return null;
        return bridge.getSavedCall(pendingCallId);
    }

    private void clearCall() {
        if (pendingCallId != null) {
            bridge.releaseCall(pendingCallId);
            pendingCallId = null;
        }
    }
}
