'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { convertToGrayscale } from '@/modules/opencv/grayscale';

type ProcessingStatus =
  | 'chưa chọn ảnh'
  | 'ảnh đã sẵn sàng'
  | 'đang khởi tạo OpenCV'
  | 'xử lý thành công'
  | 'xử lý thất bại';

const MAX_LONG_SIDE = 1600;

export default function OpenCvTestPage() {
  const [status, setStatus] = useState<ProcessingStatus>('chưa chọn ảnh');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasImage, setHasImage] = useState<boolean>(false);
  const [imageInfo, setImageInfo] = useState<string | null>(null);

  const inputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  // Cleanup pending object URL on unmount
  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      setErrorMessage(null);

      // Revoke any previously allocated object URL
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }

      if (!file) {
        setHasImage(false);
        setImageInfo(null);
        setStatus('chưa chọn ảnh');
        return;
      }

      // Validate MIME type - strictly JPEG and PNG
      const validTypes = ['image/jpeg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        setHasImage(false);
        setImageInfo(null);
        setStatus('xử lý thất bại');
        setErrorMessage(
          `Định dạng file "${file.type || 'không xác định'}" không hợp lệ. Vui lòng chọn ảnh JPEG hoặc PNG.`
        );
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      activeUrlRef.current = objectUrl;

      const img = new Image();
      img.onload = () => {
        // Revoke URL immediately after image load
        URL.revokeObjectURL(objectUrl);
        if (activeUrlRef.current === objectUrl) {
          activeUrlRef.current = null;
        }

        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;

        if (naturalWidth === 0 || naturalHeight === 0) {
          setHasImage(false);
          setImageInfo(null);
          setStatus('xử lý thất bại');
          setErrorMessage('Kích thước ảnh không hợp lệ (0x0).');
          return;
        }

        // Calculate dimensions: resize if long side exceeds MAX_LONG_SIDE, maintain aspect ratio
        let targetWidth = naturalWidth;
        let targetHeight = naturalHeight;
        const maxDimension = Math.max(naturalWidth, naturalHeight);

        if (maxDimension > MAX_LONG_SIDE) {
          const scale = MAX_LONG_SIDE / maxDimension;
          targetWidth = Math.round(naturalWidth * scale);
          targetHeight = Math.round(naturalHeight * scale);
        }

        // Render to input canvas
        const inputCanvas = inputCanvasRef.current;
        if (inputCanvas) {
          inputCanvas.width = targetWidth;
          inputCanvas.height = targetHeight;
          const ctx = inputCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          }
        }

        // Clear output canvas
        const outputCanvas = outputCanvasRef.current;
        if (outputCanvas) {
          outputCanvas.width = targetWidth;
          outputCanvas.height = targetHeight;
          const outCtx = outputCanvas.getContext('2d');
          if (outCtx) {
            outCtx.clearRect(0, 0, targetWidth, targetHeight);
          }
        }

        setImageInfo(
          `Ảnh gốc: ${naturalWidth}x${naturalHeight}px | Kích thước xử lý: ${targetWidth}x${targetHeight}px (${file.name})`
        );
        setHasImage(true);
        setStatus('ảnh đã sẵn sàng');
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (activeUrlRef.current === objectUrl) {
          activeUrlRef.current = null;
        }
        setHasImage(false);
        setImageInfo(null);
        setStatus('xử lý thất bại');
        setErrorMessage('Không thể đọc file ảnh đã chọn. File có thể bị hỏng.');
      };

      img.src = objectUrl;
    },
    []
  );

  const handleConvertToGrayscale = async () => {
    const inputCanvas = inputCanvasRef.current;
    const outputCanvas = outputCanvasRef.current;

    if (!inputCanvas || !outputCanvas || !hasImage) {
      return;
    }

    setErrorMessage(null);
    setStatus('đang khởi tạo OpenCV');

    try {
      await convertToGrayscale(inputCanvas, outputCanvas);
      setStatus('xử lý thành công');
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định khi xử lý ảnh.';
      console.error('Lỗi kỹ thuật khi xử lý OpenCV:', err);
      setErrorMessage(errorMsg);
      setStatus('xử lý thất bại');
    }
  };

  const isProcessing = status === 'đang khởi tạo OpenCV';
  const isButtonDisabled = !hasImage || isProcessing;

  const getStatusBadgeStyle = (): React.CSSProperties => {
    switch (status) {
      case 'ảnh đã sẵn sàng':
        return { backgroundColor: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' };
      case 'đang khởi tạo OpenCV':
        return { backgroundColor: '#fef3c7', color: '#b45309', borderColor: '#fde68a' };
      case 'xử lý thành công':
        return { backgroundColor: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0' };
      case 'xử lý thất bại':
        return { backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' };
      default:
        return { backgroundColor: '#f3f4f6', color: '#4b5563', borderColor: '#e5e7eb' };
    }
  };

  return (
    <main
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#1f2937',
      }}
    >
      <header style={{ marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
          OpenCV WASM Smoke Test
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
          Kiểm thử nạp runtime OpenCV WebAssembly và chuyển đổi ảnh màu sang Grayscale trên trình duyệt.
        </p>
      </header>

      {/* Control Panel */}
      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '20px',
        }}
      >
        <div>
          <label
            htmlFor="image-upload"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
          >
            Chọn ảnh (JPEG / PNG):
          </label>
          <input
            id="image-upload"
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={isProcessing}
            style={{
              display: 'block',
              fontSize: '14px',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
            }}
          />
        </div>

        <div>
          <button
            type="button"
            onClick={handleConvertToGrayscale}
            disabled={isButtonDisabled}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: isButtonDisabled ? '#9ca3af' : '#2563eb',
              border: 'none',
              borderRadius: '6px',
              cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              marginTop: '18px',
            }}
          >
            {isProcessing ? 'Đang xử lý...' : 'Chuyển sang ảnh xám'}
          </button>
        </div>

        {/* Status display */}
        <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: '#4b5563' }}>Trạng thái:</span>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '9999px',
              border: '1px solid',
              ...getStatusBadgeStyle(),
            }}
          >
            {status}
          </span>
        </div>
      </section>

      {/* Image metadata */}
      {imageInfo && (
        <div
          style={{
            fontSize: '13px',
            color: '#4b5563',
            marginBottom: '16px',
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
          }}
        >
          {imageInfo}
        </div>
      )}

      {/* Error alert */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #f87171',
            borderRadius: '6px',
            color: '#991b1b',
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          <strong>Lỗi: </strong>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Visual Canvas Area */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Original Image Canvas */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#ffffff',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>
            Vùng ảnh gốc
          </h2>
          <div
            style={{
              width: '100%',
              minHeight: '260px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              overflow: 'hidden',
              border: '1px dashed #d1d5db',
            }}
          >
            <canvas
              ref={inputCanvasRef}
              style={{
                maxWidth: '100%',
                maxHeight: '500px',
                height: 'auto',
                display: hasImage ? 'block' : 'none',
                objectFit: 'contain',
              }}
            />
            {!hasImage && (
              <span style={{ color: '#9ca3af', fontSize: '14px' }}>Chưa chọn ảnh để hiển thị</span>
            )}
          </div>
        </div>

        {/* Grayscale Image Canvas */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#ffffff',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>
            Vùng ảnh grayscale
          </h2>
          <div
            style={{
              width: '100%',
              minHeight: '260px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              overflow: 'hidden',
              border: '1px dashed #d1d5db',
            }}
          >
            <canvas
              ref={outputCanvasRef}
              style={{
                maxWidth: '100%',
                maxHeight: '500px',
                height: 'auto',
                display: status === 'xử lý thành công' ? 'block' : 'none',
                objectFit: 'contain',
              }}
            />
            {status !== 'xử lý thành công' && (
              <span style={{ color: '#9ca3af', fontSize: '14px' }}>
                Ảnh grayscale sẽ xuất hiện ở đây sau khi chuyển đổi
              </span>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
