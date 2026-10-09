package kz.dostup.app;

import android.os.Build;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.function.Consumer;

@CapacitorPlugin(name = "ScreenProtection")
public class ScreenProtectionPlugin extends Plugin {
    private boolean isCaptured = false;
    private WindowManager windowManager;
    private Consumer<Integer> recordingCallback;

    @Override
    public void load() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return;

        getActivity().runOnUiThread(() -> {
            windowManager = getActivity().getSystemService(WindowManager.class);
            recordingCallback = this::handleRecordingState;
            int initialState = windowManager.addScreenRecordingCallback(
                getContext().getMainExecutor(),
                recordingCallback
            );
            handleRecordingState(initialState);
        });
    }

    @PluginMethod
    public void setProtected(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));

        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void isCaptured(PluginCall call) {
        JSObject result = new JSObject();
        result.put("isCaptured", isCaptured);
        call.resolve(result);
    }

    private void handleRecordingState(int state) {
        isCaptured = state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE;
        JSObject result = new JSObject();
        result.put("isCaptured", isCaptured);
        notifyListeners("screenCaptureChanged", result, true);
    }

    @Override
    protected void handleOnDestroy() {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM &&
            windowManager != null &&
            recordingCallback != null
        ) {
            windowManager.removeScreenRecordingCallback(recordingCallback);
        }
        super.handleOnDestroy();
    }
}
