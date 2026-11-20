// address.controller.ts
// HTTP routes of the address module, registered by AddressModule on the module's Elysia instance:
//   POST /address-save         SaveAddress
//   POST /address-search       SearchAddresses
//   GET  /address-entity/:id   EntityByIdAddress
// Handlers stay thin: no try / catch (appPlugin turns AppError and other errors into replies).

import type { Elysia } from "elysia";
import { LISTED_SUCCESSFULLY, SAVED_SUCCESSFULLY, type ResponseType } from "shared-lib-pg";
import { AddressDto, type AddressIdParams, type AddressSaveDto, type AddressSearchDto } from "./address.dto.ts";
import type { AddressService } from "./address.service.ts";

export class AddressController {
  private readonly service: AddressService;

  constructor(service: AddressService) {
    this.service = service;
  }

  /** POST /address-save — create or update an address. */
  async SaveAddress(context: { body: AddressSaveDto }): Promise<ResponseType> {
    const data = await this.service.SaveService(context.body);
    return { data, status: SAVED_SUCCESSFULLY };
  }

  /** POST /address-search — page of addresses. */
  async SearchAddresses(context: { body: AddressSearchDto }): Promise<ResponseType> {
    const page = await this.service.SearchService(context.body);
    return { ...page, status: LISTED_SUCCESSFULLY };
  }

  /** GET /address-entity/:id — one address. */
  async EntityByIdAddress(context: { params: AddressIdParams }): Promise<ResponseType> {
    const data = await this.service.EntityByIdService(context.params.id);
    return { data };
  }

  /** Adds the routes of this controller to the module's Elysia instance. */
  register(app: Elysia): void {
    const saveAddress = this.SaveAddress.bind(this);
    const searchAddresses = this.SearchAddresses.bind(this);
    const entityByIdAddress = this.EntityByIdAddress.bind(this);
    app.post("/address-save", { body: AddressDto.SaveSchema }, saveAddress);
    app.post("/address-search", { body: AddressDto.SearchSchema }, searchAddresses);
    app.get("/address-entity/:id", { params: AddressDto.IdParamsSchema }, entityByIdAddress);
  }
}
