import fs from 'fs-extra';
import { constants } from 'auth0-source-control-extension-tools';

import path from 'path';
import { expect } from 'chai';

import Context from '../../../src/context/directory';
import handler from '../../../src/context/directory/handlers/hooks';
import { loadJSON } from '../../../src/utils';
import { cleanThenMkdir, testDataDir, createDir, mockMgmtClient } from '../../utils';

const hooks = {
  'somehook.js': 'function someHook() { var hello = @@hello@@; }',
  'somehook.json': '{ "name": "somehook", "active": true, "code": "somehook.js", "triggerId": "credentials-exchange" }',
  'otherhook.js': 'function someHook() { var hello = @@hello@@; }',
  'otherhook.json': '{ "name": "otherhook", "code": "otherhook.js", "triggerId": "credentials-exchange" }'
};

const hooksTarget = [
  {
    name: 'otherhook',
    code: 'function someHook() { var hello = "goodbye"; }',
    triggerId: 'credentials-exchange'
  },
  {
    name: 'somehook',
    active: true,
    code: 'function someHook() { var hello = "goodbye"; }',
    triggerId: 'credentials-exchange'
  }
];


describe('#directory context hooks', () => {
  it('should process hooks', async () => {
    const repoDir = path.join(testDataDir, 'directory', 'hooks1');
    const dir = path.join(repoDir);
    createDir(dir, { [constants.HOOKS_DIRECTORY]: hooks });

    const config = { AUTH0_INPUT_FILE: repoDir, AUTH0_KEYWORD_REPLACE_MAPPINGS: { hello: 'goodbye' } };
    const context = new Context(config, mockMgmtClient());
    await context.load();

    expect(context.assets.hooks).to.deep.equal(hooksTarget);
  });

  it('should ignore unknown file', async () => {
    const repoDir = path.join(testDataDir, 'directory', 'hooks2');
    const dir = path.join(repoDir);
    createDir(dir, { [constants.HOOKS_DIRECTORY]: hooks });

    const config = { AUTH0_INPUT_FILE: repoDir, AUTH0_KEYWORD_REPLACE_MAPPINGS: { hello: 'goodbye' } };
    const context = new Context(config, mockMgmtClient());
    await context.load();

    expect(context.assets.hooks).to.deep.equal(hooksTarget);
  });

  it('should ignore bad hooks directory', async () => {
    const repoDir = path.join(testDataDir, 'directory', 'hooks3');
    cleanThenMkdir(repoDir);
    const dir = path.join(repoDir, constants.HOOKS_DIRECTORY);
    fs.writeFileSync(dir, 'junk');

    const context = new Context({ AUTH0_INPUT_FILE: repoDir });
    const errorMessage = `Expected ${dir} to be a folder but got a file?`;
    await expect(context.load())
      .to.be.eventually.rejectedWith(Error)
      .and.have.property('message', errorMessage);
  });

  it('should dump hooks', async () => {
    const dir = path.join(testDataDir, 'yaml', 'hooksDump');
    cleanThenMkdir(dir);
    const context = new Context({ AUTH0_INPUT_FILE: dir }, mockMgmtClient());
    const codeValidation = 'function someHook() { var hello = "test"; }';

    context.assets.hooks = [
      {
        name: 'someHook',
        code: codeValidation,
        triggerId: 'credentials-exchange'
      }
    ];

    await handler.dump(context);

    const hooksFolder = path.join(dir, constants.HOOKS_DIRECTORY);

    expect(loadJSON(path.join(hooksFolder, 'someHook.json'))).to.deep.equal({
      name: 'someHook',
      code: './someHook.js',
      triggerId: 'credentials-exchange'
    });
    expect(fs.readFileSync(path.join(hooksFolder, 'someHook.js'), 'utf8')).to.deep.equal(codeValidation);
  });

  it('should dump hooks sanitized', async () => {
    const dir = path.join(testDataDir, 'yaml', 'hooksDump');
    cleanThenMkdir(dir);
    const context = new Context({ AUTH0_INPUT_FILE: dir }, mockMgmtClient());
    const codeValidation = 'function someHook() { var hello = "test"; }';

    context.assets.hooks = [
      {
        name: 'some/Hook',
        code: codeValidation,
        triggerId: 'credentials-exchange'
      }
    ];

    await handler.dump(context);

    const hooksFolder = path.join(dir, constants.HOOKS_DIRECTORY);

    expect(loadJSON(path.join(hooksFolder, 'some-Hook.json'))).to.deep.equal({
      name: 'some/Hook',
      code: './some-Hook.js',
      triggerId: 'credentials-exchange'
    });
    expect(fs.readFileSync(path.join(hooksFolder, 'some-Hook.js'), 'utf8')).to.deep.equal(codeValidation);
  });
});