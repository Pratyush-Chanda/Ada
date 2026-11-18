module.exports = async function handler(req, res) {
  const { default: apiHandler } = await import("../lib/api/desmos.js");
  return apiHandler(req, res);
};
