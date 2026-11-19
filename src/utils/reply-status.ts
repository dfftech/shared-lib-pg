// reply-status.ts
// "status" texts of ResponseType replies used by the core stack (dff-util ConstKeys has SAVED_SUCCESSFULLY only).
//   return { data, status: SAVED_SUCCESSFULLY };   return { ...page, status: LISTED_SUCCESSFULLY };

import { ConstKeys } from "dff-util";

export const SAVED_SUCCESSFULLY = ConstKeys.SAVED_SUCCESSFULLY;

export const LISTED_SUCCESSFULLY = "LISTED_SUCCESSFULLY";

export const LOADED_SUCCESSFULLY = "LOADED_SUCCESSFULLY";

export const DELETED_SUCCESSFULLY = "DELETED_SUCCESSFULLY";
