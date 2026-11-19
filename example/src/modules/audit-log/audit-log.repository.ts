// audit-log.repository.ts
// Database access of the audit trail (Drizzle), built with the Database of the service.
// FindById / Create / UpdateById / DeleteById / SearchRows / Begin come from DrizzleRepository;
// every method takes an optional transaction last.

import { eq, type AnyColumn, type SQL } from "drizzle-orm";
import { DrizzleRepository, buildSearchWhere, readText, type Database, type ITransaction, type SearchPage } from "shared-bun-elysia";
import type { AuditLogSearchDto } from "./audit-log.dto.ts";
import { auditLogEntity, type AuditLogEntity } from "./audit-log.entity.ts";

const SEARCH_TERM_KEYS = ["entity", "entity_id", "action", "created_by"];

/** "column = value", or undefined for an empty value. */
function equalsCond(column: AnyColumn, value: string | undefined): SQL | undefined {
  const text = readText(value);
  return text === "" ? undefined : eq(column, text);
}

export class AuditLogRepository extends DrizzleRepository<typeof auditLogEntity> {
  constructor(database: Database) {
    super(database, auditLogEntity);
  }

  /** WHERE of a search: searchTerm + exact entity / entityId / action. */
  BuildSearchWhere(input: AuditLogSearchDto): SQL | undefined {
    const fieldConds = [
      equalsCond(auditLogEntity.entity, input.entity),
      equalsCond(auditLogEntity.entity_id, input.entityId),
      equalsCond(auditLogEntity.action, input.action),
    ];
    return buildSearchWhere(auditLogEntity, input, SEARCH_TERM_KEYS, fieldConds);
  }

  /** One page of audit entities, newest first. */
  async Search(input: AuditLogSearchDto, transaction?: ITransaction): Promise<SearchPage<AuditLogEntity>> {
    const where = this.BuildSearchWhere(input);
    return this.SearchRows(input, where, transaction);
  }
}
