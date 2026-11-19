// search-schema.ts
// Elysia (TypeBox) schema fields of dff-util SearchType for search routes:
//   export const addressSearchSchema = t.Object({ ...searchFields, city: t.Optional(t.String()) });
//   export type AddressSearchDto = Static<typeof addressSearchSchema>;

import { t } from "elysia";
import type { Static } from "typebox";

export const searchFields = {
  limit: t.Optional(t.Number({ minimum: 0 })),
  skip: t.Optional(t.Number({ minimum: 0 })),
  orderBy: t.Optional(t.String()),
  order: t.Optional(t.Union([t.Literal("ASC"), t.Literal("DESC")])),
  searchTerm: t.Optional(t.String()),
  active: t.Optional(t.Boolean()),
  filters: t.Optional(t.String()),
};

export const searchSchema = t.Object(searchFields);

export type SearchDto = Static<typeof searchSchema>;

/** Path param schema of /{module}-entity/:id. */
export const idParamsSchema = t.Object({ id: t.String({ minLength: 1 }) });

export type IdParams = Static<typeof idParamsSchema>;
