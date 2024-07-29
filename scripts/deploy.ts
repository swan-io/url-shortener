import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { string, validate } from "valienv";

const tmp = os.tmpdir();
const repoName = "deploy";

const env = validate({
  env: process.env,
  validators: {
    TAG: string,
    DEPLOY_SWAN_TOKEN: string,
    DEPLOY_SWAN_REPOSITORY: string,
    DEPLOY_ENVIRONMENT: string,
    DEPLOY_APP_NAME: string,
    DEPLOY_GIT_USER: string,
    DEPLOY_GIT_EMAIL: string,
  },
});

execSync(`git config --global user.name ${env.DEPLOY_GIT_USER}`);
execSync(`git config --global user.email ${env.DEPLOY_GIT_EMAIL}`);

execSync(`rm -fr ${tmp}/${repoName}`);

execSync(
  `cd ${tmp} && git clone --single-branch --branch master https://projects:${env.DEPLOY_SWAN_TOKEN}@${env.DEPLOY_SWAN_REPOSITORY} ${repoName}`,
);

const file = fs.readFileSync(
  path.join(
    tmp,
    repoName,
    env.DEPLOY_ENVIRONMENT,
    `${env.DEPLOY_APP_NAME}-values.yaml`,
  ),
  "utf-8",
);

const updatedFile = file.replaceAll(/\btag: .+/g, `tag: ${env.TAG}`);

fs.writeFileSync(
  path.join(
    tmp,
    repoName,
    env.DEPLOY_ENVIRONMENT,
    `${env.DEPLOY_APP_NAME}-values.yaml`,
  ),
  updatedFile,
  "utf-8",
);

execSync(
  `cd ${tmp}/${repoName} && git commit --allow-empty -am "Update with tag: ${env.TAG}, image(s): ${env.DEPLOY_APP_NAME}"`,
);

execSync(
  `cd ${tmp}/${repoName} && git pull --rebase origin master && git push origin master`,
);
