// address.repository.ts
// Database access of the address module (Drizzle), built with the Database of the service.
// FindById / Create / UpdateById / DeleteById / SearchRows / Begin come from DrizzleRepository;
// every method takes an optional transaction last.

import { ilike, type AnyColumn, type SQL } from "drizzle-orm";
import { DrizzleRepository, buildSearchWhere, readText, type Database, type ITransaction, type SearchPage } from "shared-lib-pg";
import type { AddressSearchDto } from "./address.dto.ts";
import { addressEntity, type AddressEntity } from "./address.entity.ts";

const SEARCH_TERM_KEYS = ["address", "area", "city", "state", "country", "zipcode", "type"];

/** "column ILIKE %value%", or undefined for an empty value. */
function containsCond(column: AnyColumn, value: string | undefined): SQL | undefined {
  const text = readText(value);
  return text === "" ? undefined : ilike(column, `%${text}%`);
}

export class AddressRepository extends DrizzleRepository<typeof addressEntity> {
  constructor(database: Database) {
    super(database, addressEntity);
  }

  /** WHERE of a search: searchTerm over the text columns + one "contains" per field. */
  BuildSearchWhere(input: AddressSearchDto): SQL | undefined {
    const fieldConds = [
      containsCond(addressEntity.type, input.type),
      containsCond(addressEntity.zipcode, input.zipCode),
      containsCond(addressEntity.area, input.area),
      containsCond(addressEntity.city, input.city),
      containsCond(addressEntity.state, input.state),
      containsCond(addressEntity.country, input.country),
    ];
    return buildSearchWhere(addressEntity, input, SEARCH_TERM_KEYS, fieldConds);
  }

  /** One page of address entities. */
  async Search(input: AddressSearchDto, transaction?: ITransaction): Promise<SearchPage<AddressEntity>> {
    const where = this.BuildSearchWhere(input);
    return this.SearchRows(input, where, transaction);
  }
}
