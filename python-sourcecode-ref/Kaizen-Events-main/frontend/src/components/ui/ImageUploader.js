import React, { useState, useRef } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Upload, Link, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

// Convert a server-relative upload path to an absolute URL
const toAbsoluteUrl = (url) =>
  url?.startsWith('/api/uploads/') ? `${BACKEND_URL}${url}` : url;

// Image compression utility
const compressImage = (file, maxWidth = 1600, maxHeight = 900, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Create new file from blob
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve({
                file: compressedFile,
                originalSize: file.size,
                compressedSize: blob.size,
                width,
                height
              });
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
};

// Format file size for display
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const ImageUploader = ({ 
  value, 
  onChange, 
  label = "Image",
  placeholder = "Enter image URL or upload",
  className = "",
  aspectRatio = "auto", // "auto", "16/9", "1/1", "4/3"
  maxWidth = 1600, // Maximum width for compression
  maxHeight = 900, // Maximum height for compression
  maxSizeKB = 200 // Max file size in KB before compression
}) => {
  const [mode, setMode] = useState(value?.startsWith('/api/uploads') ? 'upload' : 'url');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(toAbsoluteUrl(value) || '');
  const [compressionInfo, setCompressionInfo] = useState(null);
  const [urlError, setUrlError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleUrlChange = (e) => {
    const url = e.target.value;
    setPreview(url);
    setUrlError(false);
    onChange(url);
  };

  // Core upload pipeline: validate → preview → (maybe) compress → POST. Used by
  // both the click-to-upload <input> and the drag-and-drop dropzone.
  const uploadFile = async (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload JPEG, PNG, GIF, WebP, or SVG.');
      return;
    }

    // Validate file size (10MB max for original)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB.');
      return;
    }

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setCompressionInfo(null);

    // Upload to server
    setUploading(true);
    try {
      let fileToUpload = file;
      let wasCompressed = false;

      // Compress if file is larger than maxSizeKB or if it's not SVG
      const shouldCompress = file.type !== 'image/svg+xml' && 
        (file.size > maxSizeKB * 1024 || file.type !== 'image/jpeg');

      if (shouldCompress) {
        try {
          const result = await compressImage(file, maxWidth, maxHeight, 0.8);
          fileToUpload = result.file;
          wasCompressed = true;
          
          // Show compression info
          const savings = ((1 - result.compressedSize / result.originalSize) * 100).toFixed(0);
          setCompressionInfo({
            original: formatFileSize(result.originalSize),
            compressed: formatFileSize(result.compressedSize),
            savings: savings,
            dimensions: `${result.width}×${result.height}`
          });

          // Only show toast if significant compression happened
          if (result.compressedSize < result.originalSize * 0.9) {
            toast.success(`Image compressed: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)} (${savings}% smaller)`);
          }
        } catch (compressError) {
          console.warn('Compression failed, uploading original:', compressError);
          // Continue with original file if compression fails
        }
      }

      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await api.post('/uploads/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        const imageUrl = response.data.url;
        setPreview(toAbsoluteUrl(imageUrl));
        onChange(imageUrl);
        toast.success('Image uploaded successfully!');
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload image');
      setPreview(value || '');
      setCompressionInfo(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  };

  // Adapter: file-input change event → uploadFile()
  const handleFileSelect = (e) => uploadFile(e.target.files?.[0]);

  // Drag-and-drop wiring. Use a small counter pattern to avoid the flicker that
  // dragenter/dragleave produces when the pointer crosses child elements.
  const dragCounterRef = useRef(0);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };
  const handleDragOver = (e) => {
    // dragover must call preventDefault or drop won't fire — this is the
    // single most common reason drag-and-drop "doesn't work" in browsers.
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  };

  const handleClear = () => {
    setPreview('');
    onChange('');
    setCompressionInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case '16/9': return 'aspect-video';
      case '1/1': return 'aspect-square';
      case '4/3': return 'aspect-[4/3]';
      default: return '';
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <Label className="text-slate-700 font-jakarta text-sm mb-2 block">{label}</Label>
      )}

      {/* Mode Toggle */}
      <div className="flex space-x-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => {
            setMode('upload');
            // Clear preview so the dropzone shows (unless already an uploaded file)
            if (!value?.startsWith('/api/uploads/')) {
              setPreview('');
            }
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            mode === 'upload'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Upload className="w-3 h-3 inline mr-1" />
          Upload
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('url');
            // Restore the URL preview when switching back
            setPreview(toAbsoluteUrl(value) || '');
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            mode === 'url'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Link className="w-3 h-3 inline mr-1" />
          URL
        </button>
      </div>

      {/* Upload Mode */}
      {mode === 'upload' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            onChange={handleFileSelect}
            className="hidden"
            id={`file-upload-${label}`}
          />
          
          {!preview ? (
            <label
              htmlFor={`file-upload-${label}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                uploading ? 'pointer-events-none opacity-50' : ''
              } ${
                isDragging
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  : 'border-slate-300 hover:border-primary hover:bg-primary/5'
              }`}
            >
              {uploading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                  <span className="text-sm text-slate-500">Compressing & uploading...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center pointer-events-none">
                  <Upload className={`w-8 h-8 mb-2 ${isDragging ? 'text-primary' : 'text-slate-400'}`} />
                  <span className={`text-sm ${isDragging ? 'text-primary font-medium' : 'text-slate-500'}`}>
                    {isDragging ? 'Drop image to upload' : 'Click to upload or drag and drop'}
                  </span>
                  <span className="text-xs text-slate-400 mt-1">PNG, JPG, GIF, WebP, SVG (max 10MB, auto-compressed)</span>
                </div>
              )}
            </label>
          ) : (
            <div className="space-y-2">
              <div className="relative group max-w-[200px]">
                <div className={`relative rounded-lg overflow-hidden border border-slate-200 ${getAspectRatioClass()}`}>
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <label
                    htmlFor={`file-upload-${label}`}
                    className="p-1.5 bg-white rounded-lg shadow-md cursor-pointer hover:bg-slate-50"
                  >
                    <Upload className="w-4 h-4 text-slate-600" />
                  </label>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1.5 bg-white rounded-lg shadow-md hover:bg-red-50"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
              {/* Compression Info */}
              {compressionInfo && (
                <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs">
                  <span className="text-green-700">
                    📦 Compressed: {compressionInfo.original} → {compressionInfo.compressed}
                  </span>
                  <span className="text-green-600 font-medium">
                    {compressionInfo.savings}% smaller • {compressionInfo.dimensions}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* URL Mode */}
      {mode === 'url' && (
        <div className="space-y-2">
          <div className="flex space-x-2">
            <Input
              type="url"
              value={value || ''}
              onChange={handleUrlChange}
              placeholder={placeholder}
              className="flex-1 h-10"
            />
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="px-2"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          {/* URL Preview */}
          {preview && mode === 'url' && (
            <div className={`relative rounded-lg overflow-hidden border max-w-[200px] ${getAspectRatioClass() || 'h-28'} ${urlError ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
              {urlError ? (
                <div className="w-full h-full flex items-center justify-center text-red-400 p-2">
                  <span className="text-xs text-center">Invalid image URL</span>
                </div>
              ) : (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={() => setUrlError(true)}
                  onLoad={() => setUrlError(false)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
