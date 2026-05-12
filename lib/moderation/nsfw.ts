// Tier-1 image moderation — NSFW.js (TensorFlow.js MobileNetV2 classifier).
//
// Runs server-side at upload time. The model classifies an image into five
// categories: Drawing, Hentai, Neutral, Porn, Sexy. We treat the max
// probability across {Porn, Sexy, Hentai} as the "NSFW score" — that score
// drives the verdict written to the image row.
//
// Cost: $0 (the model runs in-process; no API calls). Limitation: trained on
// sexual content. It does NOT catch violence, gore, weapons, hate symbols, or
// other policy-relevant categories. Those will be handled by a deferred
// Tier-2 pass (Claude vision) when an image enters a public gallery.
//
// ── Why pure-JS tfjs (not tfjs-node)? ───────────────────────────────────────
//
// `@tensorflow/tfjs-node` is faster but ships native bindings that target
// glibc. Our production container is node:20-alpine (musl) and the official
// libtensorflow prebuilts are glibc-only — even with `libc6-compat` the
// install/load is fragile. Pure-JS tfjs has no native deps and runs anywhere
// Node runs. The latency cost is ~500ms-1s per classification on CPU vs
// ~100-300ms with tfjs-node — acceptable for an upload-time check, since
// the user is already waiting on the R2 PUT.
//
// We use `sharp` (native libvips, has prebuilt musl binaries) to decode the
// uploaded Buffer into raw RGB pixels, then build a tf.Tensor3D from that.
// Sharp is a hard dep added in the same PR.
//
// ── Singleton pattern ───────────────────────────────────────────────────────
//
// Loading the model is expensive (~2-3s cold start, ~80MB resident memory).
// We cache the loaded model on globalThis — same pattern as `pg.Pool` in
// lib/db.ts — so it's loaded once per process and survives Next dev's
// hot-reload. See CLAUDE.md "Gotchas" for the reasoning behind unconditional
// globalThis caching.

import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";
import sharp from "sharp";

// ── Tunables ────────────────────────────────────────────────────────────────

// Hard-block threshold. Above this score, the upload is refused outright; no
// row is ever inserted. Set conservatively high to minimize false positives —
// any legitimate collection image scoring >= 0.95 is essentially unheard of.
export const NSFW_HARD_BLOCK_THRESHOLD = 0.95;

// Flag threshold. Between FLAG and HARD_BLOCK, the image is let through but
// marked 'flagged' so Tier-2 can review before public exposure. Below this,
// the image is 'clean'.
export const NSFW_FLAG_THRESHOLD = 0.5;

// Categories whose probabilities feed the NSFW score. We deliberately exclude
// "Drawing" (artistic nudity rendered, low real-world abuse risk) and
// "Neutral" (the clean class). "Hentai" is included because animated sexual
// content still violates the spirit of a collection-tracking app.
const NSFW_CATEGORIES = new Set(["Porn", "Sexy", "Hentai"]);

// ── Singleton model loader ──────────────────────────────────────────────────

type Prediction = { className: string; probability: number };

interface NsfwGlobal {
  _nsfwModel?: nsfwjs.NSFWJS;
  _nsfwLoading?: Promise<nsfwjs.NSFWJS>;
}
const g = globalThis as unknown as NsfwGlobal;

async function getModel(): Promise<nsfwjs.NSFWJS> {
  if (g._nsfwModel) return g._nsfwModel;
  // Multiple concurrent requests on cold start would otherwise each trigger
  // their own `load()` call. Cache the in-flight Promise too so the second
  // caller awaits the first one's load instead of duplicating work.
  if (g._nsfwLoading) return g._nsfwLoading;
  g._nsfwLoading = (async () => {
    // Default `load()` uses MobileNetV2 with weights bundled inside the
    // nsfwjs npm package — no network fetch at runtime.
    const model = await nsfwjs.load();
    g._nsfwModel = model;
    return model;
  })();
  try {
    return await g._nsfwLoading;
  } finally {
    g._nsfwLoading = undefined;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ModerationVerdict {
  /** Max probability across {Porn, Sexy, Hentai}. 0..1. */
  nsfw_score: number;
  /** Full classifier output, for storage + future analysis. */
  categories: Prediction[];
  /** Convenience flag — true when score >= NSFW_HARD_BLOCK_THRESHOLD. */
  hardBlocked: boolean;
  /** Mapped status string for the DB column. */
  status: "clean" | "flagged" | "blocked";
}

/**
 * Classify an image buffer and return a moderation verdict.
 *
 * If `hardBlocked` is true the caller MUST refuse the upload — do not persist
 * the file to R2/disk and do not insert an image row. `status === 'blocked'`
 * in that case is informational only (we never store rejected images).
 *
 * On classifier failure (model load error, image decode failure, etc.) this
 * function does NOT throw — it returns a "fail-open" verdict with status
 * 'flagged' and score 0. Refusing uploads because the moderation pipeline is
 * broken would degrade UX worse than letting an unscored image through with
 * a flag for review. The error is logged for ops visibility.
 */
export async function classifyImage(buffer: Buffer): Promise<ModerationVerdict> {
  try {
    const model = await getModel();

    // Decode → raw RGB pixels at the model's expected input size (224x224 for
    // MobileNetV2). Sharp handles JPEG/PNG/WEBP/GIF transparently and gives
    // us a flat Uint8 buffer ordered [r,g,b,r,g,b,...].
    const { data, info } = await sharp(buffer)
      .resize(224, 224, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // tf.tensor3d wants a Float32Array in [height, width, channels] shape.
    // We could pass a Uint8Array but the model normalises to floats anyway.
    const pixels = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) pixels[i] = data[i];
    const tensor = tf.tensor3d(pixels, [info.height, info.width, 3]);

    let predictions: Prediction[];
    try {
      predictions = await model.classify(tensor);
    } finally {
      tensor.dispose();
    }

    let score = 0;
    for (const p of predictions) {
      if (NSFW_CATEGORIES.has(p.className) && p.probability > score) {
        score = p.probability;
      }
    }

    const hardBlocked = score >= NSFW_HARD_BLOCK_THRESHOLD;
    const status: ModerationVerdict["status"] = hardBlocked
      ? "blocked"
      : score >= NSFW_FLAG_THRESHOLD
      ? "flagged"
      : "clean";

    return {
      nsfw_score: score,
      categories: predictions,
      hardBlocked,
      status,
    };
  } catch (err) {
    console.error("[moderation] classifyImage failed, failing open:", err);
    return {
      nsfw_score: 0,
      categories: [],
      hardBlocked: false,
      status: "flagged",
    };
  }
}
