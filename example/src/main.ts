// main.ts
// Starts the example service: Kafka logs -> database (multi-tenant detect, tenant pools) -> modules -> HTTP.
//   cd example && cp .env.example .env && bun run dev

import { Application } from "shared-bun-elysia";
import { appConfig } from "./config.ts";

const application = new Application(appConfig);

await application.start();
