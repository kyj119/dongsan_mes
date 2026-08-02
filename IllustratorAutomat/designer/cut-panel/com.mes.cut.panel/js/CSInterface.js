/**
 * CSInterface.js — minimal self-contained shim (NOT the official Adobe SDK file).
 *
 * MES A0 CEP panel PoC only needs evalScript / getHostEnvironment / getExtensionID /
 * getSystemPath. This shim provides just those, backed directly by the CEP host object
 * window.__adobe_cep__ that Illustrator's embedded CEF injects at runtime.
 *
 * Guard: when window.__adobe_cep__ is missing (e.g. panel opened in a plain browser for
 * layout preview), every method no-ops / returns null instead of throwing, so the panel
 * still renders and is testable outside the host.
 */
(function (global) {
  'use strict';

  function hasHost() {
    return typeof global.__adobe_cep__ !== 'undefined' && global.__adobe_cep__ !== null;
  }

  function CSInterface() {}

  /**
   * Evaluate an ExtendScript snippet/function call in the host (jsx/host.jsx).
   * @param {string} script
   * @param {function(string):void} [callback]
   */
  CSInterface.prototype.evalScript = function (script, callback) {
    if (!hasHost()) {
      console.warn('[CSInterface shim] __adobe_cep__ not found — evalScript no-op (outside host?)');
      if (typeof callback === 'function') callback(null);
      return;
    }
    var cb = typeof callback === 'function' ? callback : function () {};
    global.__adobe_cep__.evalScript(script, cb);
  };

  /**
   * @returns {object|null} parsed host environment info, or null outside the host.
   */
  CSInterface.prototype.getHostEnvironment = function () {
    if (!hasHost()) {
      console.warn('[CSInterface shim] __adobe_cep__ not found — getHostEnvironment() -> null');
      return null;
    }
    try {
      return JSON.parse(global.__adobe_cep__.getHostEnvironment());
    } catch (e) {
      console.warn('[CSInterface shim] getHostEnvironment parse failed', e);
      return null;
    }
  };

  /**
   * @returns {string|null} extension id, or null outside the host.
   */
  CSInterface.prototype.getExtensionID = function () {
    if (!hasHost()) {
      console.warn('[CSInterface shim] __adobe_cep__ not found — getExtensionID() -> null');
      return null;
    }
    return global.__adobe_cep__.getExtensionID();
  };

  /**
   * @param {string} pathType e.g. "userData", "extension", "hostApplication"
   * @returns {string|null}
   */
  CSInterface.prototype.getSystemPath = function (pathType) {
    if (!hasHost()) {
      console.warn('[CSInterface shim] __adobe_cep__ not found — getSystemPath() -> null');
      return null;
    }
    return global.__adobe_cep__.getSystemPath(pathType);
  };

  global.CSInterface = CSInterface;
})(typeof window !== 'undefined' ? window : this);
