var gulp = require('gulp');
var jest = require('jest-cli');

var pkg = require('./package.json');
var jestConfig = pkg.jest;

var gulp        = require('gulp');
var runSequence = require('run-sequence');
var config      = require('./gulp_tasks/config');

[
  'clean',
  'cloudfront',
  'copy',
  'deploy',
].map(function(task) { require('./gulp_tasks/' + task + '.js')(gulp, config);});


gulp.task('test', function(done) {
    jest.runCLI({ config : jestConfig }, ".", function(res) {
      done();
    });
});

gulp.task('tdd', function(done) {
    gulp.watch([ 'src/**/*.js' ], [ 'test' ]);
});


gulp.task('build', function(callback) {
  runSequence('clean', ['copy'], callback);
});

gulp.task('deploy', function(callback) {
  runSequence('build', 'gh:deploy', 'cloudfront', callback);
});

gulp.task('default', function() {
    // place code for your default task here
});


