module.exports = async function handler(req, res) {
  const { default: apiHandler } = await import("../lib/api/auth.mjs");
  return apiHandler(req, res);
};
