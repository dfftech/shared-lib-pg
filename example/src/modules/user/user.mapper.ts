// user.mapper.ts
// Conversions of the user module (static and pure: no database, no request context).
//   request DTO -> row values               FromDto
//   row values  -> entity + audit columns   ToEntity
//   entity      -> reply view (camelCase)   ToView, ToViewList, ToViewPage

import { randomUUID } from "node:crypto";
import { buildAuditColumns, readOptionalText, readText, type AuditColumns, type SearchPage } from "shared-bun-elysia";
import type { UserSaveDto, UserView } from "./user.dto.ts";
import type { UserEntity } from "./user.entity.ts";

/** Row values of a user without the audit columns. */
export type UserValues = Omit<UserEntity, keyof AuditColumns>;

export class UserMapper {
  /** Row values of a request DTO (trimmed, e-mail in lower case, new id when none). */
  static FromDto(dto: UserSaveDto): UserValues {
    const email = readText(dto.email);
    return {
      id: readOptionalText(dto.id) ?? randomUUID(),
      name: readText(dto.name),
      email: email.toLowerCase(),
      mobile: readOptionalText(dto.mobile),
      persona: dto.persona ?? "user",
      active: dto.active ?? true,
    };
  }

  /** Entity to store: the values + audit columns (an existing row keeps its created_*). */
  static ToEntity(values: UserValues, existing: UserEntity | undefined, userId: string): UserEntity {
    const auditColumns = buildAuditColumns(existing, userId);
    return { ...values, ...auditColumns };
  }

  /** Reply view of a stored user. */
  static ToView(entity: UserEntity): UserView {
    return {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      mobile: entity.mobile,
      persona: entity.persona,
      active: entity.active,
      createdAt: entity.created_at.toISOString(),
      createdBy: entity.created_by,
      updatedAt: entity.updated_at.toISOString(),
      updatedBy: entity.updated_by,
    };
  }

  /** Reply views of a list of users. */
  static ToViewList(entities: UserEntity[]): UserView[] {
    const views: UserView[] = [];
    for (const entity of entities) {
      const view = this.ToView(entity);
      views.push(view);
    }
    return views;
  }

  /** Search page with reply views. */
  static ToViewPage(page: SearchPage<UserEntity>): SearchPage<UserView> {
    const data = this.ToViewList(page.data);
    return { ...page, data };
  }
}
