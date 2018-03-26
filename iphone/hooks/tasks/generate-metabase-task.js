// TODO: Make into an incremental appc-task!
'use strict';

const hm = require('hyperloop-metabase');
const util = require('./util');

/**
 * Generates a full/unified metabase from all used frameworks, their dependencies and swift sources.
 * @param  {SDKEnvironment} sdk sdk info object
 * @param  {string} sdk.sdkPath path to iOS SDK
 * @param  {string} sdk.minVersion minimum iOS version, i.e. '9.0'
 * @param  {string} sdk.sdkType 'iphoneos' || 'iphonesimulator'
 * @param  {Map<string,ModuleMetadata>}   frameworkMap [description]
 * @param  {string[]} usedFrameworkNames list of explicitly used frameworks
 * @return {Promise<object>}
 */
function generateMetabase(sdk, frameworkMap, usedFrameworkNames) {
	// Filter out the builtins from usedFrameworkNames
	const filteredFrameworks = usedFrameworkNames.filter(name => !util.isBuiltin(name));
	return hm.unifiedMetabase(sdk, frameworkMap, filteredFrameworks);
}

exports.generateMetabase = generateMetabase;
