package com.siampos.pro;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ข้อมูลเวอร์ชันแอปและการติดตั้ง APK ใหม่จากในแอป (เรียกจาก src/services/appUpdater.js)
 * - getInfo: versionCode / versionName / nativeApi (ระดับโค้ด native จาก native-version.json)
 * - installApk: ดาวน์โหลด APK แล้วเปิดหน้าติดตั้งของ Android (ผู้ใช้ต้องกด "ติดตั้ง" ยืนยันเองตามกฎของ Android)
 */
@CapacitorPlugin(name = "SiamApp")
public class SiamAppPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            result.put("versionCode", versionCode);
            result.put("versionName", info.versionName);
        } catch (PackageManager.NameNotFoundException e) {
            result.put("versionCode", 0);
            result.put("versionName", "");
        }
        result.put("nativeApi", BuildConfig.NATIVE_API);
        result.put("canInstallPackages", canInstallPackages());
        call.resolve(result);
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("ไม่มีลิงก์ไฟล์ติดตั้ง");
            return;
        }
        // Android 8+ ต้องอนุญาต "ติดตั้งแอปที่ไม่รู้จัก" ให้แอปนี้ก่อน (ครั้งแรกครั้งเดียว)
        if (!canInstallPackages()) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.reject("กรุณาอนุญาต \"ติดตั้งแอปที่ไม่รู้จัก\" ให้ SiamPOS Pro แล้วกดอัปเดตอีกครั้ง", "NEED_INSTALL_PERMISSION");
            return;
        }
        if (downloading) {
            call.reject("กำลังดาวน์โหลดไฟล์อัปเดตอยู่", "BUSY");
            return;
        }
        downloading = true;
        executor.execute(() -> {
            try {
                File apk = download(url);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("ดาวน์โหลดไฟล์อัปเดตไม่สำเร็จ: " + e.getMessage(), "DOWNLOAD_FAILED");
            } finally {
                downloading = false;
            }
        });
    }

    // ดาวน์โหลดลงโฟลเดอร์ cache (ตาม file_paths.xml) ตามลิงก์ redirect ของ GitHub Releases
    private File download(String address) throws Exception {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("สร้างโฟลเดอร์ชั่วคราวไม่ได้");
        File target = new File(dir, "SiamPOS-Pro-update.apk");
        File partial = new File(dir, "SiamPOS-Pro-update.apk.part");

        String current = address;
        HttpURLConnection conn = null;
        for (int redirects = 0; redirects < 5; redirects++) {
            conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);
            int status = conn.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) throw new Exception("ลิงก์ดาวน์โหลดไม่ถูกต้อง");
                current = new URL(new URL(current), location).toString();
                continue;
            }
            if (status != 200) {
                conn.disconnect();
                throw new Exception("เซิร์ฟเวอร์ตอบกลับ " + status);
            }
            break;
        }
        if (conn == null) throw new Exception("เชื่อมต่อไม่ได้");

        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        } finally {
            conn.disconnect();
        }
        if (target.exists() && !target.delete()) throw new Exception("ลบไฟล์อัปเดตเก่าไม่ได้");
        if (!partial.renameTo(target)) throw new Exception("บันทึกไฟล์อัปเดตไม่ได้");
        return target;
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
        super.handleOnDestroy();
    }
}
