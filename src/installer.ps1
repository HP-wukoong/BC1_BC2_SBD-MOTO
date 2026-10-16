#PS-START
# ===== TOOLS BC1+BC2+SBD — Cài nhắc lịch nộp trên màn hình Windows =====
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$App     = 'TOOLS_BC1_BC2_SBD'
$Dir     = Join-Path $env:LOCALAPPDATA $App
$TaskDir = "\$App\"
$Utf8Bom = New-Object System.Text.UTF8Encoding $true

$Data = @'
__JSON__
'@

$Notifier = @'
param([switch]$Test)
# Thẻ nhắc lịch nộp — TOOLS BC1+BC2+SBD
$ErrorActionPreference = 'SilentlyContinue'
$Dir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg   = Get-Content -Raw -Encoding UTF8 (Join-Path $Dir 'nhac.json') | ConvertFrom-Json
$doneF = Join-Path $Dir 'da_xong.txt'
$done  = @(); if (Test-Path $doneF) { $done = @(Get-Content -Encoding UTF8 $doneF) }
$today = (Get-Date).Date

function Get-Status($it) {
  $f = [datetime]::ParseExact($it.from, 'yyyy-MM-dd', $null); $t = [datetime]::ParseExact($it.to, 'yyyy-MM-dd', $null)
  if ($today -lt $f.AddDays(-1)) { return $null }
  if ($today -lt $f)  { return @{ lv = 'next'; txt = 'Ngày mai bắt đầu' } }
  if ($today -lt $t)  { return @{ lv = 'act';  txt = ('Đến hạn — còn {0} ngày' -f ($t - $today).Days) } }
  if ($today -eq $t)  { return @{ lv = 'act';  txt = 'HẠN CHÓT HÔM NAY' } }
  $late = ($today - $t).Days
  if ($late -gt 3)    { return $null }
  return @{ lv = 'over'; txt = ('QUÁ HẠN {0} ngày' -f $late) }
}

$due = @()
foreach ($it in $cfg.items) {
  if ($done -contains $it.id) { continue }
  $st = Get-Status $it
  if ($st) { $due += [pscustomobject]@{ it = $it; st = $st } }
}
if (-not $due.Count -and -not $Test) { exit }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$navy = [Drawing.Color]::FromArgb(17, 42, 74); $red = [Drawing.Color]::FromArgb(180, 35, 24)
$amber = [Drawing.Color]::FromArgb(194, 120, 3); $blue = [Drawing.Color]::FromArgb(29, 78, 137)
$fontT = New-Object Drawing.Font('Segoe UI', 10.5, [Drawing.FontStyle]::Bold)
$fontB = New-Object Drawing.Font('Segoe UI', 9.5)
$fontS = New-Object Drawing.Font('Segoe UI', 8.5)

$W = 430
$form = New-Object Windows.Forms.Form
$form.FormBorderStyle = 'None'; $form.TopMost = $true; $form.ShowInTaskbar = $true
$form.BackColor = [Drawing.Color]::White; $form.Width = $W; $form.StartPosition = 'Manual'
$form.Text = 'Nhắc lịch nộp — TOOLS BC1+BC2+SBD'

$head = New-Object Windows.Forms.Label
$head.Text = '   Nhắc lịch nộp — TOOLS BC1+BC2+SBD'; $head.Dock = 'Top'; $head.Height = 34
$head.BackColor = $navy; $head.ForeColor = [Drawing.Color]::White; $head.Font = $fontT; $head.TextAlign = 'MiddleLeft'
# kéo thẻ bằng thanh tiêu đề
$script:drag = $null
$head.Add_MouseDown({ $script:drag = [Windows.Forms.Cursor]::Position })
$head.Add_MouseMove({ if ($script:drag) { $p = [Windows.Forms.Cursor]::Position; $form.Left += $p.X - $script:drag.X; $form.Top += $p.Y - $script:drag.Y; $script:drag = $p } })
$head.Add_MouseUp({ $script:drag = $null })

$body = New-Object Windows.Forms.FlowLayoutPanel
$body.FlowDirection = 'TopDown'; $body.WrapContents = $false; $body.AutoScroll = $true
$body.Dock = 'Fill'; $body.Padding = New-Object Windows.Forms.Padding(12, 8, 12, 4)

