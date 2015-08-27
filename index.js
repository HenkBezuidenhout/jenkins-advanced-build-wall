var EXPRESS = require('express');
var PATH = require('path');
var LESS = require('less');
var LESS_MIDDLEWARE = require('less-middleware');
var NODE_REST_CLIENT = require('node-rest-client').Client;
var JENKINS = require('jenkins-api');
var QUERY_STRING = require('querystring');

var SonarQubeUrl = 'http://nvi-prd-jen01.nvisionit.co.za:9000';
var JenkinsUrl = 'http://nvi-prd-jen01.nvisionit.co.za:8080';

var DataCache = [null];

var _express = EXPRESS();

var _jenkins = new NODE_REST_CLIENT();
_jenkins.registerMethod("listAllJobs", JenkinsUrl + '/api/json?depth=0', 'GET');
_jenkins.registerMethod("getJobInfo", JenkinsUrl + '/job/${resource}/api/json?depth=5', 'GET');
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
	_jenkins.listAllJobs({}, function (data) {
		var jobs = data.jobs.slice(0, 16);

		var list = [];

		for (var job in jobs) {
			job = jobs[job];
			list[list.length] = job.name;
			if (!DataCache[job.name]) {
				DataCache[job.name] = {
					name: job.name,
					status: job.color
				};
			}
		}

		res.json(list);
	});
});

_express.get('/api/details', function (req, res) {
	var job_name = req.query.name;
	if (!DataCache[job_name]) {
		DataCache[job_name] = {
			name: job_name
		};
	}

	_jenkins.getJobInfo({
		path: {
			resource: job_name
		}
	},
		function (data) {
			var obj = DataCache[job_name];
			try {
				obj.scm = data.scm.type;
				obj.status = data.color;
				obj.name = data.displayName;
				obj.healthReport = data.healthReport;
				obj.build = {
					busy: data.lastBuild.building,
					name: data.lastBuild.displayName,
					progress: (data.lastBuild.building) ? data.lastBuild.executor.progress : 100,
					result: data.lastBuild.result,
					timestamp: data.lastBuild.timestamp,
					culprits: data.lastBuild.culprits
				};
				for (var action in data.lastBuild.actions) {
					action = data.lastBuild.actions[action];
					if (action.url) {
						var url = action.url.toLowerCase();
						var server = SonarQubeUrl.toLowerCase();
						var idx = 'index/';
						if (url.indexOf(server) >= 0 && url.lastIndexOf(idx) > 0) {
							var resource = url.substr(url.lastIndexOf(idx) + idx.length);
							if (obj.sonarqube) {
								obj.sonarqube.resource = resource;
							} else {
								obj.sonarqube = {
									resource: resource
								};
							}
						}
					} else if (action.urlName && action.urlName.indexOf('testReport') === 0){
						obj.tests = action;
					}
				}
			} catch (err) {
				console.log(err);
			}
		});
	var details = DataCache[job_name];
	if (details.sonarqube) {
		_sonarqube.getMetrics({
			parameters: {
				resource: details.sonarqube.resource,
				metrics: 'ncloc,coverage,new_coverage,sqale_index,sqale_rating,sqale_debt_ratio'
			},
			headers: { "Accept": "application/json" }
		}, function (data) {
			var obj = DataCache[job_name];

			data = data[0];
			for (var msr in data.msr) {
				msr = data.msr[msr];
				obj.sonarqube[msr.key] = msr.frmt_val;
			}
		});
	}
	res.json(details);
});


var server = _express.listen(3000, function () {
	var host = server.address().address;
	var port = server.address().port;

	console.log('Example app listening at http://%s:%s', host, port);
});