"use client";

import { useCallback, useMemo, useRef, useState } from "react";

// Edit-modal counterpart to useImageUpload. Manages a unified list of images
// where each entry is either an existing DB row (toggleable toDelete) or a
// new pending upload (immediate-remove). Drag-to-reorder operates on the
// combined list.
//
// Submit-time the modal reads `derived` to get the three lists the PATCH
// endpoint expects: image_order (ordered IDs of kept existing images),
// images_to_delete (existing IDs marked for delete), and pendingFiles
// (new File[] to upload first).

export interface BaseImage {
  id: string;
  path: string;
}

export type EditImage<T extends BaseImage> =
  | { kind: "existing"; image: T; toDelete: boolean }
  | { kind: "new"; file: File; preview: string };

export interface EditImageList<T extends BaseImage> {
  editImages: EditImage<T>[];
  dragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  reorderDragIdx: number | null;
  reorderDropIdx: number | null;
  // drop-zone
  onPickClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  // per-item
  toggleDelete: (index: number) => void;
  reorder: {
    onDragStart: (index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (e: React.DragEvent, index: number) => void;
    onDragEnd: () => void;
  };
  // derived for submit payload
  derived: {
    imagesToDelete: string[];
    pendingFiles: File[];
    imageOrder: string[];
  };
}

export function useEditImageList<T extends BaseImage>(initial: T[]): EditImageList<T> {
  const [editImages, setEditImages] = useState<EditImage<T>[]>(() =>
    initial.map((image) => ({ kind: "existing" as const, image, toDelete: false })),
  );
  const [dragOver, setDragOver] = useState(false);
  const [reorderDragIdx, setReorderDragIdx] = useState<number | null>(null);
  const [reorderDropIdx, setReorderDropIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addNewFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditImages((prev) => [
          ...prev,
          { kind: "new", file, preview: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addNewFiles(Array.from(e.target.files));
    },
    [addNewFiles],
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
      if (e.dataTransfer.files) addNewFiles(Array.from(e.dataTransfer.files));
    },
    [addNewFiles],
  );
  const onPickClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Existing items toggle their toDelete flag. New items are removed from the
  // list outright since there's nothing in the DB to restore them from.
  const toggleDelete = useCallback((idx: number) => {
    setEditImages((prev) => {
      const target = prev[idx];
      if (!target) return prev;
      if (target.kind === "existing") {
        return prev.map((entry, i) =>
          i === idx && entry.kind === "existing"
            ? { ...entry, toDelete: !entry.toDelete }
            : entry,
        );
      }
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const reorder = {
    onDragStart: useCallback((index: number) => setReorderDragIdx(index), []),
    onDragOver: useCallback((e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setReorderDropIdx(index);
    }, []),
    onDrop: useCallback((e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setReorderDragIdx((dragIdx) => {
        if (dragIdx === null || dragIdx === index) {
          setReorderDropIdx(null);
          return null;
        }
        setEditImages((prev) => {
          const next = [...prev];
          const [moved] = next.splice(dragIdx, 1);
          next.splice(index, 0, moved);
          return next;
        });
        setReorderDropIdx(null);
        return null;
      });
    }, []),
    onDragEnd: useCallback(() => {
      setReorderDragIdx(null);
      setReorderDropIdx(null);
    }, []),
  };

  const derived = useMemo(() => {
    const imagesToDelete: string[] = [];
    const pendingFiles: File[] = [];
    const imageOrder: string[] = [];
    for (const entry of editImages) {
      if (entry.kind === "existing") {
        if (entry.toDelete) imagesToDelete.push(entry.image.id);
        else imageOrder.push(entry.image.id);
      } else {
        pendingFiles.push(entry.file);
      }
    }
    return { imagesToDelete, pendingFiles, imageOrder };
  }, [editImages]);

  return {
    editImages,
    dragOver,
    fileInputRef,
    reorderDragIdx,
    reorderDropIdx,
    onPickClick,
    onFileChange,
    onDragOver,
    onDragLeave,
    onDrop,
    toggleDelete,
    reorder,
    derived,
  };
}
