/**
 * ImageUpload.app JavaScript SDK
 * A simple JavaScript library for uploading images to ImageUpload.app
 * Version: 1.0.0
 */

(function(global) {
  'use strict';

  /**
   * ImageUploadApp Constructor
   * @param {string} apiKey - Your API key from ImageUpload.app
   * @param {Object} options - Configuration options
   */
  function ImageUploadApp(apiKey, options) {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = apiKey;
    this.options = Object.assign({
      baseUrl: 'https://imageupload.app',
      /** Varsayılan 5 dk — config upload.requestTimeoutMs ile uyumlu */
      timeout: 300000
    }, options || {});
  }

  /**
   * Upload image file
   * @param {File|Blob} file - The image file to upload
   * @param {Object} options - Upload options
   * @returns {Promise} Promise that resolves with upload response
   */
  ImageUploadApp.prototype.upload = function(file, options) {
    var self = this;
    options = options || {};

    return new Promise(function(resolve, reject) {
      if (!file) {
        return reject(new Error('File is required'));
      }

      var formData = new FormData();
      formData.append('images', file);
      formData.append('key', self.apiKey);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', self.options.baseUrl + '/api/1/upload');
      xhr.timeout = self.options.timeout;

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var response = JSON.parse(xhr.responseText);
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error ? response.error.message : 'Upload failed'));
            }
          } catch (e) {
            reject(new Error('Invalid response format'));
          }
        } else {
          try {
            var errorResponse = JSON.parse(xhr.responseText);
            reject(new Error(errorResponse.error ? errorResponse.error.message : 'Upload failed'));
          } catch (e) {
            reject(new Error('Upload failed with status: ' + xhr.status));
          }
        }
      };

      xhr.onerror = function() {
        reject(new Error('Network error occurred'));
      };

      xhr.ontimeout = function() {
        reject(new Error('Upload timeout'));
      };

      // Progress tracking if callback provided
      if (options.onProgress && typeof options.onProgress === 'function') {
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable) {
            var percentComplete = (e.loaded / e.total) * 100;
            options.onProgress(percentComplete);
          }
        };
      }

      xhr.send(formData);
    });
  };

  /**
   * Upload multiple images
   * @param {Array<File|Blob>} files - Array of image files to upload
   * @param {Object} options - Upload options
   * @returns {Promise} Promise that resolves with array of upload responses
   */
  ImageUploadApp.prototype.uploadMultiple = function(files, options) {
    var self = this;
    options = options || {};

    if (!Array.isArray(files) || files.length === 0) {
      return Promise.reject(new Error('Files array is required and must not be empty'));
    }

    var formData = new FormData();
    files.forEach(function(file) {
      formData.append('images', file);
    });
    formData.append('key', self.apiKey);

    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', self.options.baseUrl + '/api/1/upload');
      xhr.timeout = self.options.timeout;

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var response = JSON.parse(xhr.responseText);
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error ? response.error.message : 'Upload failed'));
            }
          } catch (e) {
            reject(new Error('Invalid response format'));
          }
        } else {
          try {
            var errorResponse = JSON.parse(xhr.responseText);
            reject(new Error(errorResponse.error ? errorResponse.error.message : 'Upload failed'));
          } catch (e) {
            reject(new Error('Upload failed with status: ' + xhr.status));
          }
        }
      };

      xhr.onerror = function() {
        reject(new Error('Network error occurred'));
      };

      xhr.ontimeout = function() {
        reject(new Error('Upload timeout'));
      };

      if (options.onProgress && typeof options.onProgress === 'function') {
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable) {
            var percentComplete = (e.loaded / e.total) * 100;
            options.onProgress(percentComplete);
          }
        };
      }

      xhr.send(formData);
    });
  };

  /**
   * Helper method to create a file input and trigger upload
   * @param {Object} options - Options including callbacks
   * @returns {void}
   */
  ImageUploadApp.prototype.createUploadWidget = function(options) {
    var self = this;
    options = options || {};

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = options.multiple || false;

    input.onchange = function(e) {
      var files = Array.from(e.target.files);
      
      if (files.length === 0) return;

      if (options.onStart) {
        options.onStart(files);
      }

      var uploadPromise = files.length === 1 
        ? self.upload(files[0], { onProgress: options.onProgress })
        : self.uploadMultiple(files, { onProgress: options.onProgress });

      uploadPromise
        .then(function(response) {
          if (options.onSuccess) {
            options.onSuccess(response, files);
          }
        })
        .catch(function(error) {
          if (options.onError) {
            options.onError(error, files);
          }
        });
    };

    input.click();
  };

  // Export for different environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageUploadApp;
  } else if (typeof define === 'function' && define.amd) {
    define(function() {
      return ImageUploadApp;
    });
  } else {
    global.ImageUploadApp = ImageUploadApp;
  }

})(typeof window !== 'undefined' ? window : this);
