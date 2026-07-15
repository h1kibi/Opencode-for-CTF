# Android 动态调试最小闭环模板

适用场景：Android 壳题 / APK 运行时落地 dex / JNI loader / 需要 logcat + `run-as` + Frida 观察的 CTF REV 题。

## 文件

- `install_launch_logcat.ps1`：卸载/安装/启动/抓定向日志。
- `app_private_diff.ps1`：启动前后比对 app 私有目录文件变化。
- `frida_dex_watch.js`：记录 `DexClassLoader`、`AssetManager.open`、`FileOutputStream`、`System.loadLibrary`。

## 最低用法

```powershell
powershell -ExecutionPolicy Bypass -File .\templates\android\install_launch_logcat.ps1 -Apk .\strangeapp.apk -Package com.swdd.strangeapp
```

```powershell
powershell -ExecutionPolicy Bypass -File .\templates\android\app_private_diff.ps1 -Package com.swdd.strangeapp -Before .\work\before.txt -After .\work\after.txt
```

```powershell
frida -U -f com.swdd.strangeapp -l .\templates\android\frida_dex_watch.js
```

## 手动前提

- 目标 APK 包名已知。
- `run-as <package>` 是否可用需要实机确认；release/壳题有时会失败。
- 如果题目依赖蜂窝网络 / SIM 状态，模拟器可能仍需你手动配置或换真机。
