package kz.dostup.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenProtectionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
