function compact(value) {
  return String(value || '').trim();
}

function flagFrom(input, fallback = false) {
  if (input === undefined || input === null || input === '') {
    return fallback;
  }

  const normalized = compact(input).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isDryRunSendMode(sendMode) {
  return sendMode === 'stdout' || sendMode === 'file';
}

export function hasRealSenderConfig({ sendMode, sendUrl, sendCommand }) {
  if (sendMode === 'http') {
    return Boolean(compact(sendUrl));
  }

  if (sendMode === 'command') {
    return Boolean(compact(sendCommand));
  }

  return false;
}

export function resolvePanghuRuntimeConfig(input = {}, env = process.env) {
  const sendMode = compact(input.sendMode || env.PANGHU_SEND_MODE || 'stdout') || 'stdout';
  const sendUrl = compact(input.sendUrl || env.PANGHU_SEND_URL);
  const sendCommand = compact(input.sendCommand || env.PANGHU_SEND_COMMAND);
  const sendFile = compact(input.sendFile || env.PANGHU_SEND_FILE);
  const requireRealSender = flagFrom(input.requireRealSender, flagFrom(env.PANGHU_REQUIRE_REAL_SENDER, false));
  const allowDryRun = flagFrom(input.allowDryRun, flagFrom(env.PANGHU_ALLOW_DRY_RUN, false));
  const dryRun = isDryRunSendMode(sendMode);
  const realSenderConfigured = hasRealSenderConfig({
    sendMode,
    sendUrl,
    sendCommand,
  });

  let reason = 'ready';
  if (sendMode === 'http' && !realSenderConfigured) {
    reason = 'missing_http_send_url';
  } else if (sendMode === 'command' && !realSenderConfigured) {
    reason = 'missing_send_command';
  } else if (dryRun && requireRealSender && !allowDryRun) {
    reason = 'dry_run_sender_not_allowed';
  } else if (dryRun) {
    reason = 'dry_run_sender';
  } else if (!realSenderConfigured) {
    reason = 'sender_not_configured';
  } else if (realSenderConfigured) {
    reason = 'real_sender_configured';
  }

  const startAllowed = reason === 'real_sender_configured' || reason === 'dry_run_sender' || reason === 'ready';

  return {
    sendMode,
    sendUrl,
    sendCommand,
    sendFile,
    requireRealSender,
    allowDryRun,
    dryRun,
    realSenderConfigured,
    startAllowed,
    reason,
  };
}

export function assertPanghuRuntimeAllowed(input = {}, env = process.env) {
  const config = resolvePanghuRuntimeConfig(input, env);
  if (config.startAllowed) {
    return config;
  }

  if (config.reason === 'dry_run_sender_not_allowed') {
    throw new Error(
      'dry-run sender is not allowed: configure PANGHU_SEND_MODE=http|command with a real transport, or set PANGHU_ALLOW_DRY_RUN=1 explicitly',
    );
  }

  if (config.reason === 'missing_http_send_url') {
    throw new Error('PANGHU_SEND_URL is required when PANGHU_SEND_MODE=http');
  }

  if (config.reason === 'missing_send_command') {
    throw new Error('PANGHU_SEND_COMMAND is required when PANGHU_SEND_MODE=command');
  }

  throw new Error(`panghu sender is not ready (${config.reason})`);
}
