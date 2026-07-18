const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api/auth',
    createProxyMiddleware({
      target: 'https://ep-soft-glitter-a1tzldg1.auth.ap-southeast-1.aws.neon.tech',
      changeOrigin: true,
      secure: false,
      pathRewrite: {
        '^/api/auth': ''
      }
    })
  );
};
