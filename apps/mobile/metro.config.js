const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
delete config.server.unstable_serverRoot;

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Support TypeScript source files with .js import specifiers in monorepo
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('./apps/mobile/')) {
    const remapped = './' + moduleName.slice('./apps/mobile/'.length);
    try {
      return context.resolveRequest(context, remapped, platform);
    } catch {
      // Fall through
    }
  }
  if (moduleName.startsWith('apps/mobile/')) {
    const remapped = './' + moduleName.slice('apps/mobile/'.length);
    try {
      return context.resolveRequest(context, remapped, platform);
    } catch {
      // Fall through
    }
  }
  if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
    if (moduleName.endsWith('.js')) {
      const tsModuleName = moduleName.slice(0, -3);
      try {
        return context.resolveRequest(context, tsModuleName, platform);
      } catch {
        // Fall back to original resolution
      }
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
