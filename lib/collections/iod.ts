import type { CollectionConfig } from "./types";

export const iodConfig: CollectionConfig = {
  label: "item-of-distinction",
  table: "items_of_distinction",
  alias: "i",
  imagesTable: "iod_images",
  imageFkColumn: "iod_id",
  valuationsTable: "iod_valuations",
  valuationFkColumn: "iod_id",
  validCategories: ["fine-art", "memorabilia", "collectibles", "jewelry", "other"],
  fields: [
    { name: "item_type", trim: true },
    { name: "brand", trim: true },
    { name: "short_description", required: true, trim: true },
    { name: "long_description", trim: true },
    { name: "year" },
    { name: "condition" },
    { name: "purchase_price" },
    { name: "purchase_date" },
    { name: "purchase_source", trim: true },
    { name: "provenance", trim: true },
    { name: "notes", trim: true },
    { name: "insure", type: "boolean" },
  ],
  conditionRequired: false,
  patchSetUpdatedAt: true,
  forceDynamic: true,
};
