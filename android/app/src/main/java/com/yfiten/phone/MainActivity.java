package com.yfiten.phone;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DocumentScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == DocumentScannerPlugin.REQ_CODE) {
            try {
                PluginHandle handle = getBridge().getPlugin("DocumentScanner");
                if (handle != null && handle.getInstance() instanceof DocumentScannerPlugin) {
                    ((DocumentScannerPlugin) handle.getInstance())
                        .handleScanResult(resultCode, data);
                }
            } catch (Throwable t) {
                // swallow — plugin will time out the call if anything goes wrong
            }
        }
    }
}
