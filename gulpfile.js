var gulp = require('gulp');
var jest = require('jest-cli');

var pkg = require('./package.json');
var jestConfig = pkg.jest;

gulp.task('test', function(done) {
    jest.runCLI({ config : jestConfig }, ".", function(res) {
      done();
    });
});

gulp.task('tdd', function(done) {
    gulp.watch([ 'src/**/*.js' ], [ 'test' ]);
});

gulp.task('default', function() {
    // place code for your default task here
});
