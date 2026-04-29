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

            Quality quality = assessQuality(bmp);
            Bitmap enhanced = enhanceForOcr(bmp);
            if (enhanced != bmp) bmp.recycle();

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            enhanced.compress(Bitmap.CompressFormat.JPEG, 90, baos);
            byte[] jpeg = baos.toByteArray();
            enhanced.recycle();

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
