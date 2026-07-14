const backendPort = Number(process.env.BACKEND_PORT_HOST);

if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535) {
  throw new Error('BACKEND_PORT_HOST must be an integer between 1 and 65535.');
}

module.exports = {
  '/api': {
    target: `http://127.0.0.1:${backendPort}`,
    secure: false,
    changeOrigin: true,
    logLevel: 'debug'
  }
};
