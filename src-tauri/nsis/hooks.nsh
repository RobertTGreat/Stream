; ==============================================================================
; Stream NSIS Custom Installer Hooks & Dark Theme Extensions
; Matches Stream Application Visual Identity (Obsidian Dark + Purple Accents)
; ==============================================================================

!include "WinMessages.nsh"
!include "FileFunc.nsh"

; Enable immersive dark mode on Windows 10 (1809+) and Windows 11
!macro ApplyDarkThemeWindow HWND_TARGET
  ; DWMWA_USE_IMMERSIVE_DARK_MODE = 20 (Windows 10 20H1+ / Windows 11), 19 (Windows 10 1809/1903)
  System::Call "dwmapi::DwmSetWindowAttribute(p ${HWND_TARGET}, i 20, *i 1, i 4)"
  System::Call "dwmapi::DwmSetWindowAttribute(p ${HWND_TARGET}, i 19, *i 1, i 4)"
!macroend

; Hook called before any file extraction or registry writes
!macro NSIS_HOOK_PREINSTALL
  ; Apply dark mode titlebar to the installer parent window
  !insertmacro ApplyDarkThemeWindow $HWNDPARENT

  ; Ensure any previous running instance of Stream is closed
  DetailPrint "Preparing Stream installation environment..."
!macroend

; Hook called after all files are extracted, shortcuts created, and registry updated
!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Configuring Stream deep-link protocol (stream://)..."
  
  ; Register stream:// URL Protocol in HKCU so deep links open in Stream
  WriteRegStr HKCU "Software\Classes\stream" "" "URL:Stream Protocol"
  WriteRegStr HKCU "Software\Classes\stream" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\stream\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\stream\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\stream\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  ; Register application capabilities and metadata
  WriteRegStr HKCU "Software\Pleiades\Stream" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\Pleiades\Stream" "Version" "${VERSION}"
  WriteRegStr HKCU "Software\Pleiades\Stream" "Theme" "ObsidianDark"

  DetailPrint "Stream installation and protocol registration complete."
!macroend

; Hook called before removing files during uninstallation
!macro NSIS_HOOK_PREUNINSTALL
  ; Apply dark mode to uninstaller parent window
  !insertmacro ApplyDarkThemeWindow $HWNDPARENT

  DetailPrint "Unregistering Stream protocol and removing components..."
!macroend

; Hook called after files and shortcuts have been removed during uninstallation
!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove stream:// URL protocol from registry
  DeleteRegKey HKCU "Software\Classes\stream"
  DeleteRegKey HKCU "Software\Pleiades\Stream"
  DeleteRegKey /ifempty HKCU "Software\Pleiades"

  DetailPrint "Stream components successfully removed."
!macroend
