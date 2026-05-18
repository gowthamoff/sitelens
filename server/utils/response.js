/**
 * Standardized Success and Error response wrappers.
 * Every API endpoint will return the same JSON shape.
 */
module.exports = {
  success: (data) => ({
    ok: true,
    timestamp: new Date().toISOString(),
    data
  }),
  
  error: (message, code = 500, hint = null) => ({
    ok: false,
    timestamp: new Date().toISOString(),
    error: message,
    code,
    hint
  })
};
