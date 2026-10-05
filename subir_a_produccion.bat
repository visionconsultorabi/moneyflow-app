@echo off
title Subir MoneyFlow a Produccion
cd /d "C:\Users\Usuario\OneDrive\5. Servicios BI\6. Antigravity\App finanzas personales\moneyflow-app"
echo ==============================================
echo   SUBIENDO MONEYFLOW A PRODUCCION (VERCEL)
echo ==============================================
echo.
"%LOCALAPPDATA%\Programs\MinGit\cmd\git.exe" push origin main
echo.
echo ==============================================
echo   PROCESO TERMINADO
echo ==============================================
pause
