# Build Stream's Android APK from the command line (no Android Studio).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/android-build.ps1
# Optional: -Release   produce a release APK (needs a signing key later)

param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$Sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$Jdk = "C:\Program Files\Java\jdk-21.0.11"
$NdkVersion = "29.0.13846066"
$Root = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $Root "src-tauri\gen\android"

$pkgJson = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$Version = $pkgJson.version

$SoSrc = Join-Path $Root "src-tauri\target\aarch64-linux-android\debug\libstream_lib.so"
$SoDestDir = Join-Path $AndroidDir "app\src\main\jniLibs\arm64-v8a"
$ApkSrc = Join-Path $AndroidDir "app\build\outputs\apk\arm64\debug\app-arm64-debug.apk"
$ApkDest = Join-Path $Root "dist\Stream-$Version-arm64-debug.apk"

if ($Release) {
    $SoSrc = Join-Path $Root "src-tauri\target\aarch64-linux-android\release\libstream_lib.so"
    $ApkSrc = Join-Path $AndroidDir "app\build\outputs\apk\arm64\release\app-arm64-release.apk"
    $ApkDest = Join-Path $Root "dist\Stream-$Version-arm64.apk"
}

if (-not (Test-Path $Jdk)) { throw "JDK not found at $Jdk" }
if (-not (Test-Path $Sdk)) { throw "Android SDK not found at $Sdk" }

$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
$env:NDK_HOME = Join-Path $Sdk "ndk\$NdkVersion"
$env:ANDROID_NDK_HOME = $env:NDK_HOME
$env:ANDROID_NDK_ROOT = $env:NDK_HOME
$env:Path = "$Jdk\bin;$Sdk\platform-tools;$Sdk\cmdline-tools\latest\bin;$env:Path"

if (-not (Test-Path (Join-Path $AndroidDir "local.properties"))) {
    Set-Content -Path (Join-Path $AndroidDir "local.properties") -Value "sdk.dir=$($Sdk -replace '\\','\\')"
}

Set-Location $Root

$tauriArgs = @("tauri", "android", "build", "--apk", "--target", "aarch64", "--ci")
if (-not $Release) { $tauriArgs = @("tauri", "android", "build", "--debug") + $tauriArgs[3..($tauriArgs.Length - 1)] }

Write-Host "1/3  cargo + frontend via tauri android build"
$tauriFailed = $false
try {
    pnpm @tauriArgs
} catch {
    $tauriFailed = $true
}

if (-not (Test-Path $SoSrc)) {
    throw "Rust library missing at $SoSrc. Tauri/cargo failed before producing the .so."
}

Write-Host "2/3  copy libstream_lib.so into jniLibs (Windows cannot symlink without Developer Mode)"
New-Item -ItemType Directory -Force -Path $SoDestDir | Out-Null
Copy-Item -Force $SoSrc (Join-Path $SoDestDir "libstream_lib.so")

Write-Host "3/3  gradle assembleArm64$(if ($Release) { 'Release' } else { 'Debug' })"
$gradle = Join-Path $AndroidDir "gradlew.bat"
$task = if ($Release) { ":app:assembleArm64Release" } else { ":app:assembleArm64Debug" }
$exclude = if ($Release) { "rustBuildArm64Release" } else { "rustBuildArm64Debug" }
& $gradle -p $AndroidDir $task "-x" $exclude
if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit $LASTEXITCODE" }

if (-not (Test-Path $ApkSrc)) { throw "APK not found at $ApkSrc" }
New-Item -ItemType Directory -Force -Path (Split-Path $ApkDest) | Out-Null
Copy-Item -Force $ApkSrc $ApkDest

Write-Host ""
Write-Host "APK ready: $ApkDest"
Write-Host ("Size: {0:N1} MB" -f ((Get-Item $ApkDest).Length / 1MB))
Write-Host "Install: adb install -r `"$ApkDest`""
if ($tauriFailed) {
    Write-Host "Note: tauri android build hit the Windows symlink error; the APK was finished with a file copy + Gradle."
}
