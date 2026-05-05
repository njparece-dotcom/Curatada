"use client";

import { useState, useRef, useCallback } from "react";
import {
  GuitarCategory,
  GuitarItem,
  CATEGORY_LABELS,
  GUITAR_CATEGORIES,
  CONDITIONS,
  Condition,
  CONDITION_COLORS,
} from "@/lib/types";

interface AddItemModalProps {
  defaultCategory: GuitarCategory;
  onClose: () => void;
  onItemAdded: (item: GuitarItem, offerValuation?: boolean) => void;
}

interface UploadedFile {
  filename: string;
  original_name: string;
  path: string;
  mime_type: string;
  size: number;
}

interface FormState {
  category: GuitarCategory;
  brand: string;
  model: string;
  year: string;
  serial_number: string;
  condition: Condition | "";
  purchase_price: string;
  purchase_source: string;
  color_finish: string;
  short_description: string;
  link: string;
  notes: string;
}

export default function AddItemModal({
  defaultCategory,
  onClose,
  onItemAdded,
}: AddItemModalProps) {
  const [form, setForm] = useState<FormState>({
    category: defaultCategory,
    brand: "",
    model: "",
    year: "",
    serial_number: "",
    condition: "",
    purchase_price: "",
    purchase_source: "",
    color_finish: "",
    short_description: "",
    link: "",
    notes: "",
  });

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [dragOver, setDragOver] = useState(false);
  // Reorder state
  const [reorderDragIdx, setReorderDragIdx] = useState<number | null>(null);
  const [reorderDropIdx, setReorderDropIdx] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormState]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const addFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...imageFiles]);

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReorderDragStart = (i: number) => setReorderDragIdx(i);
  const handleReorderDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setReorderDropIdx(i);
  };
  const handleReorderDrop = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (reorderDragIdx === null || reorderDragIdx === i) {
      setReorderDragIdx(null); setReorderDropIdx(null); return;
    }
    const newFiles = [...files];
    const newPreviews = [...previews];
    const [mf] = newFiles.splice(reorderDragIdx, 1);
    const [mp] = newPreviews.splice(reorderDragIdx, 1);
    newFiles.splice(i, 0, mf);
    newPreviews.splice(i, 0, mp);
    setFiles(newFiles);
    setPreviews(newPreviews);
    setReorderDragIdx(null); setReorderDropIdx(null);
  };
  const handleReorderDragEnd = () => { setReorderDragIdx(null); setReorderDropIdx(null); };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.brand.trim()) newErrors.brand = "Brand is required";
    if (!form.model.trim()) newErrors.model = "Model is required";
    if (!form.condition) newErrors.condition = "Condition is required";
    if (form.year && (isNaN(Number(form.year)) || Number(form.year) < 1800 || Number(form.year) > new Date().getFullYear() + 1)) {
      newErrors.year = "Enter a valid year";
    }
    if (form.link && !/^https?:\/\/.+/.test(form.link)) {
      newErrors.link = "Must be a valid URL (https://...)";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    let uploadedFiles: UploadedFile[] = [];

    try {
      // Upload images first
      if (files.length > 0) {
        setUploading(true);
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || "Upload failed");
        }

        const uploadData = await uploadRes.json();
        uploadedFiles = uploadData.files;
        setUploading(false);
      }

      // Create the item
      const payload = {
        category: form.category,
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: form.year ? parseInt(form.year) : null,
        serial_number: form.serial_number.trim() || null,
        condition: form.condition,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        purchase_source: form.purchase_source.trim() || null,
        color_finish: form.color_finish.trim() || null,
        short_description: form.short_description.trim() || null,
        link: form.link.trim() || null,
        notes: form.notes.trim() || null,
        image_paths: uploadedFiles,
      };

      const res = await fetch("/api/guitars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create item");
      }

      const newItem: GuitarItem = await res.json();
      onItemAdded(newItem, true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="modal-content bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-xl font-bold text-text">Add New Item</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {CATEGORY_LABELS[form.category]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-surface-3 text-text-muted hover:text-text transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Category
            </label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none appearance-none"
            >
              {GUITAR_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          {/* Brand + Model */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Brand <span className="text-red-400">*</span>
              </label>
              <input
                name="brand"
                value={form.brand}
                onChange={handleChange}
                placeholder="e.g. Fender"
                className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${
                  errors.brand ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"
                }`}
              />
              {errors.brand && <p className="text-xs text-red-400 mt-1">{errors.brand}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Model <span className="text-red-400">*</span>
              </label>
              <input
                name="model"
                value={form.model}
                onChange={handleChange}
                placeholder="e.g. Stratocaster"
                className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${
                  errors.model ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"
                }`}
              />
              {errors.model && <p className="text-xs text-red-400 mt-1">{errors.model}</p>}
            </div>
          </div>

          {/* Year + Serial */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Year
              </label>
              <input
                name="year"
                type="number"
                value={form.year}
                onChange={handleChange}
                placeholder="e.g. 1965"
                min={1800}
                max={new Date().getFullYear() + 1}
                className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${
                  errors.year ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"
                }`}
              />
              {errors.year && <p className="text-xs text-red-400 mt-1">{errors.year}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Serial Number
              </label>
              <input
                name="serial_number"
                value={form.serial_number}
                onChange={handleChange}
                placeholder="e.g. V123456"
                className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
          </div>

          {/* Color/Finish + Short Description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Color / Finish
              </label>
              <input
                name="color_finish"
                value={form.color_finish}
                onChange={handleChange}
                placeholder="e.g. Sunburst, Cherry Red"
                className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Short Description
              </label>
              <input
                name="short_description"
                value={form.short_description}
                onChange={handleChange}
                placeholder="e.g. Flamed maple top"
                className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Condition <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CONDITIONS.map((cond) => (
                <button
                  key={cond}
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, condition: cond }));
                    if (errors.condition) setErrors((prev) => ({ ...prev, condition: undefined }));
                  }}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                    form.condition === cond
                      ? CONDITION_COLORS[cond]
                      : "border-border text-text-muted hover:border-border-2 hover:text-text"
                  }`}
                >
                  {cond}
                </button>
              ))}
            </div>
            {errors.condition && <p className="text-xs text-red-400 mt-1">{errors.condition}</p>}
          </div>

          {/* Price + Source */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Purchase Price
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                <input
                  name="purchase_price"
                  type="number"
                  value={form.purchase_price}
                  onChange={handleChange}
                  placeholder="0.00"
                  min={0}
                  step="0.01"
                  className="w-full bg-surface-2 border border-border text-text rounded-xl pl-8 pr-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Purchase Source
              </label>
              <input
                name="purchase_source"
                value={form.purchase_source}
                onChange={handleChange}
                placeholder="e.g. Reverb, eBay"
                className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
          </div>

          {/* Link */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Link (optional)
            </label>
            <input
              name="link"
              type="url"
              value={form.link}
              onChange={handleChange}
              placeholder="https://..."
              className={`w-full bg-surface-2 border text-text rounded-xl px-4 py-2.5 text-sm outline-none transition-colors ${
                errors.link ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-accent focus:ring-1 focus:ring-accent"
              }`}
            />
            {errors.link && <p className="text-xs text-red-400 mt-1">{errors.link}</p>}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Notes
            </label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Any additional details..."
              rows={3}
              className="w-full bg-surface-2 border border-border text-text rounded-xl px-4 py-2.5 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none resize-none"
            />
          </div>

          {/* Images */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Images
            </label>

            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                dragOver
                  ? "border-accent bg-accent-dim"
                  : "border-border hover:border-border-2"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="w-8 h-8 text-text-dim mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <p className="text-sm text-text-muted">
                Drag & drop or <span className="text-accent">click to upload</span>
              </p>
              <p className="text-xs text-text-dim mt-1">
                JPG, PNG, WebP up to 10MB each
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Previews — draggable to reorder */}
            {previews.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-text-dim">Drag to reorder · first image is the cover</p>
                <div className="flex flex-wrap gap-2">
                  {previews.map((preview, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => handleReorderDragStart(i)}
                      onDragOver={(e) => handleReorderDragOver(e, i)}
                      onDrop={(e) => handleReorderDrop(e, i)}
                      onDragEnd={handleReorderDragEnd}
                      className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 group/img cursor-grab active:cursor-grabbing transition-all select-none ${
                        reorderDragIdx === i
                          ? "opacity-40 border-accent scale-95"
                          : reorderDropIdx === i
                          ? "border-accent ring-2 ring-accent/30"
                          : "border-border hover:border-border-2"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt={`Preview ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600/80"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      {/* Primary badge */}
                      {i === 0 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-accent/90 text-on-primary text-[10px] text-center py-0.5 font-semibold">
                          Cover
                        </div>
                      )}
                      {/* Position number */}
                      {i > 0 && (
                        <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/60 text-white text-[9px] flex items-center justify-center font-bold">
                          {i + 1}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {uploading ? "Uploading..." : "Saving..."}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Item
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
