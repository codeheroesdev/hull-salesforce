var outputFolder = 'dist';

module.exports = {
  outputFolder: outputFolder,
  files: {
    'manifest.json': outputFolder,
    'assets/*.html': outputFolder,
    'assets/*.png': outputFolder,
    'assets/*.md': outputFolder
  }
};