$checks = @()
if (-not $due.Count) {
  $l = New-Object Windows.Forms.Label; $l.Text = 'Đã cài nhắc lịch thành công. Hiện chưa có việc nào đến hạn.'
  $l.AutoSize = $true; $l.MaximumSize = New-Object Drawing.Size(($W - 40), 0); $l.Font = $fontB; $body.Controls.Add($l)
}
foreach ($d in $due) {
  $col = switch ($d.st.lv) { 'over' { $red } 'act' { $amber } default { $blue } }
  $box = New-Object Windows.Forms.FlowLayoutPanel; $box.FlowDirection = 'TopDown'; $box.WrapContents = $false
  $box.AutoSize = $true; $box.AutoSizeMode = 'GrowAndShrink'; $box.Tag = $col
  $box.Padding = New-Object Windows.Forms.Padding(14, 4, 4, 6); $box.Margin = New-Object Windows.Forms.Padding(0, 4, 0, 8)
  $box.MinimumSize = New-Object Drawing.Size(($W - 50), 0); $box.MaximumSize = New-Object Drawing.Size(($W - 50), 0)
  $box.Add_Paint({ param($s, $e) $e.Graphics.FillRectangle((New-Object Drawing.SolidBrush($s.Tag)), 0, 0, 4, $s.Height) })
  $t1 = New-Object Windows.Forms.Label; $t1.Text = "Khóa $($d.it.khoa): $($d.it.title)"; $t1.Font = $fontT
  $t1.AutoSize = $true; $t1.MaximumSize = New-Object Drawing.Size(($W - 80), 0)
  $t2 = New-Object Windows.Forms.Label; $t2.Text = "$($d.st.txt)   ·   $($d.it.when)"; $t2.ForeColor = $col
  $t2.Font = New-Object Drawing.Font('Segoe UI', 9, [Drawing.FontStyle]::Bold); $t2.AutoSize = $true; $t2.MaximumSize = New-Object Drawing.Size(($W - 80), 0)
  $t3 = New-Object Windows.Forms.Label; $t3.Text = (($d.it.steps | ForEach-Object { '•  ' + $_ }) -join "`r`n")
  $t3.Font = $fontB; $t3.AutoSize = $true; $t3.MaximumSize = New-Object Drawing.Size(($W - 80), 0)
  $cb = New-Object Windows.Forms.CheckBox; $cb.Text = 'Đã xong — không nhắc mốc này nữa'; $cb.Font = $fontS; $cb.AutoSize = $true; $cb.Tag = $d.it.id
  $checks += $cb
  $box.Controls.AddRange(@($t1, $t2, $t3, $cb))
  $body.Controls.Add($box)
}

$foot = New-Object Windows.Forms.FlowLayoutPanel; $foot.Dock = 'Bottom'; $foot.Height = 46
$foot.FlowDirection = 'RightToLeft'; $foot.Padding = New-Object Windows.Forms.Padding(8, 8, 8, 8)
$foot.BackColor = [Drawing.Color]::FromArgb(245, 247, 250)
function New-Btn($text, $primary) {
  $b = New-Object Windows.Forms.Button; $b.Text = $text; $b.AutoSize = $true; $b.Font = $fontB; $b.FlatStyle = 'Flat'
  $b.Padding = New-Object Windows.Forms.Padding(6, 2, 6, 2)
  if ($primary) { $b.BackColor = $blue; $b.ForeColor = [Drawing.Color]::White; $b.FlatAppearance.BorderColor = $blue }
  return $b
}
$bClose = New-Btn 'Đóng' $true
$bOpen  = New-Btn 'Mở tool' $false
$bSnooze = New-Btn 'Nhắc lại sau 1 giờ' $false
$saveDone = {
  $ids = @($checks | Where-Object { $_.Checked } | ForEach-Object { $_.Tag })
  if ($ids.Count) { [IO.File]::AppendAllText($doneF, (($ids -join "`r`n") + "`r`n"), (New-Object Text.UTF8Encoding $true)) }
}
$bClose.Add_Click({ & $saveDone; $form.Close() })
$bOpen.Add_Click({ & $saveDone; if ($cfg.tool -and (($cfg.tool -match '^https?://') -or (Test-Path -LiteralPath $cfg.tool))) { Start-Process $cfg.tool } else { [Windows.Forms.MessageBox]::Show('Không tìm thấy file tool. Hãy để file .bat cài nhắc lịch cùng thư mục với file TOOLS BC1+BC2+SBD.html rồi chạy lại.', 'TOOLS BC1+BC2+SBD') | Out-Null }; $form.Close() })
$bSnooze.Add_Click({
  & $saveDone
  try {
    $a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $Dir 'nhac.vbs') + '"')
    $tr = New-ScheduledTaskTrigger -Once -At (Get-Date).AddHours(1)
    try { Register-ScheduledTask -TaskPath '\TOOLS_BC1_BC2_SBD\' -TaskName 'NhacLai_1gio' -Action $a -Trigger $tr -Force -ErrorAction Stop | Out-Null }
    catch { Register-ScheduledTask -TaskName 'TOOLS_BC1_BC2_SBD_NhacLai_1gio' -Action $a -Trigger $tr -Force | Out-Null }
  } catch {}
  $form.Close()
})
$foot.Controls.AddRange(@($bClose, $bOpen, $bSnooze))

$form.Controls.Add($body); $form.Controls.Add($foot); $form.Controls.Add($head)
$h = 34 + 46 + 24; foreach ($c in $body.Controls) { $h += $c.GetPreferredSize([Drawing.Size]::Empty).Height + 14 }
$wa = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Height = [Math]::Min([Math]::Max($h, 150), $wa.Height - 40)
$form.Left = $wa.Right - $W - 16; $form.Top = $wa.Bottom - $form.Height - 16
$form.Add_Paint({ param($s, $e) $e.Graphics.DrawRectangle((New-Object Drawing.Pen($navy, 2)), 0, 0, $form.Width - 1, $form.Height - 1) })
$form.Add_Shown({ [System.Media.SystemSounds]::Exclamation.Play(); $form.Activate() })
[void]$form.ShowDialog()
'@

