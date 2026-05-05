import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { IoDImage } from "@/lib/types";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; imageId: string } }
) {
  try {
    const { id, imageId } = params;

    const image = await queryOne<IoDImage>(
      `DELETE FROM iod_images WHERE id = $1 AND iod_id = $2 RETURNING *`,
      [imageId, id]
    );

    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "iod", id);
      await fs.unlink(path.join(uploadsDir, image.filename));
    } catch {
      try {
        const uploadsDir = path.join(process.cwd(), "public", "uploads");
        await fs.unlink(path.join(uploadsDir, image.filename));
      } catch {
        // File may not exist, ignore
      }
    }

    return NextResponse.json({ success: true, deleted: image });
  } catch (error) {
    console.error("DELETE /api/iod/[id]/images/[imageId] error:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
