/**
 * Copyright (c) 2015 by Appcelerator, Inc. All Rights Reserved.
 * Licensed under the terms of the Apache Public License.
 * Please see the LICENSE included with this distribution for details.
 */
var path = require('path'),
	fs = require('fs'),
	async = require('async'),
	http = require('http'),
	request = require('request'),
	colors = require('colors'),
	wrench = require('wrench'),
	temp = require('temp'),
	appc = require('node-appc'),
	exec = require('child_process').exec,
	spawn = require('child_process').spawn,
	afs = appc.fs,
	HOME = process.env.HOME || process.env.USERPROFILE || process.env.APPDATA,
	titanium = path.join(__dirname, 'node_modules', 'titanium', 'bin', 'titanium'),
	androidModuleDir = path.join(__dirname, '..', 'android'),
	iosModuleDir = path.join(__dirname, '..', 'iphone'),
	TITANIUM_ANDROID_API = 21, // This is required right now by the module building scripts, as it's set as the default there. I don't see a way to override it!
	ANDROID_SDK_URL = 'http://dl.google.com/android/android-sdk_r24.0.1-macosx.zip',
	ANDROID_NDK_URL = 'http://dl.google.com/android/ndk/android-ndk-r8c-darwin-x86.tar.bz2';

function downloadURL(url, callback) {
	console.log('Downloading %s', url.cyan);

	var tempName = temp.path({ suffix: '.zip' }),
		tempDir = path.dirname(tempName);
	fs.existsSync(tempDir) || wrench.mkdirSyncRecursive(tempDir);

	var tempStream = fs.createWriteStream(tempName),
		req = request({ url: url });

	req.pipe(tempStream);

	req.on('error', function (err) {
		fs.existsSync(tempName) && fs.unlinkSync(tempName);
		console.log();
		console.error('Failed to download URL: %s', err.toString() + '\n');
		process.exit(1);
	});

	req.on('response', function (req) {
		if (req.statusCode >= 400) {
			// something went wrong, abort
			console.log();
			console.error('Request failed with HTTP status code %s %s\n', req.statusCode, http.STATUS_CODES[req.statusCode] || '');
			process.exit(1);
		} else if (req.headers['content-length']) {
			// we know how big the file is, display the progress bar
			var total = parseInt(req.headers['content-length']),
				bar;

			if (!process.argv.indexOf('--quiet') && !process.argv.indexOf('--no-progress-bars')) {
				bar = new appc.progress('  :paddedPercent [:bar] :etas', {
					complete: '='.cyan,
					incomplete: '.'.grey,
					width: 40,
					total: total
				});
			}

			req.on('data', function (buffer) {
				bar && bar.tick(buffer.length);
			});

			tempStream.on('close', function () {
				if (bar) {
					bar.tick(total);
					console.log('\n');
				}
				callback(tempName);
			});
		} else {
			// we don't know how big the file is, display a spinner
			var busy;

			if (!process.argv.indexOf('--quiet') && !process.argv.indexOf('--no-progress-bars')) {
				busy = new appc.busyindicator;
				busy.start();
			}

			tempStream.on('close', function () {
				busy && busy.stop();
				logger.log();
				callback(tempName);
			});
		}
	});
}

function extract(filename, installLocation, keepFiles, callback) {
	console.log('Extracting to %s', installLocation.cyan);

	var bar;

	appc.zip.unzip(filename, installLocation, {
		visitor: function (entry, i, total) {
			if (i == 0) {
				if(!process.argv.indexOf('--quiet') && !process.argv.indexOf('--no-progress-bars')) {
					bar = new appc.progress('  :paddedPercent [:bar]', {
						complete: '='.cyan,
						incomplete: '.'.grey,
						width: 40,
						total: total
					});
				}
			}
			bar && bar.tick();
		}
	}, function (err, extracted, total) {
		if (err) {
			keepFiles || fs.unlinkSync(filename);
			console.log();
			console.error('Failed to unzip');
			String(err).trim().split('\n').forEach(console.error);
			console.log();
			process.exit(1);
		} else {
			if (bar) {
				bar.tick(total);
				console.log('\n');
			}
			keepFiles || fs.unlinkSync(filename);
			callback();
		}
	});
}

// Install master branch Titanium SDK
function installSDK(next) {
	var args = [titanium, 'sdk', 'install', '-b', 'master', '-d'],
		prc;
	if (process.argv.indexOf('--no-progress-bars') != -1) {
		args.push('--no-progress-bars');
	}
	prc = spawn('node', args);
	prc.stdout.on('data', function (data) {
		console.log(data.toString().trim());
	});
	prc.stderr.on('data', function (data) {
		console.error(data.toString().trim());
	});

	prc.on('close', function (code) {
		if (code != 0) {
			next("Failed to install master SDK. Exit code: " + code);
		} else {
			next();
		}
	});
}

