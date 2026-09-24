; MasterMD 安装钩子
; 安装完成后写入标记文件，应用中用于识别「安装版」（安装版走安装包静默升级，绿色版走自替换）

!macro NSIS_HOOK_POSTINSTALL
  FileOpen $0 "$INSTDIR\installed.marker" w
  FileWrite $0 "installed"
  FileClose $0
!macroend
