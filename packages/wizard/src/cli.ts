import process from "node:process";
import { runCli } from "./main";

process.exitCode = await runCli(process.argv.slice(2));
