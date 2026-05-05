"use client";

import { useCallback, useRef, useState } from "react";

// State + handlers for an in-modal image picker:
//   - drag-and-drop or click-to-upload (multi-file)
//   - per-file data-URL previews
//   - drag-to-reorder with drop-target highlight
//
// Consumed by both the modal-form and the <ImagesEditor> presentational
// component. The actual upload to /api/upload is left to the caller (see
// lib/api/uploadFiles.ts) so submit-time error handling stays in the modal.

export interface ImageUpload {
  files: File[];
  previews: string[];
  dragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  reorderDragIdx: number | null;
  reorderDropIdx: number | null;
  onPickClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  removeAt: (index: number) => void;
  reorder: {
    onDragStart: (index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (e: React.DragEvent, index: number) => void;
    onDragEnd: () => void;
  };
}

export function useImageUpload(): ImageUpload {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [reorderDragIdx, setReorderDragIdx] = useState<number | null>(null);
  const [reorderDropIdx, setReorderDropIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setFiles((prev) => [...prev, ...imageFiles]);
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(Array.from(e.target.files));
    },
    [addFiles],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const onPickClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeAt = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reorder = {
    onDragStart: useCallback((index: number) => setReorderDragIdx(index), []),
    onDragOver: useCallback((e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setReorderDropIdx(index);
    }, []),
    onDrop: useCallback(
      (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        setReorderDragIdx((dragIdx) => {
          if (dragIdx === null || dragIdx === index) {
            setReorderDropIdx(null);
            return null;
          }
          setFiles((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIdx, 1);
            next.splice(index, 0, moved);
            return next;
          });
          setPreviews((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIdx, 1);
            next.splice(index, 0, moved);
            return next;
          });
          setReorderDropIdx(null);
          return null;
        });
      },
      [],
    ),
    onDragEnd: useCallback(() => {
      setReorderDragIdx(null);
      setReorderDropIdx(null);
    }, []),
  };

  return {
    files,
    previews,
    dragOver,
    fileInputRef,
    reorderDragIdx,
    reorderDropIdx,
    onPickClick,
    onFileChange,
    onDragOver,
    onDragLeave,
    onDrop,
    removeAt,
    reorder,
  };
}
