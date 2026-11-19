// user.controller.ts
// HTTP routes of the user module, registered by UserModule on the module's Elysia instance:
//   POST /user-save         SaveUser
//   POST /user-search       SearchUsers
//   GET  /user-entity/:id   EntityByIdUser
// Handlers stay thin: no try / catch (appPlugin turns AppError and other errors into replies).

import type { ResponseType } from "dff-util";
import type { Elysia } from "elysia";
import { LISTED_SUCCESSFULLY, SAVED_SUCCESSFULLY } from "shared-bun-elysia";
import { UserDto, type UserIdParams, type UserSaveDto, type UserSearchDto } from "./user.dto.ts";
import type { UserService } from "./user.service.ts";

export class UserController {
  private readonly service: UserService;

  constructor(service: UserService) {
    this.service = service;
  }

  /** POST /user-save — create or update a user. */
  async SaveUser(context: { body: UserSaveDto }): Promise<ResponseType> {
    const data = await this.service.SaveService(context.body);
    return { data, status: SAVED_SUCCESSFULLY };
  }

  /** POST /user-search — page of users. */
  async SearchUsers(context: { body: UserSearchDto }): Promise<ResponseType> {
    const page = await this.service.SearchService(context.body);
    return { ...page, status: LISTED_SUCCESSFULLY };
  }

  /** GET /user-entity/:id — one user. */
  async EntityByIdUser(context: { params: UserIdParams }): Promise<ResponseType> {
    const data = await this.service.EntityByIdService(context.params.id);
    return { data };
  }

  /** Adds the routes of this controller to the module's Elysia instance. */
  register(app: Elysia): void {
    const saveUser = this.SaveUser.bind(this);
    const searchUsers = this.SearchUsers.bind(this);
    const entityByIdUser = this.EntityByIdUser.bind(this);
    app.post("/user-save", { body: UserDto.SaveSchema }, saveUser);
    app.post("/user-search", { body: UserDto.SearchSchema }, searchUsers);
    app.get("/user-entity/:id", { params: UserDto.IdParamsSchema }, entityByIdUser);
  }
}
