# Develop your AgentsInTheCloud fork inside itself

This guide is for a Pi session running on the host machine where the official AgentsInTheCloud is already installed.

Keep the official installation as a recovery console. Run your fork inside one of its workspaces, then use agents inside the fork to edit the checkout that its development server watches.

**Status:** this is a source-informed setup procedure, not an end-to-end verified deployment. Verify the reload and session-recovery checks below before relying on it for important work. Your installed official version may differ from this fork.

## The arrangement

```text
Host machine / host-side Pi
└── Official AgentsInTheCloud (leave this running)
    └── Outer workspace: fork-dev-host
        ├── /work: bootstrap clone of your fork
        ├── Separate development-instance data directory
        ├── Watched development server on port 3000
        └── Inner workspace: self-development
            └── /work: live clone of your fork
                ↑
                The development server runs from this clone's
                backing directory in the outer workspace.
```

The crucial trick is the last step: the inner workspace's `/work` is a bind mount. Its backing directory is also accessible to the development server in the outer workspace. Both processes can therefore use **the same files**, without a push/pull loop or a new checkout-sharing feature.

This is a trusted development setup. Do not run untrusted agents here. Anyone who can edit this checkout can change the application you are running.

## 1. Create the outer workspace

In the official app:

1. Add your fork as a repository, for example `https://github.com/larryhudson/agentsinthecloud.git`.
2. Create a workspace from it and name it `fork-dev-host`.
3. Open its Terminal view.

The commands in subsequent sections run **inside this outer workspace**, not directly on the host, unless explicitly marked otherwise. Its private Docker daemon will manage the fork's inner workspaces. Do not point the fork at the official installation's Docker daemon or data directory.

Check prerequisites:

```sh
cd /work
bun --version
git status --short
docker info
tmux -V
bun install
bun run generate:workspace-modules
```

Resolve any failures before proceeding. The initial workspace-image preparation can take a while and needs free disk space.

### Giving host-side Pi access

You can use the official app's Terminal view for all of this. If you want your host-side Pi to execute the commands, first inspect the installation from the host:

```sh
# HOST: inspect; do not stop or replace anything.
docker ps --format 'table {{.Names}}\t{{.Image}}'
```

For the current System-managed installation, workspaces live in the System container's Docker daemon, not the host daemon:

```sh
# HOST: use the actual System container name if different.
SYSTEM=agents-in-the-cloud-system
docker exec "$SYSTEM" docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}'
```

Identify the outer workspace container through its name/labels and inspect it to confirm that its `/work` mount corresponds to the intended workspace. Do not guess based only on its position in the list.

```sh
# HOST: replace this with the confirmed outer container ID/name.
OUTER='<outer-workspace-container>'
docker exec "$SYSTEM" docker inspect "$OUTER"

# Helper for non-interactive commands issued by host-side Pi.
outer() {
  docker exec "$SYSTEM" docker exec --user agents-in-the-cloud "$OUTER" "$@"
}

outer bash -lc 'cd /work && git remote -v && docker info'
```

For example, Pi can run an outer-workspace shell command with `outer bash -lc '...'`. This helper exists only in the shell where you define it; redefine it in later shell invocations if necessary. Use the existing installation's required Docker permissions; do not change socket permissions to bypass an access error.

If your installation does not have this System layout, use the Terminal view or have Pi inspect the actual layout before adapting these commands.

## 2. Bootstrap the fork

In the **outer workspace**, reserve a separate data directory and start a watched server:

```sh
mkdir -p /persistent/fork-dev-state

tmux new-session -d -s fork-dev -c /work \
  'env ATELIER_DATA_DIR=/persistent/fork-dev-state HOST=127.0.0.1 PORT=3000 bun run web'

tmux attach-session -t fork-dev
```

Detach with **Ctrl-B, then D**. These are existing runtime settings, not new configuration features. Keep this same data directory and port throughout the guide.

The `ATELIER_` prefix is the existing spelling used in the source. Do not use the official installation's data path. `/persistent` survives deletion of a particular outer workspace, but the nested Docker store does not; retaining this directory alone is **not** a complete backup of the inner installation.

Wait for asset preparation and server startup. Inspect failures in the tmux session rather than working around them blindly.

In the official app, open a **Browser** view for port **3000** in `fork-dev-host`. You should now see your fork. Port 3000 here is inside the workspace and does not replace the official host listener. Do not use reserved ports 2999 or 24800.

Complete onboarding/settings as needed. Nested instances receive model-provider credentials from the outer app; verify that a model is available rather than copying secrets into scripts. Configure GitHub access and commit identity if the inner instance needs them.

## 3. Create the live development workspace inside your fork

In the **fork's UI**:

1. Add your fork repository.
2. Create a workspace named `self-development`.
3. Open its Terminal view and run:

```sh
cd /work
git remote -v
bun install
bun run generate:workspace-modules
```

Do not start another web server in the inner workspace. We want the server to remain in the outer workspace, independent of the agent that edits its files.

Use a dedicated development branch, and keep only one agent editing the live checkout initially.

## 4. Point the watched server at that exact checkout

Back in the **outer workspace's Terminal**, list the inner containers:

```sh
docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}'
```

