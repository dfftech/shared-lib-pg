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
  toEntityMapper,
  toViewMapper,
  type AuditColumns,
  type SearchPage,
} from "shared-lib-pg";
import type { AddressSaveDto, AddressView } from "./address.dto.ts";
import type { AddressEntity } from "./address.entity.ts";

/** Address values in view/API casing, without the audit columns. */
export type AddressValues = Omit<AddressView, "createdAt" | "createdBy" | "updatedAt" | "updatedBy">;

type AddressEntityValues = Omit<AddressEntity, keyof AuditColumns>;

type MappedAddressValues = Omit<AddressEntityValues, "zipcode"> & { zip_code: AddressEntityValues["zipcode"] };

type MappedAddressView = Omit<AddressView, "zipCode" | "createdAt" | "updatedAt"> & {
  zipcode: AddressView["zipCode"];
  createdAt: Date;
  updatedAt: Date;
};

export class AddressMapper {
  /** Address values of a request DTO (trimmed, empty -> null, new id when none). */
  static FromDto(dto: AddressSaveDto): AddressValues {
    return {
      id: readOptionalText(dto.id) ?? randomUUID(),
      address: readText(dto.address),
      area: readOptionalText(dto.area),
      city: readOptionalText(dto.city),
      state: readOptionalText(dto.state),
      country: readOptionalText(dto.country),
      zipCode: readOptionalText(dto.zipCode),
      type: readText(dto.type),
      lat: readOptionalNumber(dto.lat),
      lng: readOptionalNumber(dto.lng),
    };
  }

  /** Entity to store: camelCase values converted to columns + audit fields. */
  static ToEntity(values: AddressValues, existing: AddressEntity | undefined, userId: string): AddressEntity {
    const mappedValues = toEntityMapper(values) as MappedAddressValues;
    const { zip_code: zipcode, ...entityValues } = mappedValues;
    const auditColumns = buildAuditColumns(existing, userId);
    return { ...entityValues, zipcode, ...auditColumns };
  }

  /** Reply view of a stored address, with DB keys converted to camelCase. */
  static ToView(entity: AddressEntity): AddressView {
    const mappedView = toViewMapper(entity) as MappedAddressView;
    const { zipcode, createdAt, updatedAt, ...view } = mappedView;
    return {
      ...view,
      zipCode: zipcode,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
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
