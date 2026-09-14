' DDyu Site - logon autostart (no admin required)
' Remove: delete this .vbs file from shell:startup
CreateObject("WScript.Shell").Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""D:\work\amaze\DDyu\scripts\local\start-local.ps1""", 0, False
