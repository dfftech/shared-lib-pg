// user.dto.ts
// Request schemas of the user module (static, Elysia validates them), their types and the reply view.

import { t } from "elysia";
import { idParamsSchema, searchFields, type Static } from "shared-lib-pg";

export class UserDto {
  static readonly SaveSchema = t.Object({
    id: t.Optional(t.String()),
    name: t.String(),
    email: t.String(),
    mobile: t.Optional(t.String()),
    persona: t.Optional(t.Union([t.Literal("admin"), t.Literal("staff"), t.Literal("user")])),
    active: t.Optional(t.Boolean()),
  });

  static readonly SearchSchema = t.Object({
    ...searchFields,
    email: t.Optional(t.String()),
    persona: t.Optional(t.String()),
  });

  static readonly IdParamsSchema = idParamsSchema;
}

export type UserSaveDto = Static<typeof UserDto.SaveSchema>;

export type UserSearchDto = Static<typeof UserDto.SearchSchema>;

export type UserIdParams = Static<typeof UserDto.IdParamsSchema>;

/** Reply view of a user (UserMapper.ToView). */
export type UserView = {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  persona: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};
