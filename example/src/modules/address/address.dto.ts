// address.dto.ts
// Request schemas of the address module (static, Elysia validates them), their types and the reply view.
// Field names are camelCase.

import { t } from "elysia";
import { idParamsSchema, searchFields, type Static } from "shared-lib-pg";

export class AddressDto {
  static readonly SaveSchema = t.Object({
    id: t.Optional(t.String()),
    address: t.String(),
    area: t.Optional(t.String()),
    city: t.Optional(t.String()),
    state: t.Optional(t.String()),
    country: t.Optional(t.String()),
    zipCode: t.Optional(t.String()),
    type: t.String(),
    lat: t.Optional(t.Number()),
    lng: t.Optional(t.Number()),
  });

  static readonly SearchSchema = t.Object({
    ...searchFields,
    type: t.Optional(t.String()),
    zipCode: t.Optional(t.String()),
    area: t.Optional(t.String()),
    city: t.Optional(t.String()),
    state: t.Optional(t.String()),
    country: t.Optional(t.String()),
  });

  static readonly IdParamsSchema = idParamsSchema;
}

export type AddressSaveDto = Static<typeof AddressDto.SaveSchema>;

export type AddressSearchDto = Static<typeof AddressDto.SearchSchema>;

export type AddressIdParams = Static<typeof AddressDto.IdParamsSchema>;

/** Reply view of an address (AddressMapper.ToView): camelCase, the same field names as the request DTO. */
export type AddressView = {
  id: string;
  address: string;
  area: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  type: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};
