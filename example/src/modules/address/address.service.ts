// address.service.ts
// Business logic of addresses: validation, transactions and the order of the steps.
//   queries     -> AddressRepository (given in the constructor)
//   conversions -> AddressMapper (static)
//   audit trail -> AuditLogService (given in the constructor), in the same transaction
// Returns views and throws AppError(code) for expected failures; never builds a ResponseType.

import { AppError, readLogger, readSessionUser, readText, type ITransaction, type SearchPage } from "shared-bun-elysia";
import type { AuditLogService } from "../audit-log/audit-log.service.ts";
import type { AddressSaveDto, AddressSearchDto, AddressView } from "./address.dto.ts";
import { AddressMapper, type AddressValues } from "./address.mapper.ts";
import type { AddressRepository } from "./address.repository.ts";

/** Entity name in the audit trail. */
const AUDIT_ENTITY = "address";

export class AddressService {
  private readonly repository: AddressRepository;

  private readonly auditLogService: AuditLogService;

  constructor(repository: AddressRepository, auditLogService: AuditLogService) {
    this.repository = repository;
    this.auditLogService = auditLogService;
  }

  /** One address by id, or null. */
  async EntityByIdService(id: string): Promise<AddressView | null> {
    const entity = await this.repository.FindById(id);
    return entity === undefined ? null : AddressMapper.ToView(entity);
  }

  /** Error code of an invalid address, or null. */
  SaveValidation(dto: AddressSaveDto): string | null {
    const address = readText(dto.address);
    if (address === "") {
      return "INVALID_ADDRESS";
    }
    const type = readText(dto.type);
    if (type === "") {
      return "INVALID_ADDRESS_TYPE";
    }
    return null;
  }

  /** The writes of a save, all on one transaction: the address, then its audit entry. */
  async SaveInTransaction(values: AddressValues, transaction: ITransaction): Promise<AddressView> {
    const existing = await this.repository.FindById(values.id, transaction);
    const isNew = existing === undefined;
    const sessionUser = readSessionUser();
    const entity = AddressMapper.ToEntity(values, existing, sessionUser.id);
    const saved = isNew ? await this.repository.Create(entity, transaction) : await this.repository.UpdateById(entity.id, entity, transaction);
    if (saved === undefined) {
      throw new AppError("ADDRESS_NOT_FOUND");
    }
    const view = AddressMapper.ToView(saved);
    const action = isNew ? "CREATE" : "UPDATE";
    await this.auditLogService.RecordService(AUDIT_ENTITY, view.id, action, view, transaction);
    const logger = readLogger();
    logger.info("Saved address", { id: view.id, isNew });
    return view;
  }

  /** Creates or updates an address with its audit entry: both are saved, or neither. */
  async SaveService(dto: AddressSaveDto): Promise<AddressView> {
    const invalidCode = this.SaveValidation(dto);
    if (invalidCode !== null) {
      throw new AppError(invalidCode);
    }
    const values = AddressMapper.FromDto(dto);
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

  /** One page of addresses. */
  async SearchService(input: AddressSearchDto): Promise<SearchPage<AddressView>> {
    const page = await this.repository.Search(input);
    return AddressMapper.ToViewPage(page);
  }
}
