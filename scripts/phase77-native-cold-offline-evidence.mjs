#!/usr/bin/env node
/**
 * Phase 77 native cold-offline evidence gate.
 * An Expo Dev Client that requires Metro does NOT prove self-contained cold launch.
 * This helper inspects adb devices / installed package and records pass/skipped/unmet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'phase77');
fs.mkdirSync(outDir, { recursive: true });

const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();

const evidence = {
  at: new Date().toISOString(),
  revision: revision || null,
  result: 'unmet',
  steps: [],
  limits: [],
};

function record(step, status, details) {
  evidence.steps.push({ step, status, details });
  console.log(`[${status}] ${step}: ${details}`);
}

function adb(args) {
  return spawnSync('adb', args, { encoding: 'utf8' });
}

const devices = adb(['devices']);
if (devices.error || devices.status !== 0) {
  record('adb', 'skipped', devices.error ? String(devices.error) : devices.stderr || 'adb unavailable');
  evidence.limits.push('adb not available; native cold launch unmet');
  evidence.result = 'unmet';
} else {
  const lines = (devices.stdout || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('List of'));
  const serials = lines
    .map((l) => l.split(/\s+/)[0])
    .filter((s) => s && s !== 'device' && !s.includes('offline'));
  const online = lines.filter((l) => /\tdevice$/.test(l)).map((l) => l.split(/\s+/)[0]);
  record('adb-devices', online.length ? 'pass' : 'skipped', JSON.stringify({ online, raw: lines }));

  if (!online.length) {
    evidence.limits.push('No online adb device; native cold launch unmet');
    evidence.result = 'unmet';
  } else {
    const serial = process.env.DAYNORI_ANDROID_SERIAL || online[0];
    evidence.serial = serial;
    const pkg = process.env.DAYNORI_ANDROID_PACKAGE || 'com.daynori.app';
    const pathRes = adb(['-s', serial, 'shell', 'pm', 'path', pkg]);
    const apkPath = (pathRes.stdout || '').trim();
    if (!apkPath.includes('package:')) {
      record('installed-package', 'unmet', `Package ${pkg} not installed (${pathRes.stdout || pathRes.stderr})`);
      evidence.limits.push('Required installed package missing; Dev Client alone is insufficient');
      evidence.result = 'unmet';
    } else {
      record('installed-package', 'pass', apkPath);
      // Heuristic: if Metro is required, dumpsys may show debug host. We cannot prove self-contained
      // JS bundle without a release/preview install — mark unmet unless DAYNORI_NATIVE_OFFLINE_OK=1
      // is set by an operator after a manual offline reopen with airplane mode.
      if (process.env.DAYNORI_NATIVE_OFFLINE_OK === '1') {
        record(
          'operator-attestation',
          'pass',
          'DAYNORI_NATIVE_OFFLINE_OK=1 — operator attested installed-build offline reopen'
        );
        evidence.result = 'pass';
        evidence.limits.push('Operator attestation; emulator vs physical must be recorded in phase report.');
      } else {
        record(
          'self-contained-cold-launch',
          'unmet',
          'No operator attestation. Refusing to claim Dev Client+Metro as cold offline proof.'
        );
        evidence.limits.push(
          'Set DAYNORI_NATIVE_OFFLINE_OK=1 only after airplane-mode reopen of an installed build with offline JS.'
        );
        evidence.result = 'unmet';
      }
    }
  }
}

const target = path.join(outDir, 'cold-offline-native.json');
fs.writeFileSync(target, JSON.stringify(evidence, null, 2));
console.log(`Wrote ${target}`);
process.exit(0);
