// user.service.ts
// Business logic of users: validation, unique e-mail, transactions and the order of the steps.
//   queries     -> UserRepository (given in the constructor)
//   conversions -> UserMapper (static)
//   audit trail -> AuditLogService (given in the constructor), in the same transaction
// Returns views and throws AppError(code) for expected failures; never builds a ResponseType.

import { RegExp as DffRegExp } from "dff-util";
import { AppError, logger, readText, session_user, type ITransaction, type SearchPage } from "shared-lib-pg";
import type { AuditLogService } from "../audit-log/audit-log.service.ts";
import type { UserSaveDto, UserSearchDto, UserView } from "./user.dto.ts";
import { UserMapper, type UserValues } from "./user.mapper.ts";
import type { UserRepository } from "./user.repository.ts";

/** Entity name in the audit trail. */
const AUDIT_ENTITY = "user";

export class UserService {
  private readonly repository: UserRepository;

  private readonly auditLogService: AuditLogService;

  constructor(repository: UserRepository, auditLogService: AuditLogService) {
    this.repository = repository;
    this.auditLogService = auditLogService;
  }

  /** One user by id, or null. */
  async EntityByIdService(id: string): Promise<UserView | null> {
    const entity = await this.repository.FindById(id);
    return entity === undefined ? null : UserMapper.ToView(entity);
  }

  /** Error code of an invalid user, or null. */
  SaveValidation(dto: UserSaveDto): string | null {
    const name = readText(dto.name);
    if (name === "") {
      return "INVALID_USER_NAME";
    }
    const email = readText(dto.email);
    const isEmail = DffRegExp.EMAIL.test(email);
    if (!isEmail) {
      return "INVALID_USER_EMAIL";
    }
    return null;
  }

  /** The writes of a save, all on one transaction: unique e-mail check, the user, then its audit entry. */
  async SaveInTransaction(values: UserValues, transaction: ITransaction): Promise<UserView> {
    const sameEmail = await this.repository.FindByEmail(values.email, transaction);
    if (sameEmail !== undefined && sameEmail.id !== values.id) {
      throw new AppError("USER_EMAIL_EXISTS");
    }
    const existing = await this.repository.FindById(values.id, transaction);
    const isNew = existing === undefined;
    const sessionUser = session_user();
    const entity = UserMapper.ToEntity(values, existing, sessionUser.id);
    const saved = isNew ? await this.repository.Create(entity, transaction) : await this.repository.UpdateById(entity.id, entity, transaction);
    if (saved === undefined) {
      throw new AppError("USER_NOT_FOUND");
    }
    const view = UserMapper.ToView(saved);
    const action = isNew ? "CREATE" : "UPDATE";
    await this.auditLogService.RecordService(AUDIT_ENTITY, view.id, action, view, transaction);
    const requestLogger = logger();
    requestLogger.info("Saved user", { id: view.id, isNew, email: view.email });
    return view;
  }

  /** Creates or updates a user with its audit entry: both are saved, or neither. */
  async SaveService(dto: UserSaveDto): Promise<UserView> {
    const invalidCode = this.SaveValidation(dto);
    if (invalidCode !== null) {
      throw new AppError(invalidCode);
    }
    const values = UserMapper.FromDto(dto);
    const transaction = await this.repository.Begin();
    try {
      const view = await this.SaveInTransaction(values, transaction);
      await transaction.commit();
      return view;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** One page of users. */
  async SearchService(input: UserSearchDto): Promise<SearchPage<UserView>> {
    const page = await this.repository.Search(input);
    return UserMapper.ToViewPage(page);
  }
}
