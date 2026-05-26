#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { launch } from "./launcher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
launch(resolve(__dirname, "query.ts"), "pi-kit-query");
