import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createDemoServer } from "./server";

/** Connects an MCP client to the demo server in-process (used by the UI and tests). */
export async function connectDemoClient(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createDemoServer().connect(serverSide);
  const client = new Client({ name: "toolcargo-demo-ui", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}
