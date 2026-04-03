package com.workforceapp.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge; // <-- Import this
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Explicitly enable Android 15 Edge-to-Edge API to satisfy Play Store requirements
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}