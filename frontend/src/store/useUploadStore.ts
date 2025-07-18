import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { OpenAPI } from '@/client/core/OpenAPI'

export interface UploadFile {
  id: string
  file: File
  title: string
  description?: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
  result?: any
}

interface UploadState {
  files: UploadFile[]
  isUploading: boolean
  currentUploadingId: string | null
  
  // Actions
  addFiles: (files: File[], title: string, description?: string, initialError?: string) => void
  removeFile: (id: string) => void
  clearCompleted: () => void
  clearAll: () => void
  startUpload: () => void
  pauseUpload: () => void
  retryFile: (id: string) => void
  
  // Internal actions
  updateFileStatus: (id: string, status: UploadFile['status'], progress?: number, error?: string, result?: any) => void
  processQueue: () => Promise<void>
}

// PDF Upload Service
class PDFUploadService {
  static async uploadPDF(
    file: File, 
    title: string, 
    description?: string,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    const token = localStorage.getItem("access_token");
    if (!token) {
      throw new Error("No authentication token found");
    }

    const formData = new FormData();
    formData.append("title", title);
    if (description) {
      formData.append("description", description);
    }
    formData.append("file", file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve(result);
          } catch (e) {
            resolve(xhr.responseText);
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.detail || `Upload failed for ${file.name}`));
          } catch (e) {
            reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error occurred during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload was aborted'));
      });

      xhr.open('POST', `${OpenAPI.BASE}/api/v1/pdfs/`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
  }
}

export const useUploadStore = create<UploadState>()(
  persist(
    (set, get) => ({
      files: [],
      isUploading: false,
      currentUploadingId: null,

      addFiles: (files: File[], baseTitle: string, description?: string, initialError?: string) => {
        const newFiles: UploadFile[] = files.map((file, index) => ({
          id: `${Date.now()}-${index}`,
          file,
          title: files.length === 1 
            ? baseTitle 
            : `${baseTitle} - Part ${index + 1}`,
          description,
          status: initialError ? 'error' as const : 'pending' as const,
          progress: 0,
          error: initialError,
        }));

        set((state: UploadState) => ({
          files: [...state.files, ...newFiles]
        }));

        // Auto start upload if not already uploading and there are valid files
        if (!initialError && !get().isUploading) {
          get().startUpload();
        }
      },

      removeFile: (id: string) => {
        set((state: UploadState) => ({
          files: state.files.filter((file: UploadFile) => file.id !== id)
        }));
      },

      clearCompleted: () => {
        set((state: UploadState) => ({
          files: state.files.filter((file: UploadFile) => 
            file.status === 'pending' || file.status === 'uploading'
          )
        }));
      },

      clearAll: () => {
        set({
          files: [],
          isUploading: false,
          currentUploadingId: null
        });
      },

      startUpload: () => {
        if (!get().isUploading) {
          set({ isUploading: true });
          get().processQueue();
        }
      },

      pauseUpload: () => {
        set({ 
          isUploading: false,
          currentUploadingId: null
        });
      },

      retryFile: (id: string) => {
        set((state: UploadState) => ({
          files: state.files.map((file: UploadFile) =>
            file.id === id
              ? { ...file, status: 'pending' as const, progress: 0, error: undefined }
              : file
          )
        }));

        // Auto start upload if not already uploading
        if (!get().isUploading) {
          get().startUpload();
        }
      },

      updateFileStatus: (id: string, status: UploadFile['status'], progress = 0, error?: string, result?: any) => {
        set((state: UploadState) => ({
          files: state.files.map((file: UploadFile) =>
            file.id === id
              ? { ...file, status, progress, error, result }
              : file
          )
        }));
      },

      processQueue: async () => {
        const state = get();
        if (!state.isUploading) return;

        const pendingFiles = state.files.filter((file: UploadFile) => file.status === 'pending');
        
        if (pendingFiles.length === 0) {
          set({ 
            isUploading: false,
            currentUploadingId: null
          });
          return;
        }

        const fileToUpload = pendingFiles[0];
        
        // 在上传前再次验证文件（防止队列中有无效文件）
        const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
        if (fileToUpload.file.size > MAX_FILE_SIZE) {
          get().updateFileStatus(
            fileToUpload.id, 
            'error', 
            0, 
            `File size (${(fileToUpload.file.size / (1024*1024)).toFixed(2)} MB) exceeds the maximum allowed size of 10 MB`
          );
          // 继续处理下一个文件
          if (get().isUploading) {
            setTimeout(() => get().processQueue(), 100);
          }
          return;
        }
        
        if (fileToUpload.file.type !== 'application/pdf') {
          get().updateFileStatus(
            fileToUpload.id, 
            'error', 
            0, 
            `File type "${fileToUpload.file.type || 'unknown'}" is not supported. Only PDF files are allowed`
          );
          // 继续处理下一个文件
          if (get().isUploading) {
            setTimeout(() => get().processQueue(), 100);
          }
          return;
        }
        
        set({ currentUploadingId: fileToUpload.id });
        get().updateFileStatus(fileToUpload.id, 'uploading', 0);

        try {
          const result = await PDFUploadService.uploadPDF(
            fileToUpload.file,
            fileToUpload.title,
            fileToUpload.description,
            (progress) => {
              get().updateFileStatus(fileToUpload.id, 'uploading', progress);
            }
          );

          get().updateFileStatus(fileToUpload.id, 'success', 100, undefined, result);
          
          // Continue with next file if still uploading
          if (get().isUploading) {
            setTimeout(() => get().processQueue(), 500); // Small delay between uploads
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          get().updateFileStatus(fileToUpload.id, 'error', 0, errorMessage);
          
          // Continue with next file even if current one failed
          if (get().isUploading) {
            setTimeout(() => get().processQueue(), 1000); // Longer delay after error
          }
        }
      },
    }),
    {
      name: 'upload-store',
      // 只持久化基本状态，不持久化 File 对象
      partialize: (state: UploadState) => ({
        files: state.files.map((file: UploadFile) => ({
          ...file,
          file: undefined, // 不持久化 File 对象
        })) as any,
        isUploading: false, // 重新加载时重置上传状态
        currentUploadingId: null,
      }),
      // 加载时重新设置状态
      onRehydrateStorage: () => (state: UploadState | undefined) => {
        if (state) {
          // 清理可能存在的无效状态
          state.files = state.files.filter((file: UploadFile) => file.file !== undefined);
          state.isUploading = false;
          state.currentUploadingId = null;
        }
      },
    }
  )
)