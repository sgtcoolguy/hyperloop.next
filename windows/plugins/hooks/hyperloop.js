'use strict';
const spawn = require('child_process').spawn, // eslint-disable-line security/detect-child-process
	async = require('async'),
	path = require('path'),
	fs   = require('fs'),
	ejs  = require('ejs'),
	appc = require('node-appc');

function isVS2017(data) {
	return /^Visual Studio \w+ 2017/.test(data.windowsInfo.selectedVisualStudio.version);
}

exports.cliVersion = '>=3.2';
exports.init = function (logger, config, cli, nodeappc) { // eslint-disable-line no-unused-vars
	/*
	 * CLI Hook for Hyperloop build dependencies
	 */
	cli.on('build.module.pre.compile', function (data, callback) {
		const tasks = [
			function (next) {
				generateCMakeList(data, next);
			},
			function (next) {
				runCmake(data, 'WindowsStore', 'Win32', '10.0', next);
			},
			function (next) {
				runCmake(data, 'WindowsStore', 'ARM', '10.0', next);
			},
		];

		const w81support = !isVS2017(data);

		// Visual Studio 2017 doesn't support Windows/Phone 8.1 project anymore
		if (w81support) {
			tasks.push(function (next) {
				runCmake(data, 'WindowsPhone', 'Win32', '8.1', next);
			});
			tasks.push(function (next) {
				runCmake(data, 'WindowsPhone', 'ARM', '8.1', next);
			});
			tasks.push(function (next) {
				runCmake(data, 'WindowsStore', 'Win32', '8.1', next);
			});
		}

		const archs = w81support ? [ 'phone', 'store', 'win10' ] : [ 'win10' ];

		const csharp_dest = path.join(data.projectDir, 'reflection', 'HyperloopInvocation');
		archs.forEach(function (platform) {
			[ 'Debug', 'Release' ].forEach(function (buildConfig) {
				tasks.push(
					function (next) {
						buildSolution(data, csharp_dest, platform, buildConfig, next);
					}
				);
			});
		});

		async.series(tasks, function (err) {
			callback(err, data);
		});

	});

	/*
	 * Copy dependencies
	 */
	cli.on('build.module.pre.package', function (data, callback) {
		var w81support = !isVS2017(data),
			archs = w81support ? [ 'phone', 'store', 'win10' ] : [ 'win10' ];

		archs.forEach(function (platform) {
			[ 'ARM', 'x86' ].forEach(function (arch) {
				var from = path.join(data.projectDir, 'reflection', 'HyperloopInvocation', 'bin', platform, 'Release'),
					to = path.join(data.projectDir, 'build', 'Hyperloop', data.manifest.version, platform, arch);
				if (fs.existsSync(to)) {
					const files = fs.readdirSync(from);
					for (let i = 0; i < files.length; i++) {
						fs.createReadStream(path.join(from, files[i])).pipe(fs.createWriteStream(path.join(to, files[i])));
					}
					// Don't copy TitaniumWindows_Hyperloop.winmd
					const exclude_file = path.join(to, 'TitaniumWindows_Hyperloop.winmd');
					fs.existsSync(exclude_file) && fs.unlinkSync(exclude_file);
				}
			});
		});
		callback(null, data);
	});
};

function generateCMakeList(data, next) {
	const template  = path.join(data.projectDir, 'CMakeLists.txt.ejs'),
		cmakelist = path.join(data.projectDir, 'CMakeLists.txt'),
		windowsSrcDir = path.join(data.titaniumSdkPath, 'windows'),
		version = data.manifest.version;

	data.logger.debug('Updating CMakeLists.txt...');

	fs.readFile(template, 'utf8', function (err, data) {
		if (err) {
			throw err;
		}
		data = ejs.render(data, {
			version: appc.version.format(version, 4, 4, true),
			windowsSrcDir: windowsSrcDir.replace(/\\/g, '/').replace(' ', '\\ ')
		}, {});

		fs.writeFile(cmakelist, data, function (err) {
			next(err);
		});
	});
}

