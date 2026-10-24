package app.daynori.vault.candidate.android

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.widget.ScrollView
import android.widget.TextView

/**
 * Minimal isolated harness host. Not a vault unlock screen (Phase 46).
 */
class VaultHarnessActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = TextView(this).apply {
            setPadding(32, 32, 32, 32)
            textSize = 14f
            text =
                "Daynori vault Android candidate harness\n" +
                    "Run instrumentation: :android-app:connectedDebugAndroidTest\n" +
                    "Not an unlock UI. Not production vault."
        }
        setContentView(ScrollView(this).apply { addView(text) })
        Log.i(TAG, "VaultHarnessActivity started (candidate only)")
    }

    companion object {
        private const val TAG = "DaynoriVaultCandidate"
    }
}