function getSDKInstallDir(next) {
	exec('node "' + titanium + '" info -o json -t titanium', function (error, stdout, stderr) {
		var out,
			selectedSDK,
			sdkPath;
		if (error !== null) {
			next('Failed to get SDK install dir: ' + error);
		}

		out = JSON.parse(stdout);
		selectedSDK = out['titaniumCLI']['selectedSDK'];

		sdkPath = out['titanium'][selectedSDK]['path'];
		next(null, sdkPath);
	});
}

// Grab the Android home location
function getAndroidPaths(next) {
	exec('node "' + titanium + '" info -o json -t android', function (error, stdout, stderr) {
		var out,
			androidSDKPath,
			androidNDKPath
		if (error !== null) {
			next('Failed to get ANDROID NDK and SDK paths: ' + error);
		}

		out = JSON.parse(stdout);

		androidSDKPath = out.android && out.android.sdk && out.android.sdk.path;
		androidNDKPath = out.android && out.android.ndk && out.android.ndk.path;

		// Fall back to env vars for these values
		if (!androidNDKPath) {
			androidNDKPath = process.env.ANDROID_NDK;
		}
		if (!androidSDKPath) {
			androidSDKPath = process.env.ANDROID_SDK;
		}

		next(null, {sdk: androidSDKPath, ndk: androidNDKPath});
	});
}

function installAndroidSDK(next) {
	console.log("Installing Android SDK");

	downloadURL(ANDROID_SDK_URL, function (filename) {
		extract(filename, HOME, true, function() {
			// Set the path to it in titanium config!
			var sdkHome = path.join(HOME, 'android-sdk-macosx');
			exec('node "' + titanium + '" config android.sdkPath ' + sdkHome, function (error, stdout, stderr) {
				if (error !== null) {
					return next('Failed to set android.sdkPath in CLI config: ' + error);
				}
				// TODO Set env var?
				next(null, sdkHome);
			});
		});
	});
}

function installAndroidSDKComponents(androidSDKPath, next) {
	console.log("Installing and configuring Android SDK + Tools");

	var androidBin = path.join(androidSDKPath, 'tools', 'android'),
		// FIXME This re-installs these even if we aready have them! I think we need more fiddling, to remove --all, but that doesn't work just removing it.
		shellSyntaxCommand = "echo 'y' | " + androidBin + ' -s update sdk --no-ui --all --filter tools,platform-tools,build-tools-23.0.1,extra-android-support,android-8,android-10,android-' + TITANIUM_ANDROID_API + ',addon-google_apis-google-' + TITANIUM_ANDROID_API,
		prc;
	prc = spawn('sh', ['-c', shellSyntaxCommand], { stdio: 'inherit' });
	prc.on('close', function (code) {
		if (code != 0) {
			next("Failed to build install Android SDK components. Exit code: " + code);
		} else {
			next();
		}
	});
}

function installAndroidNDK(next) {
	console.log("Installing Android NDK");

	downloadURL(ANDROID_NDK_URL, function (filename) {
		exec('tar xzf "' + filename + '" -C "' + HOME + '"', function (error, stdout, stderr) {
			if (error !== null) {
				return next('Failed to sextract Android NDK: ' + error);
			}
			var ndkHome = path.join(HOME, 'android-ndk-r8c');
			exec('node "' + titanium + '" config android.ndkPath ' + ndkHome, function (error, stdout, stderr) {
				if (error !== null) {
					return next('Failed to set path to Android NDK in titanium CLI config: ' + error);
				}
				// TODO Set env var!
				next(null, ndkHome);
			});
		});
	});
}

/**
 * Given the paths to the Titanium SDK, the android SDK, and the Android NDK - write out the build.properties for Android/ANT to build against
 **/
function writeBuildProperties(tiSDKPath, androidSDKPath, androidNDKPath, next) {
	console.log('Writing build.properties for Ant');
	// Write out properties file
	var buildProperties = path.join(androidModuleDir, 'build.properties'),
		content = "";
	// if it exists, wipe it
	if (fs.existsSync(buildProperties)) {
		fs.unlinkSync(buildProperties);
	}
	content += 'titanium.platform=' + tiSDKPath + '/android\n';
	content += 'android.platform=' + androidSDKPath + '/platforms/android-' + TITANIUM_ANDROID_API + '\n';
	content += 'google.apis=' + androidSDKPath + '/add-ons/addon-google_apis-google-' + TITANIUM_ANDROID_API + '\n';
	content += 'android.ndk=' + androidNDKPath + '\n';
	fs.writeFile(buildProperties, content, next);
}

