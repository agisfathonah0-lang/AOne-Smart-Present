const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('json'); 
config.resolver.sourceExts.push('json');

module.exports = config;