function Show-Line($s, $c = 'Gray') { Write-Host $s -ForegroundColor $c }
Show-Line ''
Show-Line '  TOOLS BC1+BC2+SBD — NHẮC LỊCH NỘP TRÊN MÀN HÌNH' 'Cyan'
Show-Line '  ----------------------------------------------'
Show-Line '  1 = Cài / cập nhật nhắc lịch   (chạy lại mỗi khi tích xong việc hoặc đổi ngày trong tool)'
Show-Line '  2 = Gỡ toàn bộ nhắc lịch'
Show-Line '  3 = Hiện thử thẻ nhắc ngay bây giờ'
$choice = Read-Host '  Chọn (Enter = 1)'
if (-not $choice) { $choice = '1' }

function Remove-Tasks {
  Get-ScheduledTask -TaskPath $TaskDir -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
  Get-ScheduledTask -TaskName "$($App)_*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
}
# Đăng ký tác vụ: ưu tiên thư mục riêng trong Task Scheduler; máy không cho tạo thư mục thì để ở gốc với tên có tiền tố
function Register-T($name, $trig, $desc) {
  try { Register-ScheduledTask -TaskPath $TaskDir -TaskName $name -Action $act -Trigger $trig -Settings $set -Description $desc -Force -ErrorAction Stop | Out-Null }
  catch { Register-ScheduledTask -TaskName "$($App)_$name" -Action $act -Trigger $trig -Settings $set -Description $desc -Force -ErrorAction Stop | Out-Null }
}

if ($choice -eq '2') {
  Remove-Tasks
  if (Test-Path $Dir) { Remove-Item -Recurse -Force $Dir }
  Show-Line '  Đã gỡ toàn bộ nhắc lịch.' 'Green'; return
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$cfg = $Data | ConvertFrom-Json
# Tìm file tool nằm cùng thư mục với file .bat để nút “Mở tool” mở được
$here = Split-Path -Parent $BatPath
$tool = Get-ChildItem -LiteralPath $here -Filter '*.html' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'TOOLS BC1*' -or $_.Name -like 'SoSatHach*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$toolOpen = $(if ($cfg.appUrl) { [string]$cfg.appUrl } elseif ($tool) { $tool.FullName } else { '' })
$cfg | Add-Member -NotePropertyName tool -NotePropertyValue $toolOpen -Force
[IO.File]::WriteAllText((Join-Path $Dir 'nhac.json'), ($cfg | ConvertTo-Json -Depth 6), $Utf8Bom)
[IO.File]::WriteAllText((Join-Path $Dir 'nhac.ps1'), $Notifier, $Utf8Bom)
$vbs = 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\nhac.ps1""", 0, False'
[IO.File]::WriteAllText((Join-Path $Dir 'nhac.vbs'), $vbs, [Text.Encoding]::Unicode)
# Cài lại: xóa đánh dấu “đã xong” cũ vì danh sách mốc đã được cập nhật từ tool
if ($choice -eq '1' -and (Test-Path (Join-Path $Dir 'da_xong.txt'))) { Remove-Item (Join-Path $Dir 'da_xong.txt') -Force }

if ($choice -eq '3') { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dir 'nhac.ps1') -Test; return }

Remove-Tasks
$act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $Dir 'nhac.vbs') + '"')
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 12)
$trs = @(
  (New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours(8))),
  (New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours(13).AddMinutes(30)))
)
Register-T 'NhacLichHangNgay' $trs 'TOOLS BC1+BC2+SBD: nhắc lịch nộp lúc 8:00 và 13:30'
try {
  $tl = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"; $tl.Delay = 'PT2M'
  Register-T 'NhacLichKhiMoMay' $tl 'TOOLS BC1+BC2+SBD: nhắc lịch khi mở máy'
  $logon = $true
} catch { $logon = $false }

Show-Line ''
Show-Line ('  Đã cài nhắc lịch cho {0} mốc chưa xong:' -f $cfg.items.Count) 'Green'
foreach ($it in $cfg.items) { Show-Line ('   - Khóa {0}: {1}  ({2})' -f $it.khoa, $it.title, $it.when) }
Show-Line ''
Show-Line ('  Thẻ nhắc hiện lúc 8:00 và 13:30 mỗi ngày' + $(if ($logon) { ', và khi mở máy' } else { '' }) + ' — từ 1 ngày trước mốc đến 3 ngày sau hạn chót.')
if ($toolOpen) { Show-Line ('  Nút "Mở tool" sẽ mở: ' + $toolOpen) } else { Show-Line '  Chưa thấy file TOOLS BC1+BC2+SBD.html cùng thư mục — nút "Mở tool" sẽ không dùng được.' 'Yellow' }
Show-Line '  Đang hiện thử thẻ nhắc...' 'Cyan'
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + (Join-Path $Dir 'nhac.ps1') + '"'),'-Test')
