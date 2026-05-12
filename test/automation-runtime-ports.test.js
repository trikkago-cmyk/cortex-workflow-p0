import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findRepoNodeScriptListenerPid,
  findRepoCortexServerListenerPid,
  matchesRepoNodeScriptCommand,
  matchesRepoCortexServerCommand,
  readProcessCommand,
  readProcessWorkingDirectory,
  resolveListeningPid,
} from '../src/automation-runtime-ports.js';

test('resolveListeningPid returns the first listening pid from lsof output', () => {
  const pid = resolveListeningPid({
    port: '19100',
    execFileSync: (_cmd, _args, _options) => '23699\n40123\n',
  });

  assert.equal(pid, 23699);
});

test('readProcessCommand trims ps output', () => {
  const command = readProcessCommand(23699, {
    execFileSync: (_cmd, _args, _options) => '  node /tmp/cortex/src/server.js  \n',
  });

  assert.equal(command, 'node /tmp/cortex/src/server.js');
});

test('readProcessWorkingDirectory extracts cwd from lsof output', () => {
  const cwd = readProcessWorkingDirectory(23699, {
    execFileSync: (_cmd, _args, _options) => 'p23699\nfcwd\nn/tmp/cortex\n',
  });

  assert.equal(cwd, '/tmp/cortex');
});

test('matchesRepoCortexServerCommand accepts repo-relative server command when process cwd matches repo', () => {
  assert.equal(
    matchesRepoCortexServerCommand('node src/server.js', {
      cwd: '/tmp/cortex',
      processCwd: '/tmp/cortex',
    }),
    true,
  );
});

test('matchesRepoCortexServerCommand rejects repo-relative server command when process cwd differs', () => {
  assert.equal(
    matchesRepoCortexServerCommand('node src/server.js', {
      cwd: '/tmp/cortex',
      processCwd: '/tmp/other-project',
    }),
    false,
  );
});

test('matchesRepoNodeScriptCommand accepts repo-relative arbitrary script when process cwd matches repo', () => {
  assert.equal(
    matchesRepoNodeScriptCommand('node src/cortex-mcp-server.js', {
      cwd: '/tmp/cortex',
      processCwd: '/tmp/cortex',
      scriptRelativePath: 'src/cortex-mcp-server.js',
    }),
    true,
  );
});

test('findRepoCortexServerListenerPid matches current repo server command only', () => {
  const pid = findRepoCortexServerListenerPid({
    cwd: '/tmp/cortex',
    port: '19100',
    execFileSync: (cmd, args) => {
      if (cmd === 'lsof' && args.includes('-iTCP:19100')) {
        return '23699\n';
      }
      if (cmd === 'ps') {
        assert.deepEqual(args, ['-p', '23699', '-o', 'command=']);
        return 'node /tmp/cortex/src/server.js\n';
      }
      if (cmd === 'lsof' && args.includes('-d')) {
        return 'p23699\nfcwd\nn/tmp/cortex\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  });

  assert.equal(pid, 23699);
});

test('findRepoCortexServerListenerPid ignores listeners from other commands', () => {
  const pid = findRepoCortexServerListenerPid({
    cwd: '/tmp/cortex',
    port: '19100',
    execFileSync: (cmd, args) => {
      if (cmd === 'lsof' && args.includes('-iTCP:19100')) {
        return '23699\n';
      }
      if (cmd === 'ps') {
        return 'node /tmp/other-project/src/server.js\n';
      }
      if (cmd === 'lsof' && args.includes('-d')) {
        return 'p23699\nfcwd\nn/tmp/other-project\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  });

  assert.equal(pid, null);
});

test('findRepoCortexServerListenerPid matches repo-relative server command when listener cwd matches repo', () => {
  const pid = findRepoCortexServerListenerPid({
    cwd: '/tmp/cortex',
    port: '19100',
    execFileSync: (cmd, args) => {
      if (cmd === 'lsof' && args.includes('-iTCP:19100')) {
        return '23699\n';
      }
      if (cmd === 'ps') {
        return 'node src/server.js\n';
      }
      if (cmd === 'lsof' && args.includes('-d')) {
        return 'p23699\nfcwd\nn/tmp/cortex\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  });

  assert.equal(pid, 23699);
});

test('findRepoCortexServerListenerPid rejects repo-relative server command when listener cwd differs', () => {
  const pid = findRepoCortexServerListenerPid({
    cwd: '/tmp/cortex',
    port: '19100',
    execFileSync: (cmd, args) => {
      if (cmd === 'lsof' && args.includes('-iTCP:19100')) {
        return '23699\n';
      }
      if (cmd === 'ps') {
        return 'node src/server.js\n';
      }
      if (cmd === 'lsof' && args.includes('-d')) {
        return 'p23699\nfcwd\nn/tmp/other-project\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  });

  assert.equal(pid, null);
});

test('findRepoNodeScriptListenerPid matches other managed listener scripts', () => {
  const pid = findRepoNodeScriptListenerPid({
    cwd: '/tmp/cortex',
    port: '19101',
    scriptRelativePath: 'src/cortex-mcp-server.js',
    execFileSync: (cmd, args) => {
      if (cmd === 'lsof' && args.includes('-iTCP:19101')) {
        return '44123\n';
      }
      if (cmd === 'ps') {
        return 'node src/cortex-mcp-server.js\n';
      }
      if (cmd === 'lsof' && args.includes('-d')) {
        return 'p44123\nfcwd\nn/tmp/cortex\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  });

  assert.equal(pid, 44123);
});
