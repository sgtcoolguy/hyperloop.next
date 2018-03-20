/* eslint-disable no-unused-expressions */
'use strict';

const should = require('should'),
	helper = require('./helper');

describe('var', function () {

	it('should generate var', function (done) {
		helper.generate(helper.getFixture('vars.h'), helper.getTempFile('vars.json'), function (err, json, sdk) {
			if (err) {
				return done(err);
			}
			should(json).be.an.object;
			should(sdk).be.an.object;
			should(json).have.property('metadata');
			should(json).not.have.property('classes');
			should(json).not.have.property('typedefs');
			should(json).not.have.property('protocols');
			should(json).not.have.property('enums');
			should(json).have.property('vars', {
				A: {
					framework: helper.getFixture('vars.h'),
					thirdparty: true,
					filename: helper.getFixture('vars.h'),
					introducedIn: '0.0.0',
					line: '1',
					name: 'A',
					type: 'int',
					value: '',
					encoding: 'i'
				},
				B: {
					framework: helper.getFixture('vars.h'),
					thirdparty: true,
					filename: helper.getFixture('vars.h'),
					introducedIn: '0.0.0',
					line: '2',
					name: 'B',
					type: 'int',
					value: '',
					encoding: 'i'
				}
			});
			should(json.metadata).have.property('api-version', '1');
			should(json.metadata).have.property('generated');
			should(json.metadata).have.property('min-version', sdk.minVersion);
			should(json.metadata).have.property('sdk-path', sdk.sdkPath);
			should(json.metadata).have.property('platform', 'ios');
			should(json.metadata.generated).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2,}Z/);
			done();
		});
	});

});
