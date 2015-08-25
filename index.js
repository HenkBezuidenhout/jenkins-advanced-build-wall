var EXPRESS = require('express');
var PATH = require('path');
var LESS = require('less');
var LESS_MIDDLEWARE = require('less-middleware');
var HTTPS = require('https');
var HTTP = require('http');
var JENKINS = require('jenkins-api');

var _express = EXPRESS();
//var _jenkinsApiUrl = "https://www.jenkins-ci.org/api/json";
//var _jenkins = JENKINS.init("http://jenkins.nodejs.org/");
//var _jenkins = JENKINS.init("https://www.jenkins-ci.org/");
//var _jenkins = JENKINS.init("http://localhost:8080/");
var _jenkins = JENKINS.init("http://nvi-prd-jen01.nvisionit.co.za:8080/");

_express.use(LESS_MIDDLEWARE(__dirname + '/public', {
    force: true,
    debug: true
}));
_express.use(EXPRESS.static(__dirname + '/public'));
_express.use('/bower_components', EXPRESS.static(__dirname + '/bower_components'));

var cached_all_jobs = {};

_express.get('/all_jobs', function (req, res) {
    _jenkins.all_jobs(function (err, data) {
        if (err) {
            console.log(err);
        } else {
            cached_all_jobs = data;
        }
        res.json(cached_all_jobs);
    });
});
_express.get('/job_info', function (req, res) {
    console.log(req.query);
    _jenkins.job_info(req.query.name, function (err, data) {
        if (err) { return console.log(err); }
        res.json(data);
    });
});

var cached_build_reports = [null];

_express.get('/last_build_report', function (req, res) {
    var job_name = req.query.name;
    console.log(job_name);

    _jenkins.last_build_report(job_name, function (err, data) {
        console.log(data);
        if (err) {
            console.log(err);
        } else {
            cached_build_reports[job_name] = data;
            console.log(data);
        }
        res.json(cached_build_reports[job_name]);
    });
});

var server = _express.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);
});