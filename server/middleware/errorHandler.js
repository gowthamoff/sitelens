const { error } = require("../utils/response");

/**
 * Centered error handler — mount this LAST in server.js.
 * This catches all next(err) calls across all 9 analysis modules.
 */
module.exports = (err, req, res, next) => {
  console.error(`[🚨 Analysis Error]`, {
    message: err.message,
    code: err.code,
    path: req.path,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });

  const statusCode = err.status || 500;
  
  res.status(statusCode).json(
    error(
      err.message || 'Internal server error occurred during spatial analysis',
      statusCode,
      err.hint || 'Check DB connectivity and spatial parameters'
    )
  );
};