function writeTitaniumXcconfig(tiSDKPath, next) {
	console.log('Writing titanium.xcconfig for iOS');
	// Write out properties file
	var buildProperties = path.join(iosModuleDir, 'titanium.xcconfig'),
		content = "";
	// if it exists, wipe it
	if (fs.existsSync(buildProperties)) {
		fs.unlinkSync(buildProperties);
	}
	content += 'TITANIUM_SDK = ' + tiSDKPath + '\n';
	content += 'TITANIUM_BASE_SDK = "$(TITANIUM_SDK)/iphone/include"\n';
	content += 'TITANIUM_BASE_SDK2 = "$(TITANIUM_SDK)/iphone/include/TiCore"\n';
	content += 'TITANIUM_BASE_SDK3 = "$(TITANIUM_SDK)/iphone/include/JavaScriptCore"\n';
	content += 'HEADER_SEARCH_PATHS= $(TITANIUM_BASE_SDK) $(TITANIUM_BASE_SDK2) $(TITANIUM_BASE_SDK3)\n';
	fs.writeFile(buildProperties, content, next);
}

function runBuildScript(next) {
	console.log('Running build');

	var prc = spawn('sh', ['-c', './build.sh'], { cwd: path.join(__dirname, '..') });
	prc.stdout.on('data', function (data) {
		console.log(data.toString().trim());
	});
	prc.stderr.on('data', function (data) {
		console.error(data.toString().trim());
	});
	prc.on('close', function (code) {
		if (code != 0) {
			next("Failed to build. Exit code: " + code);
		} else {
			next();
		}
	});
}

/**
 * The whole shebang. Installs latest and greatest Titanium SDK from master,
 * Android SDK/NDK, sets up the android/build.properties to point at them,
 * iphone/titanium.xcconfig, then runs the build.sh file in the root of the repo
 * If you already have dependencies installed, this is overkill. But useful for
 * clean CI environments.
 */
function build(callback) {
	var tiSDKPath,
		androidSDKPath,
		androidNDKPath;
	async.series([
		// Install latest Titaniun SDK from master
		installSDK,
		// Grab location it got installed
		function (next) {
			getSDKInstallDir(function (err, sdkPath) {
				if (err) {
					return next(err);
				}
				tiSDKPath = sdkPath;
				next();
			});
		},
		// TODO Do we need to install xcode or something?
		// TODO Install python if it's not installed?

		// Grab the paths to Android NDK and SDK
		function (next) {
			console.log("Checking Android paths");
			getAndroidPaths(function (err, result) {
				androidSDKPath = result.sdk;
				androidNDKPath = result.ndk;
				next();
			});
		},
		// In parallel, install Android SDK and NDK (and components) if necessary
		function (cb) {
			async.parallel([
				// SDK
				function (cb) {
					async.series([
						function (next) {
							if (androidSDKPath && fs.existsSync(androidSDKPath)) {
								return next();
							}

							installAndroidSDK(function(err, sdkPath) {
								if (err) {
									return next(err);
								}
								androidSDKPath = sdkPath;
								next();
							});
						},
						function (next) {
							// TODO Is there any way we can just verify the components we want are already installed?
							installAndroidSDKComponents(androidSDKPath, next);
						}
					], cb);
				},
				// NDK
				function (next) {
					if (androidNDKPath && fs.existsSync(androidNDKPath)) {
						return next();
					}

					installAndroidNDK(function(err, ndkPath) {
						if (err) {
							return next(err);
						}
						androidNDKPath = ndkPath;
						next();
					});
				}
			], cb);
		},
		// Point to the Titanium SDK, Android NDK and Android SDK we just installed for Android module build
		function (next) {
			writeBuildProperties(tiSDKPath, androidSDKPath, androidNDKPath, next);
		},
		// Point to the Titanium SDK we just installed for iOS module build
		function (next) {
			writeTitaniumXcconfig(tiSDKPath, next);
		},
		runBuildScript
		// TODO Remove the Titanium SDK we installed to avoid cluttering up HDD?
	], callback);
}

// public API
exports.build = build;

// When run as single script.
if (module.id === ".") {
	build(function (err, results) {
		if (err) {
			console.error(err.toString().red);
			process.exit(1);
		} else {
			process.exit(0);
		}
	});
}