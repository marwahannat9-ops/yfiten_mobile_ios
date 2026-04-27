package com.yfiten.phone;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.net.Uri;
import android.util.Base64;

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
import java.io.InputStream;

@CapacitorPlugin(name = "DocumentScanner")
public class DocumentScannerPlugin extends Plugin {

    public static final int REQ_CODE = 9821;
    private PluginCall pendingCall;

    @PluginMethod
    public void scan(PluginCall call) {
        pendingCall = call;

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
                    if (pendingCall != null) {
                        pendingCall.reject("Failed to start scanner: " + e.getMessage());
                        pendingCall = null;
                    }
                }
            })
            .addOnFailureListener(e -> {
                if (pendingCall != null) {
                    pendingCall.reject("Scanner unavailable: " + e.getMessage());
                    pendingCall = null;
                }
            });
    }

    /**
     * Called from MainActivity.onActivityResult — Capacitor's bridge only routes
     * Activity results for request codes it registered itself, so we dispatch from
     * the host Activity directly into the plugin instance.
     */
    public void handleScanResult(int resultCode, Intent data) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        if (resultCode != Activity.RESULT_OK || data == null) {
            call.reject("cancelled");
            return;
        }

        try {
            GmsDocumentScanningResult result = GmsDocumentScanningResult.fromActivityResultIntent(data);
            if (result == null || result.getPages() == null || result.getPages().isEmpty()) {
                call.reject("No pages returned");
                return;
            }

            Uri imageUri = result.getPages().get(0).getImageUri();
            Bitmap bmp;
            try (InputStream is = getContext().getContentResolver().openInputStream(imageUri)) {
                bmp = BitmapFactory.decodeStream(is);
            }
            if (bmp == null) {
                call.reject("Failed to decode scanned image");
                return;
            }

            // Quality assessment runs on the *raw* scanner output (before our enhancement
            // pass), so we measure what the camera actually captured rather than what we
            // post-processed.
            Quality quality = assessQuality(bmp);

            // OCR-targeted enhancement: stretches contrast based on the document's actual
            // histogram (auto-levels), reduces colour cast, then applies a mild contrast
            // bump. Output is brighter, sharper text-on-paper that OCR handles better.
            Bitmap enhanced = enhanceForOcr(bmp);
            if (enhanced != bmp) bmp.recycle();

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            enhanced.compress(Bitmap.CompressFormat.JPEG, 90, baos);
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            enhanced.recycle();

            JSObject ret = new JSObject();
            ret.put("base64", base64);
            ret.put("format", "jpeg");
            ret.put("pageCount", result.getPages().size());
            ret.put("blurScore", quality.blurScore);
            ret.put("brightness", quality.brightness);
            ret.put("contrast", quality.contrast);
            if (quality.warning != null) ret.put("qualityWarning", quality.warning);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read scan result: " + e.getMessage());
        }
    }

    /**
     * Applies an OCR-friendly enhancement:
     *  1. Auto-levels — stretch luminance so the 1st percentile becomes black and the
     *     99th percentile becomes white. This neutralises shadows/yellow paper tint
     *     without crushing detail.
     *  2. Slight desaturation — colour casts (yellow paper, blue light) hurt OCR.
     *  3. Mild contrast boost — sharpens edges of text strokes.
     */
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
}
