param(
    [ValidateSet("aarch64", "armv7", "x86_64", "universal", "all")]
    [string]$Target = "all",
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

$abiMap = @{
    "aarch64" = @{ rust = "aarch64-linux-android"; jni = "arm64-v8a"; gradle = if ($Release) { ":app:assembleArm64Release" } else { ":app:assembleArm64Debug" }; apk = if ($Release) { "app-arm64-release.apk" } else { "app-arm64-debug.apk" }; outName = "arm64" }
    "armv7"   = @{ rust = "armv7-linux-androideabi"; jni = "armeabi-v7a"; gradle = if ($Release) { ":app:assembleArmRelease" } else { ":app:assembleArmDebug" }; apk = if ($Release) { "app-arm-release.apk" } else { "app-arm-debug.apk" }; outName = "armv7" }
    "x86_64"  = @{ rust = "x86_64-linux-android"; jni = "x86_64"; gradle = if ($Release) { ":app:assembleX86_64Release" } else { ":app:assembleX86_64Debug" }; apk = if ($Release) { "app-x86_64-release.apk" } else { "app-x86_64-debug.apk" }; outName = "x86_64" }
}

$targetsToBuild = if ($Target -eq "all" -or $Target -eq "universal") { @("aarch64", "armv7", "x86_64") } else { @($Target) }

Write-Host "1/3  Compiling frontend and rust native targets: $($targetsToBuild -join ', ')"

foreach ($t in $targetsToBuild) {
    $info = $abiMap[$t]
    Write-Host "-> Building Rust target for $t ($($info.rust))..."
    $tauriArgs = @("tauri", "android", "build", "--apk", "--target", $t, "--ci")
    if (-not $Release) { $tauriArgs = @("tauri", "android", "build", "--debug") + $tauriArgs[3..($tauriArgs.Length - 1)] }
    try {
        pnpm @tauriArgs
    } catch {
        # Windows symlink fallback is handled below
    }

    $soSrc = Join-Path $Root "src-tauri\target\$($info.rust)\$(if ($Release) { 'release' } else { 'debug' })\libstream_lib.so"
    if (-not (Test-Path $soSrc)) {
        throw "Rust library missing at $soSrc."
    }

    $soDestDir = Join-Path $AndroidDir "app\src\main\jniLibs\$($info.jni)"
    New-Item -ItemType Directory -Force -Path $soDestDir | Out-Null
    Copy-Item -Force $soSrc (Join-Path $soDestDir "libstream_lib.so")
}

Write-Host "2/3  Assembling APKs with Gradle..."
$gradle = Join-Path $AndroidDir "gradlew.bat"
$gradleTasks = if ($Target -eq "all" -or $Target -eq "universal") {
    if ($Release) { ":app:assembleRelease" } else { ":app:assembleDebug" }
} else {
    $abiMap[$Target].gradle
}

$exclude = if ($Release) { "rustBuild*" } else { "rustBuild*" }
& $gradle -p $AndroidDir $gradleTasks "-x" "rustBuildArm64Debug" "-x" "rustBuildArm64Release" "-x" "rustBuildArmDebug" "-x" "rustBuildArmRelease" "-x" "rustBuildX86_64Debug" "-x" "rustBuildX86_64Release" "-x" "rustBuildUniversalDebug" "-x" "rustBuildUniversalRelease"
if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit $LASTEXITCODE" }

Write-Host "3/3  Collecting Output APKs..."
$builtApks = Get-ChildItem -Path (Join-Path $AndroidDir "app\build\outputs\apk") -Filter "*.apk" -Recurse
New-Item -ItemType Directory -Force -Path (Join-Path $Root "dist") | Out-Null

foreach ($apk in $builtApks) {
    $dest = Join-Path $Root "dist\Stream-$Version-$($apk.Name)"
    Copy-Item -Force $apk.FullName $dest
    Write-Host "APK ready: $dest"
    Write-Host ("Size: {0:N1} MB" -f ((Get-Item $dest).Length / 1MB))
}

Write-Host ""
Write-Host "All targets compiled and ready for any device or emulator!"
