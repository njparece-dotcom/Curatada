// Shared image upload helper used by every Add/Edit modal. POSTs the files
// to /api/upload and returns the parsed response — caller is responsible for
// passing the result through to the eventual item POST/PATCH payload.

export interface UploadedFile {
  filename: string;
  original_name: string;
  path: string;
  mime_type: string;
  size: number;
}

export async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  if (files.length === 0) return [];
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }
  const data = await res.json();
  return data.files as UploadedFile[];
}
