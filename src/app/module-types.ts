// module-types.ts
// A module of a service: one class that builds its own repository -> service -> controller in its constructor
// and registers the controller's routes. The module gives the controller its own Elysia instance (with the module's
// plugins, e.g. database.tenantPlugin()) and adds it to the app, so plugins stay inside the module:
//   export class UserModule implements IModule {
//     private readonly controller: UserController;
//     constructor(database: Database) { ... this.controller = new UserController(service); }
//     register(app: AnyElysia): void {
//       const routes = new Elysia({ name: "user-routes" });
//       routes.use(tenantDb);
//       this.controller.register(routes);        // controller: register(app: Elysia) -> app.post(...)
//       app.use(routes);
//     }
//   }
// The config lists the modules: { name: "user", module: UserModule }; Application creates and registers them.

import type { AnyElysia } from "elysia";
import type { Database } from "../db/database.ts";

export interface IModule {
  register(app: AnyElysia): void;
}

/** A module class: new UserModule(database). */
export type ModuleClass = new (database: Database) => IModule;

export type ModuleDefinition = {
  /** Name in logs and in config disabledModules. */
  name: string;
  module: ModuleClass;
  /** false = not registered (default true). */
  isEnabled?: boolean;
};

/** True when a module is registered: not isEnabled === false and not in disabledModules. */
export function isModuleEnabled(definition: ModuleDefinition, disabledModules: string[]): boolean {
  if (definition.isEnabled === false) {
    return false;
  }
  return !disabledModules.includes(definition.name);
}
