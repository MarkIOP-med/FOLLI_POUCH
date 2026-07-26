# Making FOLLI Console an "unescapable" kiosk on Android

**Read this first — the honest version:** A normal Android app **cannot** block the
Home button, the Recents button, the notification shade, or the power menu from JS.
No amount of React Native code alone can do it. The app already ships the JS layer
of lockdown (blocks hardware Back, hides the status/nav bars in immersive mode,
keeps the screen awake). To make it genuinely *no-way-out*, you need Android's
**Lock Task Mode**, and to make Lock Task Mode itself non-escapable you must make
the app a **Device Owner**.

There are two levels. Pick based on what you can do to the Poco C71.

---

## Level 1 — Screen Pinning (no ADB, ~30s, user CAN still unpin)

This uses stock Android screen pinning. It's the fastest path but a user who
knows the trick (hold **Back + Recents**) can leave.

1. Settings → Security → **App pinning / Screen pinning** → On.
2. Open FOLLI Console, open Recents, tap the app icon → **Pin**.

That's it — no code change needed. Good for a demo.

---

## Level 2 — Device Owner + Lock Task (true kiosk, needs one ADB command)

This is the real thing. Once the app is Device Owner and calls `startLockTask()`,
Home/Recents/shade are dead and the app can only be left by calling
`stopLockTask()` from inside — which is exactly what the **EXIT** button does
(`KioskLock.exit()` → `stopLockTask()` → `exitApp()`).

### Step 1 — generate the native project
The `/android` folder is git-ignored and generated. Create it:

```bash
npx expo prebuild --platform android
```

### Step 2 — add the native module
Copy `FolliKioskModule.kt` and `FolliKioskPackage.kt` (below) into
`android/app/src/main/java/com/anonymous/FOLLI_CONSOLE/` and register the package
in `MainApplication.kt`'s `getPackages()` list:

```kotlin
packages.add(FolliKioskPackage())
```

`src/services/kiosk/KioskLock.ts` already calls `NativeModules.FolliKiosk`
(guarded — if the module is missing it's a graceful no-op), so no JS changes.

### Step 3 — make the app Device Owner
The device must have **no accounts** (factory-fresh or after a reset). Then:

```bash
adb shell dpm set-device-owner com.anonymous.FOLLI_CONSOLE/.kiosk.FolliDeviceAdminReceiver
```

(If you don't ship a DeviceAdminReceiver you can instead whitelist the package
for lock task from a provisioning app; the receiver approach above is simplest.)

### Step 4 — build & run
```bash
npx expo run:android
```

On launch, `useKioskLock` calls `KioskLock.start()` → `startLockTask()`. The app
is now locked. **EXIT** (behind `admin123`) is the only way out.

### To undo device owner during development
```bash
adb shell dpm remove-active-admin com.anonymous.FOLLI_CONSOLE/.kiosk.FolliDeviceAdminReceiver
```

---

## FolliKioskModule.kt

```kotlin
package com.anonymous.FOLLI_CONSOLE

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import com.facebook.react.bridge.*

class FolliKioskModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "FolliKiosk"

    @ReactMethod
    fun startLockTask(promise: Promise) {
        try {
            currentActivity?.runOnUiThread {
                currentActivity?.startLockTask()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_LOCK_TASK_FAILED", e)
        }
    }

    @ReactMethod
    fun stopLockTask(promise: Promise) {
        try {
            currentActivity?.runOnUiThread {
                currentActivity?.stopLockTask()
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
```

## FolliKioskPackage.kt

```kotlin
package com.anonymous.FOLLI_CONSOLE

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FolliKioskPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(FolliKioskModule(ctx))

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
```
