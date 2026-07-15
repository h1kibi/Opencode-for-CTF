Java.perform(function () {
  function log(msg) { console.log('[FRIDA_DEX_WATCH] ' + msg); }

  try {
    var DexClassLoader = Java.use('dalvik.system.DexClassLoader');
    DexClassLoader.$init.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'java.lang.ClassLoader').implementation = function(a, b, c, d) {
      log('DexClassLoader(' + a + ', ' + b + ', ' + c + ')');
      return this.$init(a, b, c, d);
    };
  } catch (e) { log('DexClassLoader hook failed: ' + e); }

  try {
    var AssetManager = Java.use('android.content.res.AssetManager');
    AssetManager.open.overload('java.lang.String').implementation = function(name) {
      log('AssetManager.open(' + name + ')');
      return this.open(name);
    };
  } catch (e) { log('AssetManager.open hook failed: ' + e); }

  try {
    var FileOutputStream = Java.use('java.io.FileOutputStream');
    FileOutputStream.$init.overload('java.lang.String').implementation = function(name) {
      log('FileOutputStream(' + name + ')');
      return this.$init(name);
    };
    FileOutputStream.$init.overload('java.io.File').implementation = function(file) {
      log('FileOutputStream(File=' + file.getAbsolutePath() + ')');
      return this.$init(file);
    };
  } catch (e) { log('FileOutputStream hook failed: ' + e); }

  try {
    var FileInputStream = Java.use('java.io.FileInputStream');
    FileInputStream.$init.overload('java.lang.String').implementation = function(name) {
      log('FileInputStream(' + name + ')');
      return this.$init(name);
    };
  } catch (e) { log('FileInputStream hook failed: ' + e); }

  try {
    var System = Java.use('java.lang.System');
    System.loadLibrary.implementation = function(name) {
      log('System.loadLibrary(' + name + ')');
      return this.loadLibrary(name);
    };
    System.load.implementation = function(name) {
      log('System.load(' + name + ')');
      return this.load(name);
    };
  } catch (e) { log('System.load/System.loadLibrary hook failed: ' + e); }
});
