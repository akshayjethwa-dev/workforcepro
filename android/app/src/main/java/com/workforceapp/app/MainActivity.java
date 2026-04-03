package com.workforceapp.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Fixes the Android 15 Edge-to-Edge warning for Google Play
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        
        // BULLETPROOF FIX: Forcibly hide the Android native action bar
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
    }
}