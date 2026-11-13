package com.siampos.pro;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ปลั๊กอินเครื่องพิมพ์ของแอป Android (เรียกจาก src/services/nativePrinter.js)
 * - printHtml: สั่งพิมพ์เอกสาร HTML ผ่านระบบพิมพ์ของ Android (PrintManager) แทน window.print() ที่ WebView ไม่รองรับ
 * - Bluetooth: ส่งคำสั่ง ESC/POS ไปเครื่องพิมพ์ความร้อน Bluetooth แบบ SPP (รวมถึง "InnerPrinter" ในตัวเครื่อง Sunmi)
 *   ใช้เฉพาะอุปกรณ์ที่จับคู่ (Pair) ไว้ในตั้งค่า Bluetooth ของเครื่องแล้ว
 */
@CapacitorPlugin(
    name = "SiamPrinter",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class SiamPrinterPlugin extends Plugin {

    // UUID มาตรฐานของ Serial Port Profile (SPP) ที่เครื่องพิมพ์ความร้อน Bluetooth ใช้
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int CHUNK_SIZE = 1024;

    // ส่งข้อมูล Bluetooth ทีละงานตามลำดับ (กันสองใบเสร็จส่งพร้อมกันแล้วข้อมูลปนกัน)
    private final ExecutorService btExecutor = Executors.newSingleThreadExecutor();
    private BluetoothSocket socket;
    private String socketAddress;
    // เก็บ WebView ที่ใช้พิมพ์ไว้ ไม่ให้ถูกเก็บกวาดก่อนพิมพ์เสร็จ
    private WebView printWebView;

    // ---------------------------------------------------------------------------
    // พิมพ์ผ่านระบบพิมพ์ของ Android
    // ---------------------------------------------------------------------------

    @PluginMethod
    public void printHtml(PluginCall call) {
        final String html = call.getString("html");
        final String jobName = call.getString("jobName", "SiamPOS");
        if (html == null || html.isEmpty()) {
            call.reject("ไม่มีเอกสารสำหรับพิมพ์");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                final WebView webView = new WebView(getActivity());
                webView.getSettings().setJavaScriptEnabled(false);
                webView.setWebViewClient(new WebViewClient() {
                    private boolean printed = false;

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (printed) return;
                        printed = true;
                        PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) {
                            call.reject("เครื่องนี้ไม่มีระบบพิมพ์ของ Android");
                            return;
                        }
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                        printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
                        call.resolve();
                    }
                });
                printWebView = webView;
                webView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                call.reject("สั่งพิมพ์ไม่สำเร็จ: " + e.getMessage());
            }
        });
    }

    // ---------------------------------------------------------------------------
    // Bluetooth (SPP)
    // ---------------------------------------------------------------------------

    // Android 12+ ต้องขอสิทธิ์ BLUETOOTH_CONNECT ตอนใช้งาน / Android 11 ลงไปเป็นสิทธิ์ปกติที่ได้ตอนติดตั้ง
    private boolean needsBluetoothPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter getAdapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : null;
    }

    @PluginMethod
    public void listBluetoothDevices(PluginCall call) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "listDevicesPermissionCallback");
            return;
        }
        doListDevices(call);
    }

    @PermissionCallback
    private void listDevicesPermissionCallback(PluginCall call) {
        if (needsBluetoothPermission()) {
            call.reject("ไม่ได้รับสิทธิ์ใช้ Bluetooth (อุปกรณ์ใกล้เคียง)", "PERMISSION_DENIED");
            return;
        }
        doListDevices(call);
    }

    @SuppressLint("MissingPermission")
    private void doListDevices(PluginCall call) {
        BluetoothAdapter adapter = getAdapter();
        if (adapter == null) {
            call.reject("เครื่องนี้ไม่มี Bluetooth", "NO_BLUETOOTH");
            return;
        }
        JSObject result = new JSObject();
        result.put("enabled", adapter.isEnabled());
        JSArray devices = new JSArray();
        if (adapter.isEnabled()) {
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice device : bonded) {
                    JSObject item = new JSObject();
                    item.put("name", device.getName() != null ? device.getName() : device.getAddress());
                    item.put("address", device.getAddress());
                    devices.put(item);
                }
            }
        }
        result.put("devices", devices);
        call.resolve(result);
    }

    @PluginMethod
    public void bluetoothWrite(PluginCall call) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "writePermissionCallback");
            return;
        }
        doWrite(call);
    }

    @PermissionCallback
    private void writePermissionCallback(PluginCall call) {
        if (needsBluetoothPermission()) {
            call.reject("ไม่ได้รับสิทธิ์ใช้ Bluetooth (อุปกรณ์ใกล้เคียง)", "PERMISSION_DENIED");
            return;
        }
        doWrite(call);
    }

    private void doWrite(PluginCall call) {
        final String address = call.getString("address");
        final String data = call.getString("data");
        if (address == null || address.isEmpty()) {
            call.reject("ยังไม่ได้เลือกเครื่องพิมพ์ Bluetooth");
            return;
        }
        if (data == null) {
            call.reject("ไม่มีข้อมูลสำหรับพิมพ์");
            return;
        }
        final byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        btExecutor.execute(() -> {
            try {
                writeWithRetry(address, bytes);
                call.resolve();
            } catch (Exception e) {
                call.reject("ส่งข้อมูลไปเครื่องพิมพ์ Bluetooth ไม่สำเร็จ: " + e.getMessage(), "WRITE_FAILED");
            }
        });
    }

    // ใช้การเชื่อมต่อเดิมถ้ายังเปิดอยู่ ถ้าส่งไม่ผ่าน (เครื่องพิมพ์ปิด/หลุด) ให้เชื่อมใหม่ 1 ครั้ง
    private void writeWithRetry(String address, byte[] bytes) throws IOException {
        try {
            writeBytes(ensureSocket(address), bytes);
        } catch (IOException first) {
            closeSocket();
            writeBytes(ensureSocket(address), bytes);
        }
    }

    private void writeBytes(BluetoothSocket target, byte[] bytes) throws IOException {
        OutputStream out = target.getOutputStream();
        for (int i = 0; i < bytes.length; i += CHUNK_SIZE) {
            int len = Math.min(CHUNK_SIZE, bytes.length - i);
            out.write(bytes, i, len);
        }
        out.flush();
    }

    @SuppressLint("MissingPermission")
    private BluetoothSocket ensureSocket(String address) throws IOException {
        if (socket != null && socket.isConnected() && address.equalsIgnoreCase(socketAddress)) {
            return socket;
        }
        closeSocket();
        BluetoothAdapter adapter = getAdapter();
        if (adapter == null) throw new IOException("เครื่องนี้ไม่มี Bluetooth");
        if (!adapter.isEnabled()) throw new IOException("Bluetooth ปิดอยู่");
        BluetoothDevice device = adapter.getRemoteDevice(address);
        adapter.cancelDiscovery();
        BluetoothSocket next = device.createRfcommSocketToServiceRecord(SPP_UUID);
        try {
            next.connect();
        } catch (IOException secureFailed) {
            try {
                next.close();
            } catch (IOException ignored) {
                // ปิดไม่ได้ก็ทิ้งไป
            }
            // เครื่องพิมพ์ราคาประหยัดบางรุ่นรับเฉพาะการเชื่อมต่อแบบ insecure
            next = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            next.connect();
        }
        socket = next;
        socketAddress = address;
        return socket;
    }

    private void closeSocket() {
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
                // ปิดไม่ได้ก็ทิ้งไป
            }
        }
        socket = null;
        socketAddress = null;
    }

    @PluginMethod
    public void bluetoothStatus(PluginCall call) {
        if (needsBluetoothPermission()) {
            JSObject result = new JSObject();
            result.put("permission", false);
            call.resolve(result);
            return;
        }
        doStatus(call);
    }

    @SuppressLint("MissingPermission")
    private void doStatus(PluginCall call) {
        final String address = call.getString("address", "");
        BluetoothAdapter adapter = getAdapter();
        JSObject result = new JSObject();
        result.put("permission", true);
        result.put("available", adapter != null);
        result.put("enabled", adapter != null && adapter.isEnabled());
        boolean bonded = false;
        if (adapter != null && adapter.isEnabled() && address != null && !address.isEmpty()) {
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            if (devices != null) {
                for (BluetoothDevice device : devices) {
                    if (address.equalsIgnoreCase(device.getAddress())) {
                        bonded = true;
                        break;
                    }
                }
            }
        }
        result.put("bonded", bonded);
        result.put("connected", socket != null && socket.isConnected() && address != null && address.equalsIgnoreCase(socketAddress));
        call.resolve(result);
    }

    @PluginMethod
    public void bluetoothDisconnect(PluginCall call) {
        btExecutor.execute(() -> {
            closeSocket();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        closeSocket();
        btExecutor.shutdown();
        super.handleOnDestroy();
    }
}
