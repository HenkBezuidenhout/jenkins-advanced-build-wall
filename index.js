var EXPRESS = require('express');
var PATH = require('path');
var LESS_MIDDLEWARE = require('less-middleware');
var NODE_REST_CLIENT = require('node-rest-client').Client;
var JENKINS = require('jenkins-api');
var QUERY_STRING = require('querystring');
var UNDERSCORE = require('underscore');

var _ = UNDERSCORE;

var SonarQubeUrl = 'http://nvi-prd-jen01.nvisionit.co.za:9000';
var JenkinsUrl = 'http://nvi-prd-jen01.nvisionit.co.za:8080';

var ViewName = "All";
var DataCache = {};

var _express = EXPRESS();

var _jenkins = new NODE_REST_CLIENT();
_jenkins.registerMethod("List", JenkinsUrl + '/view/${viewName}/api/json?depth=0', 'GET');
_jenkins.registerMethod("Overview", JenkinsUrl + '/job/${resource}/api/json?depth=0', 'GET');
_jenkins.registerMethod("Scm", JenkinsUrl + '/job/${resource}/scm/api/json?depth=0', 'GET');
_jenkins.registerMethod("Build", JenkinsUrl + '/job/${resource}/lastBuild/api/json?depth=0', 'GET');

_jenkins = _jenkins.methods;

var _sonarqube = new NODE_REST_CLIENT();
_sonarqube.registerMethod("getMetrics", SonarQubeUrl + '/api/resources', 'GET');
_sonarqube = _sonarqube.methods;

_express.use(LESS_MIDDLEWARE(__dirname + '/public', {
	dest: __dirname + '/public',
	enable: ['less'],
	force: true,
	debug: true
}));

_express.use(EXPRESS.static(__dirname + '/public'));
_express.use('/bower_components', EXPRESS.static(__dirname + '/bower_components'));

_express.get('/api/list', function (req, res) {

	_jenkins.List({
		path: {
			viewName: ViewName
		}
	}, function (data) {
		_.each(data.jobs, function (item) {
			var job_name = item.name;

			var obj = DataCache[job_name];
			if (!obj) {
				obj = {
					status: item.color
				};
				DataCache[job_name] = obj;
			}
		});

		var dataObjects = _.pluck(data.jobs, "name");

		res.json(dataObjects);
	}).on('error', function (err) {
		console.log(err);
	});
});

_express.get('/api/details', function (req, res) {
	var job_name = req.query.name;

	var obj = DataCache[job_name];
	if (!obj) {
		obj = {};
		DataCache[job_name] = obj;
	}
	_jenkins.Overview({ path: { resource: job_name } },
		function (data) {
			obj.status = data.color;
			obj.name = data.displayName;
			obj.reports = _.pluck(data.healthReport, "description");
		}).on('error', function (err) {
			console.log(err);
		});
	_jenkins.Scm({ path: { resource: job_name } },
		function (data) {
			obj.scm = data.type;
		}).on('error', function (err) {
			console.log(err);
		});

	_jenkins.Build({ path: { resource: job_name } },
		function (data) {
			obj.build = {
				busy: data.building,
				name: data.displayName,
				progress: (data.building) ? data.executor.progress : 100,
				result: data.result,
				timestamp: data.timestamp
			};
			obj.build.culprits = _.pluck(data.culprits, "fullName");
			if (obj.build.culprits.length === 0) {
				obj.build.culprits = _.chain(data.actions)
					.pluck("causes")
					.flatten()
					.compact().pluck("userName").compact().value();

			}
			
			
			// Find recorded unit tests from the last build
			{
				obj.tests = _.find(data.actions, function (action) {
					return action.urlName === "testReport";
				});
			}

			// Jenkins (or the SonarQube plugin) makes it hard to guess what the resource name is.
			// Its in the Actions list when it runs, and it has one field, a URL...
			// So we cannot guess for sure, we need the SonarQube server URL defined,
			// and a marker to start looking for the resource name.
			{
				var server = SonarQubeUrl.toLowerCase();
				var idx = 'index/';

				var sonarqube_url = _.chain(data.actions)
					.pluck("url") 					// Get all URL fields
					.compact()    					// Clear out the nulls
					.find(function (url) {			// Try and find the SonarQube URL
						url = url.toLowerCase();
						return url.indexOf(server) >= 0 && url.lastIndexOf(idx) > 0;
					})
					.value();						// Get the eventual value, if any.

				if (sonarqube_url) {

					var resource = sonarqube_url.substr(sonarqube_url.lastIndexOf(idx) + idx.length);
					_sonarqube.getMetrics({
						parameters: {
							resource: resource,
							metrics: 'ncloc,coverage,new_coverage,sqale_index,sqale_rating,sqale_debt_ratio'
						},
						headers: { "Accept": "application/json" }
					}, function (data) {
						data = data[0];
						obj.sonarqube = _.chain(data.msr)
							.map(function (item) {
								var msr = [item.key, item.frmt_val];
								return msr;
							})
							.object()
							.value();
					}).on('error', function (err) {
						console.log(err);
					});
				}
			}
		}).on('error', function (err) {
			console.log(err);
		});
	res.json(obj);
});


var server = _express.listen(3000, function () {
	var host = server.address().address;
	var port = server.address().port;

	console.log('Example app listening at http://%s:%s', host, port);
});