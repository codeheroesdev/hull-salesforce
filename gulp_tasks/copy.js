var _ = require('lodash');
var merge = require('merge-stream');

module.exports = function(gulp, config){

  gulp.task('copy', function(){
    return merge(_.map(config.files, function(dest, src) {
      return gulp.src(src).pipe(gulp.dest(dest));
    }));
  });

}
