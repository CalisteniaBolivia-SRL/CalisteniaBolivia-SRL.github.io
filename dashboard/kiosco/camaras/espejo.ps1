# =====================================================================================================
# Espejo de cámaras de la oficina (Calistenia Company · centro de mando)
# Cada N segundos saca una foto de la pantalla de esta computadora (SmartPSS en Live View / Tour, en pantalla
# completa) y la sube, protegida, a la base del centro de mando. El muro (pantalla «Cámaras») la muestra.
# - Solo lee la pantalla: no toca SmartPSS ni los grabadores.
# - La clave de esta computadora va en espejo.config.json (en esta misma carpeta, nunca en el repositorio).
# Arranque: iniciar-espejo.bat (y un acceso directo en shell:startup para que arranque solo).
# =====================================================================================================
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $carpeta 'espejo.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$log = Join-Path $carpeta 'espejo.log'
$cada = [Math]::Max(5, [int]($(if ($cfg.segundos) { $cfg.segundos } else { 10 })))
$anchoMax = [int]($(if ($cfg.ancho) { $cfg.ancho } else { 1600 }))
$doc = "https://firestore.googleapis.com/v1/projects/$($cfg.proyecto)/databases/(default)/documents/cam_espejo/$($cfg.lugar)"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Anotar($t) {
    $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $t"
    Add-Content -Path $log -Value $l -Encoding UTF8
    if ((Get-Item $log).Length -gt 2MB) { Move-Item $log "$log.1" -Force }
}

# ---------- sesión (usuario propio de esta computadora en Firebase) ----------
$script:tok = $null; $script:refresh = $null; $script:vence = [DateTime]::MinValue
function Token {
    if ($script:tok -and (Get-Date) -lt $script:vence) { return $script:tok }
    if ($script:refresh) {
        try {
            $r = Invoke-RestMethod -Method Post -Uri "https://securetoken.googleapis.com/v1/token?key=$($cfg.apiKey)" -ContentType 'application/x-www-form-urlencoded' -Body "grant_type=refresh_token&refresh_token=$($script:refresh)"
            $script:tok = $r.id_token; $script:refresh = $r.refresh_token
            $script:vence = (Get-Date).AddSeconds([int]$r.expires_in - 300)
            return $script:tok
        } catch { Anotar "No se pudo renovar la sesión: $($_.Exception.Message)" }
    }
    $cuerpo = @{ email = $cfg.usuario; password = $cfg.clave; returnSecureToken = $true } | ConvertTo-Json
    $r = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$($cfg.apiKey)" -ContentType 'application/json' -Body $cuerpo
    $script:tok = $r.idToken; $script:refresh = $r.refreshToken
    $script:vence = (Get-Date).AddSeconds([int]$r.expiresIn - 300)
    Anotar 'Sesión abierta.'
    return $script:tok
}

# ---------- foto de la pantalla en JPEG ----------
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
function Foto([int]$calidad) {
    $p = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $p.Width, $p.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($p.Left, $p.Top, 0, 0, $bmp.Size)
    $g.Dispose()
    $ancho = [Math]::Min($anchoMax, $p.Width); $alto = [int]($p.Height * $ancho / $p.Width)
    $chica = New-Object System.Drawing.Bitmap $ancho, $alto
    $g2 = [System.Drawing.Graphics]::FromImage($chica)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
    $g2.DrawImage($bmp, 0, 0, $ancho, $alto); $g2.Dispose(); $bmp.Dispose()
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$calidad)
    $ms = New-Object System.IO.MemoryStream
    $chica.Save($ms, $codec, $ep); $chica.Dispose()
    $bytes = $ms.ToArray(); $ms.Dispose()
    return @{ b64 = [Convert]::ToBase64String($bytes); ancho = $ancho; alto = $alto }
}

function Subir {
    $calidad = 60
    $f = Foto $calidad
    # Un documento de la base admite hasta 1 MB: si la foto es más grande, se baja la calidad.
    while ($f.b64.Length -gt 850000 -and $calidad -gt 25) { $calidad -= 10; $f = Foto $calidad }
    $cuerpo = @{ fields = @{
        img = @{ stringValue = $f.b64 }
        fecha = @{ timestampValue = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }
        ancho = @{ integerValue = [string]$f.ancho }; alto = @{ integerValue = [string]$f.alto }
        pc = @{ stringValue = $env:COMPUTERNAME }; cada = @{ integerValue = [string]$cada }
    } } | ConvertTo-Json -Depth 5 -Compress
    Invoke-RestMethod -Method Patch -Uri $doc -Headers @{ Authorization = "Bearer $(Token)" } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) | Out-Null
}

Anotar "Espejo de cámaras iniciado (cada $cada s, lugar «$($cfg.lugar)»)."
$fallas = 0
while ($true) {
    try { Subir; if ($fallas) { Anotar 'Volvió a subir.' }; $fallas = 0 }
    catch {
        $fallas++
        if ($fallas -le 3 -or $fallas % 30 -eq 0) { Anotar "No se pudo subir ($fallas): $($_.Exception.Message)" }
        if ($fallas % 5 -eq 0) { $script:tok = $null }
    }
    Start-Sleep -Seconds $cada
}
