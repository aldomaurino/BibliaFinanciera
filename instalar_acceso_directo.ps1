# Script de instalación del acceso directo de escritorio para BibliaFinanciera

$WshShell = New-Object -ComObject WScript.Shell
$desktopPaths = @(
  [Environment]::GetFolderPath('Desktop'),
  'C:\Users\Aldo\OneDrive\Desktop',
  'C:\Users\Aldo\Desktop'
) | Select-Object -Unique

$proyectoRuta = 'c:\Users\Aldo\Proyectos\BibliaFinanciera'
$vbsRuta = Join-Path $proyectoRuta 'iniciar_escritorio.vbs'
$icoRuta = Join-Path $proyectoRuta 'public\icons\app.ico'

foreach ($desk in $desktopPaths) {
  if (Test-Path $desk) {
    $lnkPath = Join-Path $desk 'Biblia Financiera.lnk'
    $shortcut = $WshShell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = 'wscript.exe'
    $shortcut.Arguments = "`"$vbsRuta`""
    $shortcut.WorkingDirectory = $proyectoRuta
    $shortcut.IconLocation = "$icoRuta, 0"
    $shortcut.Description = 'Biblia Financiera - Tablero de Fondeo y Vencimientos'
    $shortcut.Save()
    Write-Host "Acceso directo creado con exito en: $lnkPath"
  }
}
