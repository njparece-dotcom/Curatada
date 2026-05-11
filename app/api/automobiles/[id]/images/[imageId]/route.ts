import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { AutoImage } from "@/lib/types";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await params;

    const image = await queryOne<AutoImage>(
      `DELETE FROM auto_images WHERE id = $1 AND auto_id = $2 RETURNING *`,
      [imageId, id]
    );

    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Try to delete the file from disk
    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "auto", id);
      await fs.unlink(path.join(uploadsDir, image.filename));
    } catch {
      // Also try the root uploads dir for older images
      try {
        const uploadsDir = path.join(process.cwd(), "public", "uploads");
        await fs.unlink(path.join(uploadsDir, image.filename));
      } catch {
        // File may not exist, ignore
      }
    }

    return NextResponse.json({ success: true, deleted: image });
  } catch (error) {
    console.error("DELETE /api/automobiles/[id]/images/[imageId] error:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
