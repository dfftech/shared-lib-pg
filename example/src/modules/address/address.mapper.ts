// address.mapper.ts
// Conversions of the address module (static and pure: no database, no request context; the service passes the user id).
//   request DTO -> row values               FromDto
//   row values  -> entity + audit columns   ToEntity
//   entity      -> reply view (camelCase)   ToView, ToViewList, ToViewPage

import { randomUUID } from "node:crypto";
import {
  buildAuditColumns,
  readOptionalNumber,
  readOptionalText,
  readText,
  type AuditColumns,
  type SearchPage,
} from "shared-bun-elysia";
import type { AddressSaveDto, AddressView } from "./address.dto.ts";
import type { AddressEntity } from "./address.entity.ts";

/** Row values of an address without the audit columns. */
export type AddressValues = Omit<AddressEntity, keyof AuditColumns>;

export class AddressMapper {
  /** Row values of a request DTO (trimmed, empty -> null, new id when none). */
  static FromDto(dto: AddressSaveDto): AddressValues {
    return {
      id: readOptionalText(dto.id) ?? randomUUID(),
      address: readText(dto.address),
      area: readOptionalText(dto.area),
      city: readOptionalText(dto.city),
      state: readOptionalText(dto.state),
      country: readOptionalText(dto.country),
      zipcode: readOptionalText(dto.zipCode),
      type: readText(dto.type),
      lat: readOptionalNumber(dto.lat),
      lng: readOptionalNumber(dto.lng),
    };
  }

  /** Entity to store: the values + audit columns (an existing row keeps its created_*). */
  static ToEntity(values: AddressValues, existing: AddressEntity | undefined, userId: string): AddressEntity {
    const auditColumns = buildAuditColumns(existing, userId);
    return { ...values, ...auditColumns };
  }

  /** Reply view of a stored address. */
  static ToView(entity: AddressEntity): AddressView {
    return {
      id: entity.id,
      address: entity.address,
      area: entity.area,
      city: entity.city,
      state: entity.state,
      country: entity.country,
      zipCode: entity.zipcode,
      type: entity.type,
      lat: entity.lat,
      lng: entity.lng,
      createdAt: entity.created_at.toISOString(),
      createdBy: entity.created_by,
      updatedAt: entity.updated_at.toISOString(),
      updatedBy: entity.updated_by,
    };
  }

  /** Reply views of a list of addresses. */
  static ToViewList(entities: AddressEntity[]): AddressView[] {
    const views: AddressView[] = [];
    for (const entity of entities) {
      const view = this.ToView(entity);
      views.push(view);
    }
    return views;
  }

  /** Search page with reply views. */
  static ToViewPage(page: SearchPage<AddressEntity>): SearchPage<AddressView> {
    const data = this.ToViewList(page.data);
    return { ...page, data };
  }
}