Find and inspect the `self-development` workspace container. Then discover its `/work` bind mount:

```sh
INNER='<confirmed-inner-workspace-container>'

docker inspect "$INNER" --format \
  '{{range .Mounts}}{{if eq .Destination "/work"}}{{.Type}} {{.Source}}{{end}}{{end}}'
```

The output must identify a **bind** mount. Take its source path and verify that it is accessible in the outer workspace:

```sh
LIVE_CHECKOUT='<source-path-from-the-inspection>'

test -d "$LIVE_CHECKOUT/.git"
git -C "$LIVE_CHECKOUT" remote -v
git -C "$LIVE_CHECKOUT" status --short
```

Prove that these are the same files before switching servers:

```sh
# OUTER workspace:
printf 'shared-checkout\n' > "$LIVE_CHECKOUT/.fork-checkout-probe"
docker exec "$INNER" sh -lc 'cat /work/.fork-checkout-probe'
rm "$LIVE_CHECKOUT/.fork-checkout-probe"
```

If the path is not accessible or the probe fails, stop here. Docker mount sources are resolved in the daemon's filesystem; do not assume a path works across different Docker daemons. In the intended setup, the fork uses the outer workspace's local nested daemon, so the source is accessible there.

Now move the server from the bootstrap clone to the live clone:

```sh
cd "$LIVE_CHECKOUT"
bun install
bun run generate:workspace-modules

# Stops only the development-server tmux session.
# The official installation remains untouched.
tmux kill-session -t fork-dev

tmux new-session -d -s fork-dev -c "$LIVE_CHECKOUT" \
  'env ATELIER_DATA_DIR=/persistent/fork-dev-state HOST=127.0.0.1 PORT=3000 bun run web'

tmux attach-session -t fork-dev
```

The fork should return at the same Browser URL with the same inner workspace and settings because its data directory has not changed.

**Do not delete or park `self-development`: its backing checkout is now the server's source directory.** Do not delete or park the outer workspace while using the fork either.

## 5. Verify the self-editing loop

Use a Pi agent **inside the fork's `self-development` workspace**. Host-side Pi remains your recovery operator.

Start with a small, reversible UI change. Tell the inner agent:

> This workspace's /work is the live source checkout of the AgentsInTheCloud development server I am using. Make one small reversible UI change. Do not start another server, delete this workspace, change its Docker mounts, or alter installation data. Follow AGENTS.md. Explain what will reload before editing.

Watch the outer tmux logs and verify that the change appears in the fork's Browser view.

Then separately verify:

- A client/CSS change rebuilds assets and reloads the page.
- A server change restarts the server and the UI reconnects.
- An idle Pi session remains available after that restart.
- A disposable running agent session behaves acceptably across a restart; check its transcript and actual process state, not just the UI.

Do not assume uninterrupted active inference. The watcher kills and replaces the web-server process; recovery of every agent type and in-flight operation is not established by this guide. If an active session does not recover cleanly, stop agents before server-affecting edits and use host-side Pi to apply those edits.

### What reloads automatically?

| Change | Expected behavior |
| --- | --- |
| Client code and watched assets | Asset rebuild, then browser reload |
| Server source | Web-server process restart, then browser reload |
| Shared package runtime code | Full asset rebuild and server restart |
| Workspace-image inputs | Image preparation; existing containers are not automatically upgraded |
| Dependencies, generated module registration, watcher/startup configuration | May require regeneration, installation, or a manual restart |

This is watched development with reload/restart, not seamless hot replacement of every running component.

## 6. Everyday workflow and recovery

Before a risky change, commit a known-good checkpoint. Keep the official app and the outer Terminal view available in another tab.

If the fork breaks, host-side Pi or the outer Terminal can still repair the live checkout:

```sh
# OUTER workspace; LIVE_CHECKOUT is the path established above.
git -C "$LIVE_CHECKOUT" status --short
git -C "$LIVE_CHECKOUT" diff
tmux capture-pane -p -S -150 -t fork-dev
```

Revert only the offending edits, preserving unrelated work. Do not use `git reset --hard` as a generic recovery command.

For dependency or module changes:

```sh
cd "$LIVE_CHECKOUT"
bun install
bun run generate:workspace-modules
bun run check
```

If needed, restart only `fork-dev` using the same command from section 4. Restarting the watcher is necessary when its own implementation changes.

Commit and push regularly. Do not use a workflow that deletes the live development workspace after pushing. Before eventually removing the outer workspace, save source changes and any inner workspace data you need; `/persistent` does not preserve the outer workspace's private Docker store.

## Copy this task into your host-side Pi session

> Help me set up my AgentsInTheCloud fork for self-development using docs/develop-your-fork-inside-itself.md. The official installation must remain untouched and usable as a recovery console. Inspect the actual installation and Docker topology first. Bootstrap the fork inside an official workspace with a separate data directory, create an inner fork workspace, then run the outer watched server from that inner workspace's confirmed /work backing bind mount. Prove checkout sharing before switching. Verify UI reload and agent-session behavior across server restarts. Do not uninstall, replace images, expose public listeners, delete workspaces, or discard uncommitted changes. Ask me to perform UI steps when you cannot safely automate them.
