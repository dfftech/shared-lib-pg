// user.repository.ts
// Database access of the user module (Drizzle), built with the Database of the service.
// FindById / Create / UpdateById / DeleteById / SearchRows / Begin come from DrizzleRepository;
// every method takes an optional transaction last.

import { eq, ilike, type SQL } from "drizzle-orm";
import { DrizzleRepository, buildSearchWhere, readText, type Database, type ITransaction, type SearchPage } from "shared-lib-pg";
import type { UserSearchDto } from "./user.dto.ts";
import { userEntity, type UserEntity } from "./user.entity.ts";

const SEARCH_TERM_KEYS = ["name", "email", "mobile"];

export class UserRepository extends DrizzleRepository<typeof userEntity> {
  constructor(database: Database) {
    super(database, userEntity);
  }

  /** The user with this e-mail (stored in lower case), if any. */
  async FindByEmail(email: string, transaction?: ITransaction): Promise<UserEntity | undefined> {
    const db = this.Db(transaction);
    const emailMatch = eq(userEntity.email, email);
    const rows = await db.select().from(userEntity).where(emailMatch).limit(1);
    return rows[0];
  }

  /** WHERE of a search: searchTerm over name / e-mail / mobile, "active", e-mail contains, exact persona. */
  BuildSearchWhere(input: UserSearchDto): SQL | undefined {
    const fieldConds: Array<SQL | undefined> = [];
    const email = readText(input.email);
    if (email !== "") {
      const emailCond = ilike(userEntity.email, `%${email}%`);
      fieldConds.push(emailCond);
    }
    const persona = readText(input.persona);
    if (persona !== "") {
      const personaCond = eq(userEntity.persona, persona);
      fieldConds.push(personaCond);
    }
    return buildSearchWhere(userEntity, input, SEARCH_TERM_KEYS, fieldConds);
  }

  /** One page of user entities. */
  async Search(input: UserSearchDto, transaction?: ITransaction): Promise<SearchPage<UserEntity>> {
    const where = this.BuildSearchWhere(input);
    return this.SearchRows(input, where, transaction);
  }
}
