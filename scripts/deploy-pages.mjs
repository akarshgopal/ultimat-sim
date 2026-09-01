import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const ORIGIN = execSync("git remote get-url origin", {
  cwd: ROOT,
  encoding: "utf8",
}).trim();

if (!ORIGIN.includes("akarshgopal/ultimat-sim")) {
  throw new Error(
    `Refusing to deploy: origin does not include 'akarshgopal/ultimat-sim' (${ORIGIN})`,
  );
}

execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
await fs.writeFile(path.join(DIST, ".nojekyll"), "");

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ultimat-sim-pages-"));

try {
  for (const name of await fs.readdir(DIST)) {
    await fs.cp(path.join(DIST, name), path.join(tmpDir, name), { recursive: true });
  }

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "Akarsh Gopal",
    GIT_AUTHOR_EMAIL: "akarshgopal@users.noreply.github.com",
    GIT_COMMITTER_NAME: "Akarsh Gopal",
    GIT_COMMITTER_EMAIL: "akarshgopal@users.noreply.github.com",
  };

  execSync("git init -b gh-pages", { cwd: tmpDir, stdio: "inherit" });
  execSync("git add -A", { cwd: tmpDir, stdio: "inherit" });
  execSync("git commit -m 'Publish dist/ to GitHub Pages'", {
    cwd: tmpDir,
    stdio: "inherit",
    env: gitEnv,
  });
  execSync(`git remote add origin ${JSON.stringify(ORIGIN)}`, {
    cwd: tmpDir,
    stdio: "inherit",
  });
  execSync("git push -f origin gh-pages", { cwd: tmpDir, stdio: "inherit" });

  console.log("Published https://akarshgopal.github.io/ultimat-sim/");
} finally {
  await fs.rm(tmpDir, { recursive: true, force: true });
}
