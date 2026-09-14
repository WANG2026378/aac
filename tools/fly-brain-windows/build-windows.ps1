$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build command failed: $LASTEXITCODE" } }
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) { throw 'Run from an x64 Native Tools environment for Visual Studio (C++ build tools).' }
python -m venv .build-venv
Check-Exit
$python = Join-Path $PSScriptRoot '.build-venv\Scripts\python.exe'
& $python -m pip install -r requirements-build.txt
Check-Exit
New-Item -ItemType Directory -Force data\cache\physiology-v6 | Out-Null
cl.exe /nologo /O2 /std:c++17 /EHsc /MT /LD stonkfly\neural\kernel.cpp /link /OUT:data\cache\physiology-v6\memory.dll
Check-Exit
& $python prepare-cloud-data.py
Check-Exit
& $python stamp-dll.py
Check-Exit
& $python -m PyInstaller --noconfirm --clean --onedir --console --name '啟動果蠅腦' --collect-all pyarrow --collect-all pandas --add-data 'stonkfly/neural/kernel.cpp;stonkfly/neural' --add-data 'stonkfly/neural/rule.py;stonkfly/neural' launcher.py
Check-Exit
$destination = Join-Path $PSScriptRoot 'dist\啟動果蠅腦'
New-Item -ItemType Directory -Force "$destination\data\normalized","$destination\data\cache\physiology-v6" | Out-Null
Copy-Item data\graph.npz,data\annotations.feather,data\manifest.json,data\source.lock.json -Destination "$destination\data"
Copy-Item data\normalized\neurons.feather -Destination "$destination\data\normalized"
Copy-Item data\cache\physiology-v6\memory.dll,data\cache\physiology-v6\memory.dll.json -Destination "$destination\data\cache\physiology-v6"
Copy-Item web -Destination $destination -Recurse -Force
Copy-Item LICENSE,THIRD_PARTY.md,使用說明.txt -Destination $destination
& "$destination\啟動果蠅腦.exe" --self-test
Check-Exit
& $python smoke-test.py $destination
Check-Exit
& $python -m pip freeze | Out-File -Encoding utf8 "$destination\build-dependencies.txt"
Compress-Archive -Path $destination -DestinationPath 'dist\果蠅腦-Windows-x64.zip' -Force
Write-Host 'Done: dist\果蠅腦-Windows-x64.zip'
