import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspaceTemplateRoutes } from "../../../apps/web/src/server/workspace-template-routes.ts";
import { addWorkspaceTemplate, getWorkspaceTemplateConfiguration } from "../src/workspace-template.ts";

test("internal hosts API saves exact host names and rejects patterns without mutation", async () => {
  const previous = process.env.ATELIER_DATA_DIR;
  const dir = await mkdtemp(join(tmpdir(), "workspace-template-internal-hosts-api-"));
  process.env.ATELIER_DATA_DIR = dir;
  try {
    const { workspaceTemplate } = await addWorkspaceTemplate("/tmp/example");
    const routes = createWorkspaceTemplateRoutes({ referencingWorkspaces: () => [], invalidatePresentation: () => {}, createAgentWorkspace: async () => new Response() });
    const url = new URL(`http://localhost/workspace-templates/${workspaceTemplate.id}/internal-hosts`);
    const request = (internalHosts: string | (string | number)[] | null) => new Request(url, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ internalHosts }),
    });
    const response = await routes.handle(request(["Gitea.Local", "gitea.local"]), url);
    expect(response!.status).toBe(200);
    expect((await response!.json()).workspaceTemplate.internalHosts).toEqual(["gitea.local"]);
    for (const invalid of [null, "gitea.local", [42], ["*.local"], ["gitea.local:443"], ["https://gitea.local"]]) {
      await expect(routes.handle(request(invalid), url)).rejects.toThrow();
    }
    expect((await getWorkspaceTemplateConfiguration(workspaceTemplate.id)).internalHosts).toEqual(["gitea.local"]);
  } finally {
    if (previous === undefined) delete process.env.ATELIER_DATA_DIR;
    else process.env.ATELIER_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
