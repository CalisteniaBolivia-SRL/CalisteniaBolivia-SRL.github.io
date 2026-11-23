# =====================================================================================================
# Instalación del espejo de cámaras en la PC de la oficina (una sola vez).
# Uso (PowerShell): powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/CalisteniaBolivia-SRL/CalisteniaBolivia-SRL.github.io/main/dashboard/kiosco/camaras/configurar-espejo.ps1 | iex"
# Hace: crea C:\camaras, baja el programa, crea el usuario propio de esta PC en Firebase con una clave aleatoria
# (la clave queda SOLO en C:\camaras\espejo.config.json, nunca en pantalla), lo deja arrancando solo con Windows,
# evita que la PC se suspenda o apague la pantalla, lo arranca y muestra el registro.
# =====================================================================================================
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = 'https://raw.githubusercontent.com/CalisteniaBolivia-SRL/CalisteniaBolivia-SRL.github.io/main/dashboard'
$dir = 'C:\camaras'
$correo = 'camaras-oficina@centro-de-mando.calistenia'

Write-Host '1) Carpeta y programa...'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($f in 'espejo.ps1', 'iniciar-espejo.bat', 'espejo.config.ejemplo.json') {
    Invoke-WebRequest -UseBasicParsing -Uri "$base/kiosco/camaras/$f" -OutFile (Join-Path $dir $f)
}

Write-Host '2) Usuario de esta PC y configuración...'
$conf = Join-Path $dir 'espejo.config.json'
if (Test-Path $conf) {
    Write-Host '   Ya existía espejo.config.json: se deja como está.'
} else {
    $js = (Invoke-WebRequest -UseBasicParsing -Uri "$base/firebase-config.js").Content
    # La clave real (empieza con AIza y no es el ejemplo «AIza...» que figura más abajo en el archivo).
    $apiKey = ([regex]::Matches($js, '"?apiKey"?\s*:\s*"(AIza[0-9A-Za-z_-]{20,})"') | Select-Object -First 1).Groups[1].Value
    if (-not $apiKey) { throw 'No se encontró la apiKey en firebase-config.js.' }
    $letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
    $bytes = New-Object byte[] 28
    (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $clave = -join ($bytes | ForEach-Object { $letras[$_ % $letras.Length] })
    try {
        $cuerpo = @{ email = $correo; password = $clave; returnSecureToken = $true } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$apiKey" -ContentType 'application/json' -Body $cuerpo | Out-Null
        Write-Host '   Usuario de la PC creado.'
    } catch {
        Write-Host '   ATENCION: no se pudo crear el usuario de la PC (puede que ya exista). Copie este mensaje y mándeselo a Claude:'
        Write-Host "   $($_.Exception.Message)"
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" }
        return
    }
    $o = [ordered]@{ proyecto = 'centro-de-comando-a57cf'; apiKey = $apiKey; usuario = $correo; clave = $clave; lugar = 'oficina'; segundos = 10; ancho = 1600 }
    [IO.File]::WriteAllText($conf, ($o | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))
    Write-Host '   Configuración guardada (la clave no se muestra).'
}

Write-Host '3) Arranque automático y energía...'
$inicio = [Environment]::GetFolderPath('Startup')
$sh = New-Object -ComObject WScript.Shell
$acc = $sh.CreateShortcut((Join-Path $inicio 'Espejo de camaras.lnk'))
$acc.TargetPath = Join-Path $dir 'iniciar-espejo.bat'; $acc.WorkingDirectory = $dir; $acc.WindowStyle = 7; $acc.Save()
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change monitor-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name ScreenSaveActive -Value '0'
Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name ScreenSaverIsSecure -Value '0'

Write-Host '4) Arrancando el espejo (30 segundos)...'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*-File*C:\camaras\espejo.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process -FilePath (Join-Path $dir 'iniciar-espejo.bat') -WorkingDirectory $dir -WindowStyle Minimized
Start-Sleep -Seconds 30
$log = Join-Path $dir 'espejo.log'
Write-Host ''
Write-Host '===== Últimas líneas del registro (copie esto para Claude) ====='
if (Test-Path $log) { Get-Content $log -Tail 5 } else { Write-Host 'Todavía no hay registro: el programa no arrancó.' }
Write-Host '==============================================================='
Write-Host 'Falta a mano: SmartPSS en Live View (con Tour si tiene) y en pantalla completa.'
