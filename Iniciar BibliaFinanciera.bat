@echo off
title BibliaFinanciera - Sistema de Gestion
cd /d "%~dp0"

echo [BibliaFinanciera] Iniciando aplicacion de escritorio...
wscript.exe "%~dp0iniciar_escritorio.vbs"
exit
