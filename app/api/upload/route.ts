import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { authOptions } from "@/lib/auth";
import { r2IsConfigured, r2PutObject } from "@/lib/storage/r2";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    // R2 if configured (production / staging), local disk otherwise (dev).
    // The DB path format stays `/uploads/<filename>.ext` in both modes — the
    // serving route resolves it: redirect to a presigned R2 URL, or stream
    // from disk, depending on env.
    const useR2 = r2IsConfigured();
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!useR2) {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    const uploadedFiles: {
      filename: string;
      original_name: string;
      path: string;
      mime_type: string;
      size: number;
    }[] = [];

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `File type ${file.type} is not allowed` },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds maximum size of 10MB` },
          { status: 400 }
        );
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filename = `${uuidv4()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      if (useR2) {
        await r2PutObject(filename, buffer, file.type);
      } else {
        await fs.writeFile(path.join(uploadsDir, filename), buffer);
      }

      uploadedFiles.push({
        filename,
        original_name: file.name,
        path: `/uploads/${filename}`,
        mime_type: file.type,
        size: file.size,
      });
    }

    return NextResponse.json({ files: uploadedFiles }, { status: 201 });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 }
    );
  }
}
