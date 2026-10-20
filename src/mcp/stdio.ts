import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createDemoServer } from "./server";

await createDemoServer().connect(new StdioServerTransport());
