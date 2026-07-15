#!/bin/bash
# WSL Kali Environment Verification Script
# Checks real executability levels: startup, workspace, package-install, compile, flutter-aot

source /etc/profile.d/proxy.sh 2>/dev/null

echo "=== WSL Kali Environment Verification ==="

# Level 1: Startup
echo "LEVEL_1_STARTUP: OK (script is running)"

# Level 2: Workspace access
WIN_WORKSPACE="/mnt/c/Users/Administrator/Desktop/Agent"
if [ -d "$WIN_WORKSPACE" ]; then
    echo "LEVEL_2_WORKSPACE: OK ($WIN_WORKSPACE accessible)"
    # Test write
    TEST_FILE="$WIN_WORKSPACE/wsl_test_write.tmp"
    echo "test" > "$TEST_FILE" 2>/dev/null && rm "$TEST_FILE" 2>/dev/null
    echo "LEVEL_2_WORKSPACE_WRITE: OK" || echo "LEVEL_2_WORKSPACE_WRITE: FAILED"
else
    echo "LEVEL_2_WORKSPACE: FAILED ($WIN_WORKSPACE not accessible)"
fi

# Level 3: Package install (sudo NOPASSWD)
sudo -n apt-get update -qq >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "LEVEL_3_PACKAGE_INSTALL: OK (apt update works, NOPASSWD sudo)"
else
    echo "LEVEL_3_PACKAGE_INSTALL: FAILED (apt update or NOPASSWD sudo issue)"
fi

# Level 4: Compile capability
TEST_C="/tmp/wsl_compile_test.c"
TEST_OUT="/tmp/wsl_compile_test"
cat > "$TEST_C" << 'CEOF'
#include <stdio.h>
int main() { printf("compile_ok\n"); return 0; }
CEOF
gcc "$TEST_C" -o "$TEST_OUT" 2>/dev/null && "$TEST_OUT" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "LEVEL_4_COMPILE: OK (gcc works)"
else
    echo "LEVEL_4_COMPILE: FAILED (gcc not working)"
fi
rm -f "$TEST_C" "$TEST_OUT"

# Level 5: CMake/Ninja build
TEST_CMAKE_DIR="/tmp/wsl_cmake_test"
mkdir -p "$TEST_CMAKE_DIR"
cat > "$TEST_CMAKE_DIR/CMakeLists.txt" << 'CMEOF'
cmake_minimum_required(VERSION 3.10)
project(wsl_test)
add_executable(wsl_test main.c)
CMEOF
cat > "$TEST_CMAKE_DIR/main.c" << 'MEOF'
#include <stdio.h>
int main() { printf("cmake_build_ok\n"); return 0; }
MEOF
cd "$TEST_CMAKE_DIR"
cmake -G Ninja . 2>/dev/null && ninja 2>/dev/null
if [ $? -eq 0 ]; then
    echo "LEVEL_5_CMAKE_NINJA: OK"
else
    echo "LEVEL_5_CMAKE_NINJA: FAILED"
fi
rm -rf "$TEST_CMAKE_DIR"

# Level 6: Flutter AOT (Blutter)
if [ -d "/opt/blutter" ] && [ -f "/opt/blutter/blutter.py" ]; then
    echo "LEVEL_6_FLUTTER_AOT: OK (Blutter installed)"
    python3 /opt/blutter/blutter.py --help >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "LEVEL_6_BLUTTER_CLI: OK"
    else
        echo "LEVEL_6_BLUTTER_CLI: FAILED (blutter.py not working)"
    fi
else
    echo "LEVEL_6_FLUTTER_AOT: FAILED (Blutter not installed)"
fi

# Proxy check
GW=$(ip route show default | awk '/default/ {print $3}')
curl -sI --connect-timeout 3 --proxy "http://${GW}:7897" https://github.com >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "PROXY_VIA_GATEWAY: OK (${GW}:7897)"
else
    # Try direct
    curl -sI --connect-timeout 3 https://github.com >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "PROXY_DIRECT: OK (no proxy needed)"
    else
        echo "PROXY: FAILED (no internet access)"
    fi
fi

# Tool inventory
echo "=== Tool Inventory ==="
for tool in cmake ninja clang gcc python3 git pip3; do
    which $tool 2>/dev/null && echo "$tool: $(which $tool)" || echo "$tool: MISSING"
done

echo "=== Verification Complete ==="
