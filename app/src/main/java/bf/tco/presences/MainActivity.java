package bf.tco.presences;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * TCO Présences : l'application web (assets/www) tourne dans une WebView.
 * Cette activité lui fournit l'appareil photo, la galerie, l'enregistrement
 * des exports dans « Téléchargements », l'impression PDF et les liens
 * téléphone / SMS / WhatsApp.
 */
public class MainActivity extends ComponentActivity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html";

    private WebView webView;
    private ValueCallback<Uri[]> pendingChooser;
    private Uri pendingPhotoUri;

    private final ActivityResultLauncher<Uri> takePicture =
            registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
                deliver(ok != null && ok && pendingPhotoUri != null ? new Uri[]{pendingPhotoUri} : null);
            });

    private final ActivityResultLauncher<String> pickContent =
            registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
                deliver(uri != null ? new Uri[]{uri} : null);
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Affichage bord à bord, avec marges calculées pour les barres système et le clavier.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0E5C61);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(sys.left, sys.top, sys.right, Math.max(sys.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                openExternal(uri);
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingChooser != null) pendingChooser.onReceiveValue(null);
                pendingChooser = callback;
                String accept = "*/*";
                String[] types = params.getAcceptTypes();
                if (types != null && types.length > 0 && types[0] != null && !types[0].isEmpty()) {
                    accept = types[0].contains("image") ? "image/*" : "*/*";
                }
                try {
                    if (params.isCaptureEnabled() && accept.startsWith("image")) {
                        File dir = new File(getCacheDir(), "photos");
                        //noinspection ResultOfMethodCallIgnored
                        dir.mkdirs();
                        File f = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
                        pendingPhotoUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                        takePicture.launch(pendingPhotoUri);
                    } else {
                        pickContent.launch(accept);
                    }
                    return true;
                } catch (ActivityNotFoundException e) {
                    toast("Aucune application disponible pour cette action");
                    deliver(null);
                    return true;
                }
            }
        });

        webView.addJavascriptInterface(new Bridge(), "TCOAndroid");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else finish();
            }
        });

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    private void deliver(Uri[] result) {
        if (pendingChooser != null) {
            pendingChooser.onReceiveValue(result);
            pendingChooser = null;
        }
        pendingPhotoUri = null;
    }

    private void openExternal(Uri uri) {
        try {
            Intent i;
            if ("sms".equals(uri.getScheme()) || "smsto".equals(uri.getScheme())) {
                // « sms:70000000?body=… » est une adresse « opaque » : on la découpe à la main
                // (getQueryParameter() n'est pas utilisable dessus et faisait échouer le bouton SMS).
                String raw = uri.getEncodedSchemeSpecificPart();
                if (raw == null) raw = "";
                int q = raw.indexOf('?');
                String number = Uri.decode(q >= 0 ? raw.substring(0, q) : raw).replaceAll("[^0-9+]", "");
                String body = null;
                if (q >= 0) {
                    for (String part : raw.substring(q + 1).split("&")) {
                        if (part.startsWith("body=")) body = Uri.decode(part.substring(5));
                    }
                }
                i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + number));
                if (body != null) i.putExtra("sms_body", body);
            } else if ("tel".equals(uri.getScheme())) {
                // Ouvre le clavier d'appel avec le numéro déjà saisi (l'appel se lance d'un appui sur le bouton vert)
                String number = Uri.decode(uri.getEncodedSchemeSpecificPart() == null ? "" : uri.getEncodedSchemeSpecificPart()).replaceAll("[^0-9+]", "");
                i = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + number));
            } else {
                i = new Intent(Intent.ACTION_VIEW, uri);
            }
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            toast("Aucune application disponible pour ouvrir ce lien");
        } catch (Exception e) {
            toast("Lien impossible à ouvrir");
        }
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }

    /** Fonctions appelées depuis le JavaScript (window.TCOAndroid). */
    private class Bridge {

        /** Enregistre un fichier texte (CSV, sauvegarde JSON) et propose de le partager. */
        @JavascriptInterface
        public String saveText(String name, String mime, String text) {
            String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            try {
                Uri shareUri;
                String where;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                    cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TCO Presences");
                    shareUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (shareUri == null) return "";
                    try (OutputStream os = getContentResolver().openOutputStream(shareUri)) {
                        if (os == null) return "";
                        os.write(bytes);
                    }
                    where = "Téléchargements/TCO Presences/" + safe;
                } else {
                    File dir = new File(getCacheDir(), "exports");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    File f = new File(dir, safe);
                    try (FileOutputStream os = new FileOutputStream(f)) {
                        os.write(bytes);
                    }
                    shareUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                    where = safe + " (à partager)";
                }
                final Uri u = shareUri;
                runOnUiThread(() -> {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, u);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(Intent.createChooser(send, "Envoyer le fichier"));
                    } catch (ActivityNotFoundException ignored) {
                    }
                });
                return where;
            } catch (Exception e) {
                return "";
            }
        }

        /** Ouvre la fenêtre d'impression Android (choisir « Enregistrer au format PDF »). */
        @JavascriptInterface
        public void printPage(String title) {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                if (pm == null) return;
                String job = (title == null || title.isEmpty()) ? "Bilan TCO" : title;
                pm.print(job, webView.createPrintDocumentAdapter(job),
                        new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }

        /** Masque l'écran dans les applications récentes et bloque les captures quand un code d'accès est actif. */
        @JavascriptInterface
        public void setSecure(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            });
        }

        /** Impression en paysage (grand bilan : un membre par ligne, une rencontre par colonne). */
        @JavascriptInterface
        public void printPageLandscape(String title) {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                if (pm == null) return;
                String job = (title == null || title.isEmpty()) ? "Grand bilan TCO" : title;
                pm.print(job, webView.createPrintDocumentAdapter(job),
                        new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape()).build());
            });
        }
    }
}
