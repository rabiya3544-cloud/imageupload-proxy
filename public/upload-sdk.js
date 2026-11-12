'use strict';

(function(global) {
  /* Prerequisite 1: shared.js */
  var shared = global.ImageUploadShared;
  if (!shared) {
    console.error('upload-sdk.js: shared.js must be loaded before upload-sdk.js');
    return;
  }
  
  /* Prerequisite 2: SDK global */
  if (typeof global.ImageUploadApp !== 'function') {
    console.warn(
      'upload-sdk.js: ImageUploadApp not defined — SDK script not loaded or loaded after upload-sdk.js.\n' +
      'Ensure <script src="https://imageupload.app/imageupload-sdk.min.js"></script> appears BEFORE upload-sdk.js.'
    );
    return;
  }
  
  /* Constructor — mirrors ImageUploadApp(apiKey, options) */
  function SdkTransport(apiKey, options) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    this.apiKey = apiKey;
    this.shared = shared;
    this.options = Object.assign({
      baseUrl: 'https://imageupload.app',
      timeout: 300000
    }, options || {});
    this._uploader = null;
  }
  
  /* Lazy-init the underlying SDK instance */
  SdkTransport.prototype._getUploader = function() {
    if (!this._uploader) {
      this._uploader = new global.ImageUploadApp(this.apiKey, {
        baseUrl: this.options.baseUrl,
        timeout: this.options.timeout
      });
    }
    return this._uploader;
  };
  
  /* Public method — same signature as ImageUploadApp.upload(file, options) */
  SdkTransport.prototype.upload = function(file, options) {
    options = options || {};
    if (!file) {
      return Promise.reject(new Error('File is required'));
    }
    return this._getUploader().upload(file, options);
  };
  
  /* Transport interface used by shared.js — translates 0-100 → (loaded, total) */
  SdkTransport.prototype.uploadOne = function(file, onProgress) {
    var self = this;
    if (!file) {
      return Promise.reject(new Error('No file provided'));
    }
    
    var opts = {};
    if (typeof onProgress === 'function') {
      opts.onProgress = function(percent) {
        try {
          var clamped = Math.max(0, Math.min(100, percent));
          var loaded = Math.round((clamped / 100) * file.size);
          onProgress(loaded, file.size);
        } catch (e) {}
      };
    }
    
    return this._getUploader().upload(file, opts).then(function(data) {
      /* SDK resolves with response.data — single-file shape for our path,
         but tolerate { images: [...] } for future-proofing */
      var item = (data && Array.isArray(data.images)) ? data.images[0] : data;
      return self.shared.normaliseItem(item);
    });
  };
  
  /* Static mode label — matches SDK's own metadata style */
  SdkTransport.mode = 'SDK + KV';
  
  /* Register with shared.js */
  global.ImageUploadTransports = global.ImageUploadTransports || {};
  global.ImageUploadTransports.sdk = SdkTransport;
  
  /* UMD export — same three branches as imageupload-sdk.js */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SdkTransport;
  } else if (typeof define === 'function' && define.amd) {
    define(function() { return SdkTransport; });
  } else {
    global.ImageUploadSdkTransport = SdkTransport;
  }
  
  /* Notify shared.js that a transport became available */
  global.dispatchEvent(new CustomEvent('imageupload:transport-registered', { detail: { name: 'sdk' } }));
  
})(typeof window !== 'undefined' ? window : this);