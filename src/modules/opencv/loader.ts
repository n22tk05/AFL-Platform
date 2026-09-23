import type { CV, Mat } from '@techstark/opencv-js';

export type OpenCvRuntime = CV;
export type { Mat };

const OPENCV_LOAD_TIMEOUT_MS = 15_000;

let openCvPromise: Promise<OpenCvRuntime> | null = null;

interface MutableEmscriptenModule {
  onRuntimeInitialized?: (() => void) | null;
  Mat?: unknown;
  then?: (onFulfilled: (value: unknown) => unknown) => Promise<unknown>;
}

async function initOpenCv(): Promise<OpenCvRuntime> {
  const cvModule = await import('@techstark/opencv-js');
  const rawExport = (cvModule as { default?: unknown }).default ?? cvModule;

  let instance: unknown = rawExport;

  // Handle case where module export is a factory function
  if (typeof instance === 'function') {
    instance = (instance as () => unknown)();
  }

  // Handle case where module export is a Promise / thenable
  if (instance && typeof (instance as MutableEmscriptenModule).then === 'function') {
    instance = await instance;
  }

  // Handle case where instance is already initialized and Mat constructor exists
  if (instance && typeof (instance as MutableEmscriptenModule).Mat === 'function') {
    return instance as OpenCvRuntime;
  }

  // Handle case where runtime needs to wait for onRuntimeInitialized callback
  await new Promise<void>((resolve, reject) => {
    if (!instance || typeof instance !== 'object') {
      reject(new Error('Invalid OpenCV module export.'));
      return;
    }

    const mod = instance as MutableEmscriptenModule;
    if (typeof mod.Mat === 'function') {
      resolve();
      return;
    }

    // onRuntimeInitialized is typed as a read-only method in Emscripten declaration,
    // so we safely cast to a mutable structure to attach our initialization listener.
    const originalCallback = mod.onRuntimeInitialized;
    mod.onRuntimeInitialized = () => {
      try {
        if (typeof originalCallback === 'function') {
          originalCallback();
        }
      } finally {
        resolve();
      }
    };
  });

  if (!instance || typeof (instance as MutableEmscriptenModule).Mat !== 'function') {
    throw new Error('OpenCV WASM runtime initialized without Mat constructor.');
  }

  return instance as OpenCvRuntime;
}

export function loadOpenCv(): Promise<OpenCvRuntime> {
  if (typeof window === 'undefined') {
    return Promise.reject(
      new Error('OpenCV WASM runtime can only be loaded in a browser environment.')
    );
  }

  if (openCvPromise) {
    return openCvPromise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Failed to initialize OpenCV WASM within ${OPENCV_LOAD_TIMEOUT_MS / 1000} seconds.`
        )
      );
    }, OPENCV_LOAD_TIMEOUT_MS);
  });

  openCvPromise = Promise.race([initOpenCv(), timeoutPromise])
    .catch((error) => {
      // Allow retrying if initialization failed
      openCvPromise = null;
      throw error;
    })
    .finally(() => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    });

  return openCvPromise;
}
