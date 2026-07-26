package com.anonymous.FOLLI_CONSOLE

import android.app.ActivityManager
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// Native side of the kiosk lockdown (see native/android/README_KIOSK.md).
// startLockTask() pins the app so Home/Recents/gestures cannot leave it.
// Without device-owner provisioning Android shows a one-time pinning prompt
// and the pin can be escaped with Back+Recents; once the app is made device
// owner (adb dpm set-device-owner) the pin is absolute.
class FolliKioskModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "FolliKiosk"

    @ReactMethod
    fun startLockTask(promise: Promise) {
        try {
            val activity = ctx.currentActivity
            activity?.runOnUiThread {
                try {
                    activity.startLockTask()
                } catch (_: Exception) {
                    // Not permitted (no device owner + pinning declined) — JS side
                    // still has its own soft lockdown, so swallow quietly.
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_LOCK_TASK_FAILED", e)
        }
    }

    @ReactMethod
    fun stopLockTask(promise: Promise) {
        try {
            val activity = ctx.currentActivity
            activity?.runOnUiThread {
                try {
                    activity.stopLockTask()
                } catch (_: Exception) {
                    // Already unpinned — nothing to do.
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_LOCK_TASK_FAILED", e)
        }
    }

    @ReactMethod
    fun isLockTaskActive(promise: Promise) {
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        promise.resolve(am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE)
    }
}
