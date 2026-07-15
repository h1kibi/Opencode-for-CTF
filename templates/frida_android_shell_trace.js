// Minimal Android shell/unpacker trace for CTF APKs.
// Usage: frida -U -f com.target.app -l frida_android_shell_trace.js --no-pause

Java.perform(function () {
  function log(msg) { console.log("[shell-trace] " + msg); }

  try {
    var DexClassLoader = Java.use("dalvik.system.DexClassLoader");
    DexClassLoader.$init.overload("java.lang.String", "java.lang.String", "java.lang.String", "java.lang.ClassLoader").implementation = function (dexPath, optDir, libPath, parent) {
      log("DexClassLoader dexPath=" + dexPath + " optDir=" + optDir + " libPath=" + libPath);
      return this.$init(dexPath, optDir, libPath, parent);
    };
  } catch (e) { log("DexClassLoader hook failed: " + e); }

  try {
    var System = Java.use("java.lang.System");
    System.loadLibrary.implementation = function (name) {
      log("System.loadLibrary " + name);
      return this.loadLibrary(name);
    };
    System.load.implementation = function (path) {
      log("System.load " + path);
      return this.load(path);
    };
  } catch (e) { log("System load hook failed: " + e); }

  try {
    var AssetManager = Java.use("android.content.res.AssetManager");
    AssetManager.open.overload("java.lang.String").implementation = function (name) {
      log("AssetManager.open " + name);
      return this.open(name);
    };
  } catch (e) { log("AssetManager.open hook failed: " + e); }

  try {
    var FOS = Java.use("java.io.FileOutputStream");
    FOS.$init.overload("java.lang.String").implementation = function (name) {
      log("FileOutputStream " + name);
      return this.$init(name);
    };
    FOS.$init.overload("java.io.File").implementation = function (file) {
      log("FileOutputStream file=" + file.getAbsolutePath());
      return this.$init(file);
    };
  } catch (e) { log("FileOutputStream hook failed: " + e); }
});

function hookNative(name) {
  var p = Module.findExportByName(null, name);
  if (!p) return;
  Interceptor.attach(p, {
    onEnter: function (args) {
      try { console.log("[native] " + name + " path=" + args[0].readCString()); } catch (_) {}
    }
  });
}
["open", "openat", "fopen", "dlopen", "android_dlopen_ext"].forEach(hookNative);
