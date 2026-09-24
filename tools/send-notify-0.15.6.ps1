$ErrorActionPreference = "Stop"
$contentFile = "c:\opencode\mastermd\tools\wx-notify-0.15.6.txt"
$content = (Get-Content -LiteralPath $contentFile -Raw -Encoding UTF8).Trim()
& "C:\opencode\tools\send-wechat.ps1" `
    -Title "MasterMD v0.15.6 发布成功" `
    -Content $content `
    -Url "https://master.dapang.wang"
