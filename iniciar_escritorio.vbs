Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = "c:\Users\Aldo\Proyectos\BibliaFinanciera"
WshShell.CurrentDirectory = projectDir

' Verificar si el servidor ya está respondiendo en el puerto 3000
testCmd = "powershell -NoProfile -Command ""if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"""
serverRunning = (WshShell.Run(testCmd, 0, True) = 0)

If Not serverRunning Then
    ' Iniciar servidor en segundo plano completamente silencioso (0 = ventana oculta)
    WshShell.Run "cmd.exe /c npm run dev", 0, False
    WScript.Sleep 2500
End If

' Lanzar la aplicación en ventana de escritorio nativa (--app)
chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

If fso.FileExists(chromePath) Then
    WshShell.Run """" & chromePath & """ --app=http://localhost:3000", 1, False
ElseIf fso.FileExists(edgePath) Then
    WshShell.Run """" & edgePath & """ --app=http://localhost:3000", 1, False
Else
    WshShell.Run "http://localhost:3000", 1, False
End If
