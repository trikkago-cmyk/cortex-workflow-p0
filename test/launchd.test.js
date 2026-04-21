import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchdPlist, defaultLaunchAgentPath, defaultLaunchdLabel } from '../src/launchd.js';

test('defaultLaunchdLabel derives a stable service label from cwd', () => {
  assert.equal(defaultLaunchdLabel('/Users/example/Desktop/cortex-workflow-p0'), 'com.cortex.cortex-workflow-p0');
});

test('defaultLaunchAgentPath points to LaunchAgents plist', () => {
  const filePath = defaultLaunchAgentPath({
    cwd: '/Users/example/Desktop/cortex-workflow-p0',
    home: '/Users/example',
    label: 'com.cortex.cortex-workflow-p0',
  });

  assert.equal(filePath, '/Users/example/Library/LaunchAgents/com.cortex.cortex-workflow-p0.plist');
});

test('buildLaunchdPlist schedules automation ensure with project env support', () => {
  const plist = buildLaunchdPlist({
    cwd: '/Users/example/Desktop/cortex-workflow-p0',
    label: 'com.cortex.cortex-workflow-p0',
    intervalSeconds: 20,
    nodePath: '/opt/homebrew/bin/node',
    environment: {
      PATH: '/opt/homebrew/bin:/usr/bin:/bin',
      HOME: '/Users/example',
    },
  });

  assert.match(plist, /<string>com\.cortex\.cortex-workflow-p0<\/string>/);
  assert.match(plist, /<string>\/opt\/homebrew\/bin\/node<\/string>/);
  assert.match(plist, /<string>\/Users\/example\/Desktop\/cortex-workflow-p0\/scripts\/automation-ensure\.js<\/string>/);
  assert.match(plist, /<integer>20<\/integer>/);
  assert.match(plist, /<key>EnvironmentVariables<\/key>/);
  assert.match(plist, /<key>PATH<\/key>/);
});