function runCmake(data, platform, arch, sdkVersion, next) {
	const logger = data.logger,
		generatorName = (isVS2017(data) ? 'Visual Studio 15 2017' : 'Visual Studio 14 2015')  + (arch === 'ARM' ? ' ARM' : ''),
		cmakeProjectName = (sdkVersion === '10.0' ? 'Windows10' : platform) + '.' + arch,
		cmakeWorkDir = path.resolve(__dirname, '..', '..', cmakeProjectName);

	logger.debug('Run CMake on ' + cmakeWorkDir);

	if (!fs.existsSync(cmakeWorkDir)) {
		fs.mkdirSync(cmakeWorkDir);
	}

	const p = spawn(path.join(data.titaniumSdkPath, 'windows', 'cli', 'vendor', 'cmake', 'bin', 'cmake.exe'),
		[
			'-G', generatorName,
			'-DCMAKE_SYSTEM_NAME=' + platform,
			'-DCMAKE_SYSTEM_VERSION=' + sdkVersion,
			'-DCMAKE_BUILD_TYPE=Debug',
			path.resolve(__dirname, '..', '..')
		],
		{
			cwd: cmakeWorkDir
		});
	p.on('error', function (err) {
		// logger.error(cmake);
		logger.error(err);
	});
	p.stdout.on('data', function (data) {
		logger.info(data.toString().trim());
	});
	p.stderr.on('data', function (data) {
		logger.warn(data.toString().trim());
	});
	p.on('close', function (code) {
		if (code !== 0) {
			process.exit(1); // Exit with code from cmake?
		}
		next();
	});
}

function buildSolution(data, dest, platform, buildConfig, callback) {
	const slnFile = path.join(dest, platform, 'HyperloopInvocation.sln');
	runNuGet(data, slnFile, function (err) {
		if (err) {
			throw err;
		}
		runMSBuild(data, slnFile, buildConfig, callback);
	});
}

function runNuGet(data, slnFile, callback) {
	const logger = data.logger;
	// Make sure project dependencies are installed via NuGet
	const p = spawn(path.join(data.titaniumSdkPath, 'windows', 'cli', 'vendor', 'nuget', 'nuget.exe'), [ 'restore', slnFile ]);
	p.stdout.on('data', function (data) {
		var line = data.toString().trim();
		if (line.indexOf('error ') >= 0) {
			logger.error(line);
		} else if (line.indexOf('warning ') >= 0) {
			logger.warn(line);
		} else if (line.indexOf(':\\') === -1) {
			logger.debug(line);
		} else {
			logger.trace(line);
		}
	});
	p.stderr.on('data', function (data) {
		logger.warn(data.toString().trim());
	});
	p.on('close', function (code) {
		if (code !== 0) {
			process.exit(1); // Exit with code from nuget?
		}
		callback();
	});
}

function runMSBuild(data, slnFile, buildConfig, callback) {
	const logger = data.logger,
		windowsInfo = data.windowsInfo,
		vsInfo  = windowsInfo.selectedVisualStudio;

	if (!vsInfo) {
		logger.error('Unable to find a supported Visual Studio installation');
		process.exit(1);
	}

	logger.debug('Running MSBuild on solution: ' + slnFile);

	// Use spawn directly so we can pipe output as we go
	const p = spawn((process.env.comspec || 'cmd.exe'), [ '/S', '/C', '"', vsInfo.vsDevCmd.replace(/[ ()&]/g, '^$&')
								+ ' && MSBuild /p:Platform="Any CPU" /p:Configuration=' + buildConfig + ' ' + slnFile + '"'
	], { windowsVerbatimArguments: true });
	p.stdout.on('data', function (data) {
		var line = data.toString().trim();
		if (line.indexOf('error ') >= 0) {
			logger.error(line);
		} else if (line.indexOf('warning ') >= 0) {
			logger.warn(line);
		} else if (line.indexOf(':\\') === -1) {
			logger.debug(line);
		} else {
			logger.trace(line);
		}
	});
	p.stderr.on('data', function (data) {
		logger.warn(data.toString().trim());
	});
	p.on('close', function (code) {

		if (code !== 0) {
			logger.error('MSBuild fails with code ' + code);
			process.exit(1); // Exit with code from msbuild?
		}

		callback();
	});
}