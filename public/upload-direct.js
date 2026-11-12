'use strict';

(function(global) {
  /* Prerequisite: shared.js */
  var shared = global.ImageUploadShared;
  if (!shared) {
    console.error('upload-direct.js: shared.js must be loaded before upload-direct.js');
    return;
  }
  
  /* Constructor — same signature as SdkTransport and ImageUploadApp */
  function DirectTransport(apiKey, options) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    this.apiKey = apiKey;
    this.shared = shared;
    this.options = Object.assign({
      baseUrl: shared.API_BASE,
      timeout: 300000
    }, options || {});
  }
  
  /* Public method — raw XHR to the same endpoint the SDK wraps */
  DirectTransport.prototype.upload = function(file, options) {
    var self = this;
    options = options || {};
    if (!file) {
      return Promise.reject(new Error('File is required'));
    }
    
    return new Promise(function(resolve, reject) {
      var fd = new FormData();
      fd.append('images', file);
      fd.append('key', self.apiKey);
      
      var xhr = new XMLHttpRequest();
      xhr.open('POST', self.options.baseUrl + '/upload');
      xhr.timeout = self.options.timeout;
      
      xhr.onload = function() {
        var json;
        try {
          json = JSON.parse(xhr.responseText);
        } catch (e) {
          return reject(new Error('API returned non-JSON (HTTP ' + xhr.status + ')'));
        }
        
        if (!json.success) {
          var err = json.error || {};
          var msg = (typeof err === 'string' ? err : err.message) ||
            ('Upload failed (HTTP ' + xhr.status + ')');
          return reject(new Error(msg));
        }
        
        resolve(json.data);
      };
      
      xhr.onerror = function() {
        reject(new Error('Network error'));
      };
      
      xhr.ontimeout = function() {
        reject(new Error('Upload timeout'));
      };
      
      if (typeof options.onProgress === 'function') {
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable) {
            var percent = (e.loaded / e.total) * 100;
            options.onProgress(percent);
          }
        };
      }
      
      xhr.send(fd);
    });
  };
  
  /* Transport interface used by shared.js — same contract as SdkTransport */
  DirectTransport.prototype.uploadOne = function(file, onProgress) {
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
    
    return this.upload(file, opts).then(function(data) {
      var item = (data && Array.isArray(data.images)) ? data.images[0] : data;
      return self.shared.normaliseItem(item);
    });
  };
  
  DirectTransport.mode = 'DIRECT + KV';
  
  global.ImageUploadTransports = global.ImageUploadTransports || {};
  global.ImageUploadTransports.direct = DirectTransport;
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DirectTransport;
  } else if (typeof define === 'function' && define.amd) {
    define(function() { return DirectTransport; });
  } else {
    global.ImageUploadDirectTransport = DirectTransport;
  }
  
  global.dispatchEvent(new CustomEvent('imageupload:transport-registered', { detail: { name: 'direct' } }));
  
})(typeof window !== 'undefined' ? window : this);