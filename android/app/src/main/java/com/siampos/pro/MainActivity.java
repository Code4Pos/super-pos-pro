package com.siampos.pro;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ปลั๊กอินในแอป (ไม่ได้มาจาก npm) ต้องลงทะเบียนก่อน super.onCreate
        registerPlugin(SiamPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
