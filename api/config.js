module.exports = async function handler(req, res) {
  const { default: apiHandler } = await import("../lib/api/config.js");
  return apiHandler(req, res);
};
